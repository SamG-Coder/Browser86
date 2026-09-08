import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const str=s=>p.heap.string(s),out=p.heap.alloc(64,true),name=str('resize.bin');
  const h=call('CreateFileA',name,0xC0000000,7,0,2,0,0);
  m.w32(out,0x04030201);call('WriteFile',h,out,4,out+16,0);
  const set=(length,handle=h)=>{const n=BigInt.asUintN(64,length);m.w32(out,Number(n&0xffffffffn));m.w32(out+4,Number(n>>32n));return call('SetFileInformationByHandle',handle,6,out,8);};
  return {p,m,call,str,out,name,h,set};
}

test('Win32 set info: explicit EOF grows, truncates and clears data without moving shared or independent cursors',()=>{
  const {p,m,call,out,name,h,set}=setup();
  call('DuplicateHandle',0xffffffff,h,0xffffffff,out+24,0,0,2);const alias=m.u32(out+24);
  const other=call('CreateFileA',name,0x80000000,7,0,3,0,0);
  const id=p.object(h).node.id;
  assert.equal(set(8n,alias),1);assert.deepEqual([...p.object(h).node.data],[1,2,3,4,0,0,0,0]);
  assert.equal(p.object(alias).position,4n);assert.equal(p.object(other).position,0n);
  assert.equal(set(2n),1);assert.deepEqual([...p.object(other).node.data],[1,2]);
  assert.equal(p.object(h).position,4n);assert.equal(p.object(h).node.id,id);
  assert.equal(set(0n),1);assert.equal(p.object(h).node.data.length,0);
});

test('Win32 set info: negative and exact 64-bit oversized lengths fail atomically with quota accounting',()=>{
  const {p,call,h,set}=setup(),node=p.object(h).node,bytes=p.vfs.bytes,revision=p.vfs.revision;
  for(const [length,error] of [[-1n,87],[-0x8000000000000000n,87],[0x20000000000001n,112],[0x7fffffffffffffffn,112]]){
    assert.equal(set(length),0);assert.equal(call('GetLastError'),error);
    assert.deepEqual([...node.data],[1,2,3,4]);assert.equal(p.vfs.bytes,bytes);assert.equal(p.vfs.revision,revision);
    assert.equal(p.object(h).position,4n);
  }
  p.vfs.limit=bytes+4;assert.equal(set(8n),1);assert.equal(set(9n),0);assert.equal(call('GetLastError'),112);
  assert.equal(set(2n),1);assert.equal(p.vfs.bytes,bytes-2);
});

test('Win32 set info: pending files resize through existing handles and retain suppressed timestamps',()=>{
  const {p,m,call,out,name,h,set}=setup(),node=p.object(h).node;
  m.w32(out,0xffffffff);m.w32(out+4,0xffffffff);call('SetFileTime',h,0,out,out);
  const times={...node.times};call('DeleteFileA',name);
  assert.equal(set(8n),1);assert.equal(node.deletePending,true);assert.deepEqual(node.times,times);
  call('CloseHandle',h);assert.equal(p.vfs.exists('resize.bin'),false);
});

test('Win32 set info: invalid handles, denied rights, directories, short structures and unsupported classes',()=>{
  const {p,call,str,out,name,h,set}=setup();
  const readonly=call('CreateFileA',name,0x80000000,7,0,3,0,0);
  assert.equal(set(2n,readonly),0);assert.equal(call('GetLastError'),5);
  p.vfs.mkdir('folder');const directory=call('CreateFileA',str('folder'),0,7,0,3,0x02000000,0);
  assert.equal(set(2n,directory),0);assert.equal(call('GetLastError'),5);
  assert.equal(set(2n,11),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('SetFileInformationByHandle',h,6,out,7),0);assert.equal(call('GetLastError'),24);
  assert.equal(call('SetFileInformationByHandle',h,6,0,8),0);assert.equal(call('GetLastError'),87);
  for(const cls of [1,2,7,9,18,25,0xffffffff]){assert.equal(call('SetFileInformationByHandle',h,cls,out,64),0);assert.equal(call('GetLastError'),87);}
  for(const cls of [0,3,4,5,12,21,22,23])assert.throws(()=>call('SetFileInformationByHandle',h,cls,out,64),e=>e.code==='UNSUPPORTED_FILE_INFO');
  assert.deepEqual([...p.object(h).node.data],[1,2,3,4]);
});

test('Win32 set info: input validation precedes mutation and accepts read-only input memory',()=>{
  const {p,m,call,h}=setup(),address=0x60000000;m.map(address,4096,'rw','EOF input');m.w32(address+4092,2);
  assert.throws(()=>call('SetFileInformationByHandle',h,6,address+4092,8),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.object(h).node.data.length,4);
  m.w32(address,2);m.w32(address+4,0);m.protect(address,4096,'r');
  assert.equal(call('SetFileInformationByHandle',h,6,address,0xffffffff),1);assert.equal(p.object(h).node.data.length,2);
});
