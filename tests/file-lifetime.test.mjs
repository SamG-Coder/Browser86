import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
import {VirtualFileSystem} from '../src/runtime/vfs.js';
const INVALID=0xFFFFFFFF;
function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const str=(s,w=false)=>p.heap.string(s,w),name=str('lifetime.bin'),out=p.heap.alloc(128,true);
  const open=(access=0xC0000000,share=7,flags=0,creation=4)=>call('CreateFileA',name,access,share,0,creation,flags,0);
  const duplicate=(h,options=2)=>{assert.equal(call('DuplicateHandle',INVALID,h,INVALID,out,0,0,options),1);return m.u32(out);};
  return {p,m,call,str,name,out,open,duplicate};
}
test('Win32 lifetime: pending deletion retains data and ID until every independent and duplicate handle closes',()=>{
  const {p,m,call,str,name,out,open,duplicate}=setup();
  const h=open(),alias=duplicate(h),other=open();m.w32(out,0x04030201);
  call('WriteFile',h,out,4,out+8,0);const node=p.object(h).node,id=node.id,bytes=p.vfs.bytes;
  assert.equal(call('DeleteFileW',str('LIFETIME.BIN',true)),1);assert.equal(node.deletePending,true);
  for(const creation of [1,2,3,4,5]){assert.equal(open(0xC0000000,7,0,creation),INVALID);assert.equal(call('GetLastError'),5);}
  assert.equal(call('GetFileInformationByHandle',alias,out+32),1);assert.equal(m.u32(out+80),id);
  assert.equal(call('ReadFile',other,out+16,4,out+8,0),1);assert.equal(m.u32(out+16),0x04030201);
  assert.equal(call('WriteFile',alias,out,1,out+8,0),1);assert.equal(node.data.length,5);
  assert.equal(call('CloseHandle',h),1);assert.equal(call('CloseHandle',alias),1);
  assert.equal(p.vfs.get('lifetime.bin'),node);assert.equal(p.vfs.bytes,bytes+1);
  assert.equal(call('CloseHandle',other),1);assert.equal(p.vfs.exists('lifetime.bin'),false);assert.equal(p.vfs.bytes,bytes-4);
  const fresh=open();assert.notEqual(p.object(fresh).node.id,id);
  assert.equal(call('ReadFile',h,out,1,out+8,0),0);assert.equal(call('GetLastError'),6);
});
test('Win32 lifetime: DELETE access and FILE_SHARE_DELETE are checked in both directions',()=>{
  const {call,name,out,open}=setup();
  const h=open(0xC0000000,3);
  assert.equal(call('DeleteFileA',name),0);assert.equal(call('GetLastError'),32);
  assert.equal(open(0x10000,7),INVALID);assert.equal(call('GetLastError'),32);
  assert.equal(open(0xC0000000,7,0x04000000),INVALID);assert.equal(call('GetLastError'),32);
  call('CloseHandle',h);const deleter=open(0x10000,7);
  assert.equal(open(0x80000000,3),INVALID);assert.equal(call('GetLastError'),32);
  const compatible=open(0x80000000,7);assert.notEqual(compatible,INVALID);
  assert.equal(call('GetFileInformationByHandle',deleter,out),1);
});
test('Win32 lifetime: delete-on-close tracks open objects rather than closing the first duplicate',()=>{
  const {p,call,open,duplicate}=setup();
  const h=open(0xC0000000,7,0x04000000),alias=duplicate(h),other=open();
  const moved=duplicate(alias,3);assert.equal(p.object(alias),null);
  const node=p.object(h).node;assert.equal(node.deletePending,undefined);
  assert.equal(call('CloseHandle',h),1);assert.equal(node.deletePending,undefined);
  assert.equal(call('CloseHandle',moved),1);assert.equal(node.deletePending,true);
  assert.equal(open(),INVALID);assert.equal(call('GetLastError'),5);
  assert.equal(call('CloseHandle',other),1);assert.equal(p.vfs.exists('lifetime.bin'),false);
});
test('Win32 lifetime: CLOSE_SOURCE failure still releases a final delete-on-close reference',()=>{
  const {p,call,open,out,duplicate}=setup();
  let h=open(0xC0000000,7,0x04000000);
  assert.equal(call('DuplicateHandle',INVALID,h,123,out,0,0,3),0);assert.equal(call('GetLastError'),6);
  assert.equal(p.vfs.exists('lifetime.bin'),false);
  h=open(0xC0000000,7,0x04000000);
  const moved=duplicate(h,3);assert.equal(p.vfs.exists('lifetime.bin'),true);
  assert.equal(call('CloseHandle',moved),1);assert.equal(p.vfs.exists('lifetime.bin'),false);
});
test('Win32 lifetime: snapshots exclude pending and delete-on-close files; exit/stop/fault force file cleanup',()=>{
  for(const terminal of ['exit','stop','fault']){
    const {p,call,open,str}=setup(),h=open(0xC0000000,7,0x04000000);
    call('SetHandleInformation',h,2,2);
    assert.equal(p.vfs.snapshot().some(e=>e.path.endsWith('lifetime.bin')),false);
    assert.equal(new VirtualFileSystem(p.vfs.snapshot()).exists('lifetime.bin'),false);
    const regular=call('CreateFileA',str('keep.bin'),0x40000000,7,0,2,0,0);assert.notEqual(regular,INVALID);
    if(terminal==='fault')p.fault(new Error('test termination'));else p[terminal]();
    assert.equal(p.vfs.exists('lifetime.bin'),false);assert.equal(p.vfs.exists('keep.bin'),true);
    assert.equal([...p.handles.values()].some(f=>f.type==='file'),false);
  }
});
test('Win32 lifetime: VFS path operations and copies cannot bypass pending deletion or sharing',()=>{
  const {p,call,open,name,str}=setup(),h=open(0xC0000000,0);
  assert.equal(call('CopyFileA',name,str('copy.bin'),0),0);assert.equal(call('GetLastError'),32);
  call('CloseHandle',h);const shared=open();assert.equal(call('DeleteFileA',name),1);
  assert.throws(()=>p.vfs.readFile('lifetime.bin'),e=>e.code==='VFS_DELETE_PENDING');
  assert.throws(()=>p.vfs.writeFile('lifetime.bin',Uint8Array.of(9)),e=>e.code==='VFS_DELETE_PENDING');
  assert.throws(()=>p.vfs.remove('lifetime.bin'),e=>e.code==='VFS_SHARING');
  assert.equal(call('CopyFileA',name,str('copy.bin'),0),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('MoveFileA',name,str('moved.bin')),0);assert.equal(call('GetLastError'),5);
  assert.equal(p.vfs.snapshot().some(e=>e.path.endsWith('lifetime.bin')),false);
  call('CloseHandle',shared);assert.equal(p.vfs.exists('lifetime.bin'),false);
});
test('Win32 lifetime: inherited handles, readonly create flags and metadata-only directory restrictions',()=>{
  const {p,m,call,str,name,out,open}=setup();m.w32(out,12);m.w32(out+8,1);
  const h=call('CreateFileA',name,0xC0000000,7,out,2,3,0);assert.notEqual(h,INVALID);
  call('GetHandleInformation',h,out+16);assert.equal(m.u32(out+16),1);assert.equal(call('GetFileAttributesA',name),3);
  assert.equal(open(0xC0000000,7,0x04000000),INVALID);assert.equal(call('GetLastError'),5);
  p.vfs.mkdir('directory');
  assert.throws(()=>call('CreateFileA',str('directory'),0,7,0,3,0x06000000,0),e=>e.code==='UNSUPPORTED_IO');
  assert.equal(open(0,8),INVALID);assert.equal(call('GetLastError'),87);
});
