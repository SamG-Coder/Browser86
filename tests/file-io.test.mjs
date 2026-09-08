import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
const INVALID=0xFFFFFFFF;
function setup(access=0xC0000000){
  const {p}=guest('HelloConsole.exe');
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const name=p.heap.string('seek.bin'),out=p.heap.alloc(32,true),data=p.heap.string('abcdef');
  p.vfs.writeFile('seek.bin',Uint8Array.of(1,2,3,4));
  const h=call('CreateFileA',name,access,3,0,3,0,0);
  const seek=(distance,method=0,output=out)=>{const bits=BigInt.asUintN(64,distance);return call('SetFilePointerEx',h,Number(bits&0xFFFFFFFFn),Number(bits>>32n),output,method);};
  const result=()=>BigInt(p.memory.u32(out))|(BigInt(p.memory.u32(out+4))<<32n);
  return {p,call,name,out,data,h,seek,result};
}
test('Win32 files: exact 64-bit cursors above quota and JS integer range allocate no disk storage',()=>{
  const {p,call,h,seek,result,out}=setup(),bytes=p.vfs.bytes,revision=p.vfs.revision;
  for(const n of [0xFFFFFFFFn,0x100000000n,0x20000000000003n,0x7FFFFFFFFFFFFFFFn]){
    assert.equal(seek(n),1);assert.equal(result(),n);
    assert.equal(seek(-1n,1),1);assert.equal(result(),n-1n);
  }
  assert.equal(seek(2n,1),0);assert.equal(call('GetLastError'),87);
  assert.equal(p.object(h).position,0x7FFFFFFFFFFFFFFEn);
  assert.equal(p.vfs.bytes,bytes);assert.equal(p.vfs.revision,revision);
  assert.equal(call('DuplicateHandle',INVALID,h,INVALID,out+8,0,0,2),1);
  const alias=p.memory.u32(out+8);
  assert.equal(call('SetFilePointerEx',alias,3,0,0,0),1);assert.equal(seek(0n,1),1);assert.equal(result(),3n);
  assert.equal(seek(-2n,2),1);assert.equal(result(),2n);
});
test('Win32 files: legacy seek high words, signed relative offsets and ambiguous success sentinel',()=>{
  const {p,call,h,out,seek,result}=setup();
  p.memory.w32(out,0);
  assert.equal(call('SetFilePointer',h,INVALID,out,0),INVALID);assert.equal(call('GetLastError'),0);
  assert.equal(p.memory.u32(out),0);
  assert.equal(call('SetFilePointer',h,1,0,1),INVALID);assert.equal(call('GetLastError'),87);
  assert.equal(p.object(h).position,0xFFFFFFFFn);
  p.memory.w32(out,1);
  assert.equal(call('SetFilePointer',h,9,out,0),9);assert.equal(p.memory.u32(out),1);
  p.memory.w32(out,INVALID);
  assert.equal(call('SetFilePointer',h,0xFFFFFFF6,out,1),INVALID);assert.equal(call('GetLastError'),0);
  assert.equal(p.memory.u32(out),0);
  assert.equal(seek(-5n,2),0);assert.equal(call('GetLastError'),131);
  assert.equal(seek(0n,1),1);assert.equal(result(),0xFFFFFFFFn);
  assert.equal(call('SetFilePointer',h,INVALID,0,0),INVALID);assert.equal(call('GetLastError'),131);
});
test('Win32 files: EOF reads and zero-byte writes leave large cursors and disk contents unchanged',()=>{
  const {p,call,h,seek,out,data}=setup();assert.equal(seek(0x20000000000003n),1);
  const position=p.object(h).position,revision=p.vfs.revision,size=p.vfs.bytes;
  assert.equal(call('ReadFile',h,out+8,16,out+24,0),1);assert.equal(p.memory.u32(out+24),0);
  assert.equal(call('WriteFile',h,0,0,out+24,0),1);assert.equal(p.memory.u32(out+24),0);
  assert.equal(p.vfs.revision,revision);assert.equal(p.vfs.bytes,size);assert.equal(p.object(h).position,position);
  assert.equal(call('WriteFile',h,data,1,out+24,0),0);assert.equal(call('GetLastError'),112);
  assert.equal(call('SetEndOfFile',h),0);assert.equal(call('GetLastError'),112);
  assert.equal(p.vfs.revision,revision);assert.equal(p.object(h).position,position);
});
test('Win32 files: writes zero-fill gaps, truncation preserves cursor and quota failure is atomic',()=>{
  const {p,call,h,seek,out,data}=setup();p.vfs.limit=p.vfs.bytes+4;
  assert.equal(seek(6n),1);assert.equal(call('WriteFile',h,data,2,out,0),1);
  assert.deepEqual(p.vfs.readFile('seek.bin'),Uint8Array.of(1,2,3,4,0,0,97,98));
  const bytes=p.vfs.bytes,revision=p.vfs.revision;
  assert.equal(call('WriteFile',h,data,1,out,0),0);assert.equal(call('GetLastError'),112);
  assert.equal(p.memory.u32(out),0);assert.equal(p.vfs.bytes,bytes);assert.equal(p.vfs.revision,revision);
  assert.equal(seek(2n),1);assert.equal(call('SetEndOfFile',h),1);assert.equal(p.object(h).position,2n);
  assert.deepEqual(p.vfs.readFile('seek.bin'),Uint8Array.of(1,2));
  assert.equal(seek(5n),1);assert.equal(call('SetEndOfFile',h),1);
  assert.deepEqual(p.vfs.readFile('seek.bin'),Uint8Array.of(1,2,0,0,0));
});
test('Win32 files: invalid output pages do not change cursor or file data',()=>{
  const {p,call,h,out,seek,data}=setup();p.memory.map(0x50000000,4096,'rw','output boundary');
  const end=0x50000FFC;p.memory.w32(end,0x12345678);
  assert.throws(()=>seek(10n,0,end),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.memory.u32(end),0x12345678);assert.equal(p.object(h).position,0n);
  p.memory.protect(0x50000000,4096,'r');
  assert.throws(()=>call('SetFilePointer',h,10,end,0),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.object(h).position,0n);
  const old=p.vfs.readFile('seek.bin').slice();
  assert.throws(()=>call('WriteFile',h,data,1,end,0),e=>e.code==='ACCESS_VIOLATION');
  assert.deepEqual(p.vfs.readFile('seek.bin'),old);
  assert.equal(call('GetFileSizeEx',h,out),1);assert.equal(p.memory.u32(out),4);assert.equal(p.memory.u32(out+4),0);
});
test('Win32 files: access checks, invalid methods/handles and unsupported I/O remain explicit',()=>{
  const t=setup(0);assert.equal(t.seek(1n),0);assert.equal(t.call('GetLastError'),5);
  assert.equal(t.call('SetEndOfFile',t.h),0);assert.equal(t.call('GetLastError'),5);
  const r=setup(0x80000000);assert.equal(r.call('FlushFileBuffers',r.h),0);assert.equal(r.call('GetLastError'),5);
  assert.equal(r.seek(0n,99),0);assert.equal(r.call('GetLastError'),87);
  assert.equal(r.call('SetFilePointerEx',0,0,0,0,0),0);assert.equal(r.call('GetLastError'),6);
  assert.throws(()=>r.call('CreateFileA',r.name,0x80000000,3,0,3,0x20000000,0),e=>e.code==='UNSUPPORTED_IO');
  assert.throws(()=>r.call('ReadFile',r.h,r.out,1,0,r.out+8),e=>e.code==='UNSUPPORTED_IO');
});
