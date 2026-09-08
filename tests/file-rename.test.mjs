import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=s=>p.heap.string(s);
  const out=p.heap.alloc(1024,true),name=str('rename.bin');
  const h=call('CreateFileA',name,0xC0010000,7,0,2,0,0);
  const rename=(text,replace=false,root=0,handle=h)=>{
    m.fill(out,1024);m.w8(out,replace?1:0);m.w32(out+4,root);m.w32(out+8,text.length*2);
    for(let i=0;i<text.length;i++)m.w16(out+12+i*2,text.charCodeAt(i));
    return call('SetFileInformationByHandle',handle,3,out,Math.max(16,12+text.length*2));
  };
  return {p,m,call,str,out,name,h,rename};
}
test('Win32 rename: shared file identity, cursor and metadata survive Unicode and case-only rename',()=>{
  const {p,m,call,out,h,rename}=setup();m.w32(out,0x04030201);call('WriteFile',h,out,4,out+32,0);
  call('DuplicateHandle',0xffffffff,h,0xffffffff,out+32,0,0,2);const alias=m.u32(out+32),node=p.object(h).node,times={...node.times},bytes=p.vfs.bytes;
  assert.equal(rename('😀-file.bin'),1);assert.equal(p.vfs.exists('rename.bin'),false);
  assert.equal(p.object(alias).node,node);assert.equal(p.object(alias).position,4n);assert.deepEqual(node.times,times);assert.equal(p.vfs.bytes,bytes);
  assert.equal(rename('😀-FILE.bin'),1);assert.equal(node.path,'C:/app/😀-FILE.bin');
  call('SetFilePointer',alias,0,0,0);assert.equal(call('ReadFile',h,out+32,4,out+40,0),1);assert.equal(m.u32(out+32),0x04030201);
});
test('Win32 rename: current directory and directory-handle roots resolve relative names',()=>{
  const {p,call,str,h,rename}=setup();p.vfs.mkdir('folder');
  const root=call('CreateFileA',str('folder'),0,7,0,3,0x02000000,0);
  assert.equal(rename('relative.bin',false,root),1);assert.equal(p.object(h).path,'C:/app/folder/relative.bin');
  assert.equal(rename('C:/Temp/absolute.bin'),1);assert.equal(p.object(h).path,'C:/Temp/absolute.bin');
  assert.equal(rename('missing/child.bin'),0);assert.equal(call('GetLastError'),3);assert.equal(p.vfs.exists('missing'),false);
  assert.equal(rename('next.bin',false,h),0);assert.equal(call('GetLastError'),6);
});
test('Win32 rename: replacement releases destination quota but rejects open, readonly and directory targets',()=>{
  const {p,call,str,h,rename}=setup();p.vfs.writeFile('target.bin',Uint8Array.of(1,2,3));
  const source=p.object(h).node,target=p.vfs.get('target.bin'),bytes=p.vfs.bytes;
  assert.equal(rename('target.bin'),0);assert.equal(call('GetLastError'),183);
  const opened=call('CreateFileA',str('target.bin'),0x80000000,7,0,3,0,0);
  assert.equal(rename('target.bin',true),0);assert.equal(call('GetLastError'),5);call('CloseHandle',opened);
  call('SetFileAttributesA',str('target.bin'),1);assert.equal(rename('target.bin',true),0);assert.equal(call('GetLastError'),5);
  assert.equal(p.vfs.get('rename.bin'),source);assert.equal(p.vfs.get('target.bin'),target);assert.equal(p.vfs.bytes,bytes);
  call('SetFileAttributesA',str('target.bin'),128);assert.equal(rename('target.bin',true),1);
  assert.equal(p.vfs.get('target.bin'),source);assert.equal(p.vfs.bytes,bytes-3);
  p.vfs.mkdir('directory');assert.equal(rename('directory',true),0);assert.equal(call('GetLastError'),5);
});
test('Win32 rename: pending files, DELETE access, invalid paths and unsupported modes preserve the source',()=>{
  const {p,call,str,name,h,rename}=setup();
  const reader=call('CreateFileA',name,0x80000000,7,0,3,0,0);
  assert.equal(rename('other.bin',false,0,reader),0);assert.equal(call('GetLastError'),5);
  assert.equal(rename('bad*name'),0);assert.equal(call('GetLastError'),123);
  assert.equal(rename('D:/other.bin'),0);assert.equal(call('GetLastError'),17);
  assert.throws(()=>rename(':stream'),e=>e.code==='UNSUPPORTED_FILE_INFO');
  call('DeleteFileA',name);assert.equal(rename('other.bin'),0);assert.equal(call('GetLastError'),5);assert.equal(p.vfs.get('rename.bin'),p.object(h).node);
});
test('Win32 rename: x86 input bounds and inaccessible UTF-16 data fail before filesystem mutation',()=>{
  const {p,m,call,out,h,rename}=setup();rename('rename.bin');
  const revision=p.vfs.revision;
  assert.equal(call('SetFileInformationByHandle',h,3,out,15),0);assert.equal(call('GetLastError'),24);
  for(const length of [0,1,65536,100]){m.w32(out+8,length);assert.equal(call('SetFileInformationByHandle',h,3,out,16),0);assert.equal(call('GetLastError'),87);}
  const address=0x60000000;m.map(address,4096,'rw','rename input');m.w32(address+4088,0);m.w32(address+4092,4);
  assert.throws(()=>call('SetFileInformationByHandle',h,3,address+4084,16),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.vfs.revision,revision);assert.equal(p.object(h).path,'C:/app/rename.bin');
});
