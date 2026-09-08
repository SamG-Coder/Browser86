import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,cs=p.heap.alloc(24,true);return {p,m,cs,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 critical sections: recursive enter/try/leave update the x86 structure',()=>{
  const {m,cs,call}=setup();call('InitializeCriticalSection',cs);
  assert.equal(m.i32(cs+4),-1);assert.equal(m.u32(cs+8),0);
  call('EnterCriticalSection',cs);assert.equal(m.i32(cs+4),-2);assert.equal(m.u32(cs+12),8);
  assert.equal(call('TryEnterCriticalSection',cs),1);assert.equal(m.u32(cs+8),2);
  call('LeaveCriticalSection',cs);assert.equal(m.u32(cs+8),1);assert.equal(m.u32(cs+12),8);
  call('LeaveCriticalSection',cs);assert.equal(m.i32(cs+4),-1);assert.equal(m.u32(cs+8),0);assert.equal(m.u32(cs+12),0);
});
test('Win32 critical sections: Ex flags and single-processor spin behavior are consistent across constructors',()=>{
  const {m,cs,call}=setup();assert.equal(call('InitializeCriticalSectionEx',cs,4000,0x01000000),1);
  assert.equal(m.u32(cs),0xffffffff);assert.equal(m.u32(cs+20),0);assert.equal(call('SetCriticalSectionSpinCount',cs,8000),0);
  call('DeleteCriticalSection',cs);assert.equal(call('InitializeCriticalSectionAndSpinCount',cs,0xffffffff),1);assert.equal(m.u32(cs+20),0);
  call('DeleteCriticalSection',cs);assert.equal(call('InitializeCriticalSectionEx',cs,0,1),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(cs+4),0);
});
test('Win32 critical sections: lifecycle misuse produces diagnostics and failed access leaves counts unchanged',()=>{
  const {m,cs,call}=setup();assert.throws(()=>call('EnterCriticalSection',cs),e=>e.code==='CRITICAL_SECTION');call('InitializeCriticalSection',cs);
  assert.throws(()=>call('InitializeCriticalSection',cs),e=>e.code==='CRITICAL_SECTION');assert.throws(()=>call('LeaveCriticalSection',cs),e=>e.code==='CRITICAL_SECTION');
  call('EnterCriticalSection',cs);assert.throws(()=>call('DeleteCriticalSection',cs),e=>e.code==='CRITICAL_SECTION');assert.equal(m.u32(cs+8),1);
  call('LeaveCriticalSection',cs);call('DeleteCriticalSection',cs);assert.throws(()=>call('TryEnterCriticalSection',cs),e=>e.code==='CRITICAL_SECTION');
  call('InitializeCriticalSection',cs);assert.equal(call('TryEnterCriticalSection',cs),1);
});
test('Win32 critical sections: page validation is atomic and storage is isolated between guests',()=>{
  const a=setup(),b=setup(),page=0x60000000;a.m.map(page,4096,'rw','critical test');a.m.fill(page,4096,0xcc);
  assert.throws(()=>a.call('InitializeCriticalSectionEx',page+4080,0,0),e=>e.code==='ACCESS_VIOLATION');assert.equal(a.m.u32(page+4080),0xcccccccc);
  a.call('InitializeCriticalSection',page);a.m.protect(page,4096,'r');assert.throws(()=>a.call('EnterCriticalSection',page),e=>e.code==='ACCESS_VIOLATION');assert.equal(a.m.u32(page+8),0);
  a.call('InitializeCriticalSection',a.cs);assert.throws(()=>b.call('EnterCriticalSection',a.cs),e=>e.code==='CRITICAL_SECTION');
});
