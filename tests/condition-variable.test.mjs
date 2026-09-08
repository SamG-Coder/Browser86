import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,cv=p.heap.alloc(4,true),lock=p.heap.alloc(24,true);return {p,m,cv,lock,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 condition variables: zero timeout reacquires CS and both SRW modes',()=>{
  const {m,cv,lock,call}=setup();call('InitializeConditionVariable',cv);call('WakeConditionVariable',cv);call('WakeAllConditionVariable',cv);
  call('InitializeCriticalSection',lock);call('EnterCriticalSection',lock);
  assert.equal(call('SleepConditionVariableCS',cv,lock,0),0);assert.equal(call('GetLastError'),1460);assert.equal(m.u32(lock+8),1);assert.equal(m.u32(lock+12),8);
  call('LeaveCriticalSection',lock);call('DeleteCriticalSection',lock);
  for(const [mode,flags] of [['Exclusive',0],['Shared',1]]){
    call('AcquireSRWLock'+mode,lock);assert.equal(call('SleepConditionVariableSRW',cv,lock,0,flags),0);assert.equal(call('GetLastError'),1460);
    assert.equal(m.u32(lock),flags?17:1);call('ReleaseSRWLock'+mode,lock);assert.equal(m.u32(cv),0);
  }
});
test('Win32 condition variables: wake one/all matches current waiters and stores no future signal',()=>{
  const {p,m,cv,lock,call}=setup(),other=p.heap.alloc(4,true);call('WakeAllConditionVariable',cv);
  const wait=(address,l)=>{call('AcquireSRWLockExclusive',l);return call('SleepConditionVariableSRW',address,l,0xffffffff,0);};
  const a=wait(cv,lock),b=wait(cv,other),elsewhere=p.heap.alloc(4,true),extra=p.heap.alloc(4,true),c=wait(elsewhere,extra);
  assert.equal(a.wait(),undefined);assert.equal(m.u32(lock),0);call('SetLastError',123);
  call('WakeConditionVariable',cv);assert.equal(a.wait(),1);assert.equal(call('GetLastError'),123);assert.equal(b.wait(),undefined);assert.equal(c.wait(),undefined);
  call('WakeAllConditionVariable',cv);assert.equal(b.wait(),1);assert.equal(c.wait(),undefined);assert.equal(m.u32(cv),0);
  call('ReleaseSRWLockExclusive',lock);assert.equal(wait(cv,lock).wait(),undefined);
});
test('Win32 condition variables: timeout and wake both wait for lock reacquisition',t=>{
  let now=100;t.mock.method(performance,'now',()=>now);
  for(const wake of [false,true]){
    const {p,cv,lock,call}=setup();call('AcquireSRWLockExclusive',lock);let result;
    p.resolveResult(call('SleepConditionVariableSRW',cv,lock,10,0),value=>{result=value;});
    call('AcquireSRWLockExclusive',lock);if(wake)call('WakeConditionVariable',cv);now+=10;p.poll();assert.equal(result,undefined);
    const count=p.cpu.instructions;p.tick(100,5);assert.equal(p.cpu.instructions,count);
    call('ReleaseSRWLockExclusive',lock);p.poll();assert.equal(result,wake?1:0);assert.equal(p.waiting,null);
    assert.equal(call('TryAcquireSRWLockExclusive',lock),0);call('ReleaseSRWLockExclusive',lock);
  }
});
test('Win32 condition variables: CS wake reacquires once and process-local wakes stay isolated',()=>{
  const a=setup(),b=setup();a.call('InitializeCriticalSection',a.lock);a.call('EnterCriticalSection',a.lock);
  const wait=a.call('SleepConditionVariableCS',a.cv,a.lock,0xffffffff);assert.equal(a.m.u32(a.lock+8),0);
  b.call('WakeAllConditionVariable',b.cv);assert.equal(wait.wait(),undefined);
  a.call('WakeConditionVariable',a.cv);assert.equal(wait.wait(),1);assert.equal(a.m.u32(a.lock+8),1);assert.equal(a.m.u32(a.lock+12),8);
});
test('Win32 condition variables: invalid inputs preserve held locks and reject recursive CS sleep',()=>{
  const {m,cv,lock,call}=setup();call('AcquireSRWLockExclusive',lock);
  assert.equal(call('SleepConditionVariableSRW',cv,lock,0,2),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(lock),1);
  assert.throws(()=>call('SleepConditionVariableSRW',0,lock,0,0));assert.equal(m.u32(lock),1);
  assert.throws(()=>call('SleepConditionVariableSRW',cv,lock,0,1));assert.equal(m.u32(lock),1);
  assert.throws(()=>call('WakeConditionVariable',cv+1));call('ReleaseSRWLockExclusive',lock);
  call('InitializeCriticalSection',lock);call('EnterCriticalSection',lock);call('EnterCriticalSection',lock);
  assert.throws(()=>call('SleepConditionVariableCS',cv,lock,0));assert.equal(m.u32(lock+8),2);assert.equal(m.u32(cv),0);
});
