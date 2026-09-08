import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=s=>p.heap.string(s);
  const out=p.heap.alloc(64,true),name=str('disposition.bin');
  const open=(flags=0,access=0xC0010000,share=7)=>call('CreateFileA',name,access,share,0,4,flags,0);
  const set=(h,value)=>{m.w8(out,value);return call('SetFileInformationByHandle',h,4,out,1);};
  return {p,m,call,str,out,name,open,set};
}

test('Win32 disposition: cancellation through independent handles restores names, links and snapshots',()=>{
  const {p,m,call,out,name,open,set}=setup(),a=open(),b=open(),node=p.object(a).node;
  assert.equal(set(a,1),1);assert.equal(node.deletePending,true);
  assert.equal(open(),0xffffffff);assert.equal(call('GetLastError'),5);
  assert.equal(p.vfs.snapshot().some(e=>e.id===node.id),false);
  assert.equal(call('GetFileInformationByHandleEx',b,1,out,24),1);assert.equal(m.u32(out+16),0);
  call('CloseHandle',a);assert.equal(set(b,0),1);
  assert.equal(node.deletePending,false);assert.equal(p.vfs.snapshot().some(e=>e.id===node.id),true);
  assert.equal(call('GetFileInformationByHandleEx',b,1,out,24),1);assert.equal(m.u32(out+16),1);
  const fresh=open();assert.notEqual(fresh,0xffffffff);assert.equal(p.object(fresh).node,node);
  call('CloseHandle',b);call('CloseHandle',fresh);assert.equal(p.vfs.get('disposition.bin'),node);
});

test('Win32 disposition: duplicate final-close, exclusive opens and DeleteFile cancellation use shared state',()=>{
  const {p,m,call,out,name,open,set}=setup();let h=open(0,0xC0010000,0);
  call('DuplicateHandle',0xffffffff,h,0xffffffff,out+8,0,0,2);const alias=m.u32(out+8);
  assert.equal(set(h,255),1);call('CloseHandle',h);assert.equal(p.vfs.exists('disposition.bin'),true);
  call('CloseHandle',alias);assert.equal(p.vfs.exists('disposition.bin'),false);
  h=open();assert.equal(call('DeleteFileA',name),1);assert.equal(set(h,0),1);
  call('CloseHandle',h);assert.equal(p.vfs.exists('disposition.bin'),true);
});

test('Win32 disposition: cancellation cannot suppress delete-on-close or termination cleanup',()=>{
  for(const mode of ['close','exit','stop','fault']){
    const {p,call,open,set}=setup(),h=open(0x04000000),other=open();
    assert.equal(set(h,1),1);assert.equal(set(other,0),1);
    assert.equal(p.vfs.snapshot().some(e=>e.path.endsWith('disposition.bin')),false);
    if(mode==='close'){call('CloseHandle',h);assert.equal(p.object(other).node.deletePending,true);call('CloseHandle',other);}
    else if(mode==='fault')p.fault(new Error('fixture'));else p[mode]();
    assert.equal(p.vfs.exists('disposition.bin'),false);
  }
});

test('Win32 disposition: empty directory deletion blocks child creation and supports cancellation',()=>{
  const {p,call,str,set}=setup();p.vfs.mkdir('directory');
  const h=call('CreateFileA',str('directory'),0x10000,7,0,3,0x02000000,0);
  assert.equal(set(h,1),1);
  assert.equal(call('CreateFileA',str('directory/child'),0x40000000,7,0,2,0,0),0xffffffff);assert.equal(call('GetLastError'),5);
  assert.throws(()=>p.vfs.mkdir('directory/child'),e=>e.code==='VFS_DELETE_PENDING');
  assert.throws(()=>p.vfs.writeFile('directory/child',Uint8Array.of(1)),e=>e.code==='VFS_DELETE_PENDING');
  assert.equal(set(h,0),1);p.vfs.writeFile('directory/child',Uint8Array.of(1));
  assert.equal(set(h,1),0);assert.equal(call('GetLastError'),145);assert.equal(p.object(h).node.deletePending,false);
  p.vfs.remove('directory/child');assert.equal(set(h,1),1);call('CloseHandle',h);
  assert.equal(p.vfs.exists('directory'),false);
});

test('Win32 disposition: DELETE permission, readonly files, root protection and invalid inputs are atomic',()=>{
  const {p,m,call,str,out,name,open,set}=setup(),h=open(),reader=open(0,0x80000000),node=p.object(h).node;
  for(const value of [0,1]){assert.equal(set(reader,value),0);assert.equal(call('GetLastError'),5);}
  call('SetFileAttributesA',name,1);assert.equal(set(h,1),0);assert.equal(call('GetLastError'),5);assert.equal(set(h,0),1);
  const root=call('CreateFileA',str('C:/'),0x10000,7,0,3,0x02000000,0);
  assert.equal(set(root,1),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('SetFileInformationByHandle',h,4,out,0),0);assert.equal(call('GetLastError'),24);
  assert.equal(call('SetFileInformationByHandle',h,4,0,1),0);assert.equal(call('GetLastError'),87);
  assert.throws(()=>call('SetFileInformationByHandle',h,4,0x60000000,1),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(node.deletePending,false);assert.equal(p.vfs.exists('disposition.bin'),true);
});
