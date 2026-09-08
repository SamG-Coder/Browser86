import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}

test('Win32 TLS: freed indices are reused and zeroed without freeing guest pointer data',()=>{
  const {p,m,call}=setup(),a=call('TlsAlloc'),b=call('TlsAlloc'),value=p.heap.alloc(4,true);m.w32(value,123);
  assert.equal(call('TlsSetValue',a,value),1);assert.equal(call('TlsGetValue',a),value);
  assert.equal(call('TlsFree',a),1);assert.equal(m.u32(value),123);
  assert.equal(call('TlsGetValue',a),0);assert.equal(call('GetLastError'),0);
  assert.equal(call('TlsAlloc'),a);assert.equal(call('TlsGetValue',a),0);assert.equal(call('TlsGetValue',b),0);
});
test('Win32 TLS: guest TEB and expansion slots are authoritative and separate from static PE TLS',()=>{
  const {p,m,call}=setup(),staticTls=m.u32(p.teb+0x2c);const indices=Array.from({length:65},()=>call('TlsAlloc'));
  call('TlsSetValue',indices[0],0xffffffff);assert.equal(m.u32(p.teb+0xe10),0xffffffff);
  m.w32(p.teb+0xe10,0xabcdef01);assert.equal(call('TlsGetValue',0),0xabcdef01);
  const expansion=m.u32(p.teb+0xf94);assert.ok(expansion);assert.notEqual(expansion,staticTls);
  call('TlsSetValue',64,0x87654321);assert.equal(m.u32(expansion),0x87654321);
  m.w32(expansion,42);assert.equal(call('TlsGetValue2',64),42);call('TlsFree',64);assert.equal(m.u32(expansion),0);
  assert.equal(m.u32(p.teb+0x2c),staticTls);
});
test('Win32 TLS: exhaustion reports error 8 and freeing base or expansion slots recovers capacity',()=>{
  const {call}=setup(),indices=Array.from({length:1088},()=>call('TlsAlloc'));
  assert.equal(new Set(indices).size,1088);assert.equal(call('TlsAlloc'),0xffffffff);assert.equal(call('GetLastError'),8);
  for(const index of [5,64,1087]){call('TlsSetValue',index,0xffffffff);assert.equal(call('TlsFree',index),1);}
  for(const index of [5,64,1087]){assert.equal(call('TlsAlloc'),index);assert.equal(call('TlsGetValue',index),0);}
  assert.equal(call('TlsAlloc'),0xffffffff);
});
test('Win32 TLS: GetValue clears last error, GetValue2 preserves it, invalid frees and bounds are checked',()=>{
  const {p,call}=setup(),index=call('TlsAlloc');call('TlsSetValue',index,9);
  call('SetLastError',123);assert.equal(call('TlsGetValue2',index),9);assert.equal(call('GetLastError'),123);
  assert.equal(call('TlsGetValue',index),9);assert.equal(call('GetLastError'),0);
  assert.equal(call('TlsFree',index),1);assert.equal(call('TlsFree',index),0);assert.equal(call('GetLastError'),87);
  for(const bad of [1088,0xffffffff]){
    assert.equal(call('TlsSetValue',bad,1),0);assert.equal(call('GetLastError'),87);
    call('SetLastError',123);assert.equal(call('TlsGetValue2',bad),0);assert.equal(call('GetLastError'),123);
    assert.equal(call('TlsGetValue',bad),0);assert.equal(call('GetLastError'),87);
  }
});
test('Win32 TLS: unallocated in-range slots and process isolation follow the native bounds model',()=>{
  const a=setup(),b=setup();assert.equal(a.call('TlsGetValue',1087),0);assert.equal(a.call('GetLastError'),0);
  assert.equal(a.call('TlsSetValue',1087,123),1);assert.equal(a.call('TlsGetValue',1087),123);
  assert.equal(b.call('TlsGetValue',1087),0);assert.equal(a.call('TlsFree',1087),0);assert.equal(a.call('GetLastError'),87);
  assert.equal(b.m.u32(b.p.teb+0xf94),0);
});
