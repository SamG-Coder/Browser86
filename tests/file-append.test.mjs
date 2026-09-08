import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=s=>p.heap.string(s),out=p.heap.alloc(64,true),name=str('append.bin');
  p.vfs.writeFile('append.bin',Uint8Array.of(1,2));
  const open=(access=4,share=7,creation=3)=>call('CreateFileA',name,access,share,0,creation,0,0);
  const write=(h,n)=>{m.w8(out,n);return call('WriteFile',h,out,1,out+8,0);};
  return {p,m,call,str,out,name,open,write};
}
test('Win32 append: independent and duplicate handles always append at current EOF despite seeking',()=>{
  const {p,m,call,out,open,write}=setup(),a=open(),b=open();
  call('DuplicateHandle',0xffffffff,a,0xffffffff,out+16,0,0,2);const alias=m.u32(out+16);
  assert.equal(call('SetFilePointer',a,100,0,0),100);assert.equal(write(a,3),1);assert.equal(p.object(a).position,3n);
  assert.equal(write(b,4),1);assert.equal(call('SetFilePointer',alias,0,0,0),0);assert.equal(write(alias,5),1);
  assert.deepEqual([...p.object(a).node.data],[1,2,3,4,5]);assert.equal(p.object(a).position,5n);assert.equal(p.object(b).position,4n);
});
test('Win32 append: read/append seeks can read while write-data plus append retains positioned writes',()=>{
  const {p,m,call,out,open,write}=setup(),a=open(5),b=open(6);
  assert.equal(call('ReadFile',a,out,1,out+8,0),1);assert.equal(m.u8(out),1);
  assert.equal(write(a,3),1);assert.equal(p.object(a).position,3n);
  assert.equal(write(b,9),1);assert.deepEqual([...p.object(a).node.data],[9,2,3]);assert.equal(p.object(b).position,1n);
  assert.equal(call('SetEndOfFile',a),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('FlushFileBuffers',a),1);
});
test('Win32 append: sharing, readonly and creation dispositions enforce append access',()=>{
  const {call,name,open}=setup();let h=open(0x80000000,1);
  assert.equal(open(),0xffffffff);assert.equal(call('GetLastError'),32);call('CloseHandle',h);
  h=open();assert.equal(open(0,1),0xffffffff);assert.equal(call('GetLastError'),32);call('CloseHandle',h);
  assert.equal(open(4,7,5),0xffffffff);assert.equal(call('GetLastError'),87);
  h=open(4,7,2);assert.notEqual(h,0xffffffff);call('CloseHandle',h);
  call('SetFileAttributesA',name,1);assert.equal(open(),0xffffffff);assert.equal(call('GetLastError'),5);
});
test('Win32 append: zero writes, invalid buffers, quota failures and deletion preserve lifetime and cursor rules',()=>{
  const {p,m,call,out,name,open,write}=setup(),h=open(),node=p.object(h).node;
  call('SetFilePointer',h,100,0,0);assert.equal(call('WriteFile',h,0,0,out+8,0),1);assert.equal(p.object(h).position,100n);
  assert.throws(()=>call('WriteFile',h,0x60000000,1,out+8,0),e=>e.code==='ACCESS_VIOLATION');assert.equal(p.object(h).position,100n);
  p.vfs.limit=p.vfs.bytes;assert.equal(write(h,3),0);assert.equal(call('GetLastError'),112);assert.equal(p.object(h).position,100n);assert.deepEqual([...node.data],[1,2]);
  p.vfs.limit+=1;call('DeleteFileA',name);assert.equal(write(h,3),1);assert.deepEqual([...node.data],[1,2,3]);call('CloseHandle',h);assert.equal(p.vfs.exists('append.bin'),false);
});
