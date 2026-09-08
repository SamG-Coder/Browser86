import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,address=p.heap.alloc(4,true);return {p,m,address,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 SRW: static and dynamic initialization support both modes and preserve last error',()=>{
  const {m,address,call}=setup();call('SetLastError',123);
  for(const mode of ['Shared','Exclusive']){
    assert.equal(call('AcquireSRWLock'+mode,address),0);assert.equal(m.u32(address),mode==='Shared'?17:1);
    assert.equal(call('TryAcquireSRWLockExclusive',address),0);call('ReleaseSRWLock'+mode,address);assert.equal(m.u32(address),0);
    assert.equal(call('TryAcquireSRWLock'+mode,address),1);call('ReleaseSRWLock'+mode,address);
  }
  m.w32(address,0xcccccccc);call('InitializeSRWLock',address);assert.equal(m.u32(address),0);assert.equal(call('GetLastError'),123);
});
test('Win32 SRW: exclusive ownership rejects both try modes without changing state',()=>{
  const {m,address,call}=setup();call('AcquireSRWLockExclusive',address);
  for(const mode of ['Shared','Exclusive']){assert.equal(call('TryAcquireSRWLock'+mode,address),0);assert.equal(m.u32(address),1);}
  call('ReleaseSRWLockExclusive',address);assert.equal(call('TryAcquireSRWLockShared',address),1);
});
test('Win32 SRW: conflicting acquisition suspends the CPU until lock release',()=>{
  for(const [held,wanted] of [['Exclusive','Shared'],['Exclusive','Exclusive'],['Shared','Exclusive']]){
    const {p,address,call}=setup();call('AcquireSRWLock'+held,address);let result;
    p.resolveResult(call('AcquireSRWLock'+wanted,address),value=>{result=value;});const count=p.cpu.instructions;
    p.tick(100,5);assert.equal(result,undefined);assert.equal(p.cpu.instructions,count);
    call('ReleaseSRWLock'+held,address);p.poll();assert.equal(result,0);assert.equal(p.waiting,null);call('ReleaseSRWLock'+wanted,address);
  }
});
test('Win32 SRW: invalid memory and mismatched releases fail without mutating locks',()=>{
  const {m,address,call}=setup();
  for(const name of ['InitializeSRWLock','AcquireSRWLockShared','TryAcquireSRWLockExclusive','ReleaseSRWLockShared']){
    assert.throws(()=>call(name,0),e=>e.code==='ACCESS_VIOLATION');assert.throws(()=>call(name,address+1),e=>e.code==='SRW_LOCK');
  }
  call('AcquireSRWLockShared',address);assert.throws(()=>call('ReleaseSRWLockExclusive',address),e=>e.code==='SRW_LOCK');assert.equal(m.u32(address),17);
  call('ReleaseSRWLockShared',address);assert.throws(()=>call('ReleaseSRWLockShared',address),e=>e.code==='SRW_LOCK');
  m.w32(address,2);assert.throws(()=>call('AcquireSRWLockExclusive',address),e=>e.code==='SRW_LOCK');assert.equal(m.u32(address),2);
  m.protect(address&~4095,4096,'r');assert.throws(()=>call('InitializeSRWLock',address),e=>e.code==='ACCESS_VIOLATION');
});
test('Win32 SRW: separate locks and separate processes do not share ownership',()=>{
  const a=setup(),b=setup(),other=a.p.heap.alloc(4,true);a.call('AcquireSRWLockExclusive',a.address);
  assert.equal(a.call('TryAcquireSRWLockShared',other),1);assert.equal(b.call('TryAcquireSRWLockShared',b.address),1);
  b.call('ReleaseSRWLockShared',b.address);assert.equal(a.call('TryAcquireSRWLockExclusive',a.address),0);
});
