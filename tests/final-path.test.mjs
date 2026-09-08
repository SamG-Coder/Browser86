import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
import {normalizePath} from '../src/runtime/vfs.js';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=(s,w=false)=>p.heap.string(s,w),out=p.heap.alloc(1024,true);
  const name=str('final.bin'),h=call('CreateFileA',name,0,7,0,2,0,0);
  const query=(wide=true,capacity=512,flags=0,ptr=out,handle=h)=>call('GetFinalPathNameByHandle'+(wide?'W':'A'),handle,ptr,capacity,flags);
  return {p,m,call,str,out,name,h,query};
}
test('Win32 final paths: A/W DOS and volume-relative names agree across rename and pending deletion',()=>{
  const {p,m,call,str,out,name,h,query}=setup();
  for(const flags of [0,8]){assert.equal(query(true,512,flags),20);assert.equal(m.wstr(out),'\\\\?\\C:\\app\\final.bin');}
  for(const flags of [4,12]){query(false,512,flags);assert.equal(m.cstr(out),'\\app\\final.bin');}
  call('MoveFileW',str('final.bin',true),str('moved.bin',true));query();assert.equal(m.wstr(out),'\\\\?\\C:\\app\\moved.bin');
  call('DeleteFileA',str('moved.bin'));query(false);assert.equal(m.cstr(out),'\\\\?\\C:\\app\\moved.bin');
  assert.equal(p.object(h).node.deletePending,true);
});
test('Win32 final paths: short buffers preserve output and reproduce observed A/W size conventions',()=>{
  const {m,call,out,query}=setup(),path='\\\\?\\C:\\app\\final.bin';
  for(const wide of [false,true]){
    for(const capacity of [0,1,path.length]){
      m.fill(out,128,0xcc);assert.equal(query(wide,capacity),path.length+(wide?1:0));
      assert.deepEqual([...m.read(out,128)],Array(128).fill(0xcc));assert.equal(call('GetLastError'),wide?8:0);
    }
    assert.equal(query(wide,path.length+1),path.length);
    assert.equal(wide?m.u16(out+path.length*2):m.u8(out+path.length),0);
  }
});
test('Win32 final paths: extended DOS results reopen the same node and Unicode counts use UTF-16 units',()=>{
  const {p,m,call,str,out,h,query}=setup();call('MoveFileW',str('final.bin',true),str('€-😀.bin',true));
  const expected='\\\\?\\C:\\app\\€-😀.bin';assert.equal(query(),expected.length);assert.equal(m.wstr(out),expected);
  const reopened=call('CreateFileW',out,0,7,0,3,0,0);assert.notEqual(reopened,0xffffffff);assert.equal(p.object(reopened).node,p.object(h).node);
  query(false);assert.equal(m.u8(out+11),0x80);assert.equal(m.cstr(out),'\\\\?\\C:\\app\\€-?.bin');
  for(const value of ['\\\\?\\UNC\\host\\share','\\\\.\\C:\\x','\\\\?\\GLOBALROOT\\Device\\x'])assert.throws(()=>normalizePath(value),e=>e.code==='VFS_PATH');
  assert.throws(()=>normalizePath('\\\\?\\D:\\x'),e=>e.code==='VFS_DRIVE');
});
test('Win32 final paths: directory/root queries and invalid flags or handles are explicit',()=>{
  const {m,call,str,out,query}=setup();
  const root=call('CreateFileA',str('C:/'),0,7,0,3,0x02000000,0);
  assert.equal(query(true,512,4,out,root),1);assert.equal(m.wstr(out),'\\');
  for(const flags of [3,5,6,7,16,0xffffffff]){assert.equal(query(true,512,flags),0);assert.equal(call('GetLastError'),87);}
  for(const flags of [1,2,9,10])assert.throws(()=>query(true,512,flags),e=>e.code==='UNSUPPORTED_FILE_INFO');
  assert.equal(query(true,512,0,out,11),0);assert.equal(call('GetLastError'),6);
  assert.equal(query(true,512,0,0),0);assert.equal(call('GetLastError'),87);
});
test('Win32 final paths: complete output range is checked before writing, unused capacity is not accessed',()=>{
  const {m,out,query}=setup();const address=0x60000000;m.map(address,4096,'rw','final path output');m.fill(address,4096,0xcc);
  assert.throws(()=>query(true,512,0,address+4092),e=>e.code==='ACCESS_VIOLATION');assert.equal(m.u32(address+4092),0xcccccccc);
  assert.ok(query(false,0xffffffff,0,address+4000)>0);
  m.protect(address,4096,'r');assert.throws(()=>query(false,512,0,address),e=>e.code==='ACCESS_VIOLATION');
});
