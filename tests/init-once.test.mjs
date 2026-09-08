import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,once=p.heap.alloc(4,true),pending=p.heap.alloc(4,true),context=p.heap.alloc(4,true);return {p,m,once,pending,context,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 init once: check-only, begin, completion and failed-attempt retry preserve outputs',()=>{
  const {m,call,once,pending,context}=setup();m.w32(pending,55);m.w32(context,0x8888);
  assert.equal(call('InitOnceBeginInitialize',once,1,pending,context),0);assert.equal(call('GetLastError'),31);assert.equal(m.u32(pending),55);assert.equal(m.u32(context),0x8888);
  assert.equal(call('InitOnceBeginInitialize',once,0,pending,context),1);assert.equal(m.u32(pending),1);assert.equal(m.u32(context),0x8888);
  assert.equal(call('InitOnceComplete',once,4,0),1);assert.equal(m.u32(once),0);
  call('InitOnceBeginInitialize',once,0,pending,context);assert.equal(call('InitOnceComplete',once,0,0xfedcba98),1);
  assert.equal(call('InitOnceBeginInitialize',once,1,pending,context),1);assert.equal(m.u32(pending),0);assert.equal(m.u32(context),0xfedcba98);
});
test('Win32 init once: callback arguments, retry error and cached context use guest continuations',()=>{
  const {m,call,once,context}=setup();let result=call('InitOnceExecuteOnce',once,0x123400,77,context);
  assert.deepEqual(result.call,{address:0x123400,args:[once,77,context]});assert.equal(m.u32(once),1);
  call('SetLastError',123);assert.equal(result.then(0),0);assert.equal(call('GetLastError'),123);assert.equal(m.u32(once),0);
  result=call('InitOnceExecuteOnce',once,0x123400,77,context);m.w32(context,0xabc000);assert.equal(result.then(1),1);
  m.w32(context,0);assert.equal(call('InitOnceExecuteOnce',once,0,0,context),1);assert.equal(m.u32(context),0xabc000);
});
test('Win32 init once: async attempts share the winning context and reject mode mismatches',()=>{
  const {m,call,once,pending,context}=setup();
  for(let i=0;i<2;i++){assert.equal(call('InitOnceBeginInitialize',once,2,pending,context),1);assert.equal(m.u32(pending),1);}
  assert.equal(call('InitOnceBeginInitialize',once,0,pending,context),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('InitOnceComplete',once,0,0x1000),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('InitOnceComplete',once,2,0x1000),1);
  assert.equal(call('InitOnceComplete',once,2,0x2000),0);assert.equal(call('GetLastError'),31);
  assert.equal(call('InitOnceBeginInitialize',once,0,pending,context),1);assert.equal(m.u32(context),0x1000);
});
test('Win32 init once: synchronous waits suspend and recover after completion or retry',()=>{
  const {m,call,once,pending,context}=setup();call('InitOnceBeginInitialize',once,0,pending,context);
  const waiter=call('InitOnceBeginInitialize',once,0,pending,context);assert.equal(typeof waiter.wait,'function');assert.equal(waiter.wait(),undefined);
  call('InitOnceComplete',once,0,0x1000);assert.equal(waiter.wait(),1);assert.equal(m.u32(context),0x1000);
  call('InitOnceInitialize',once);call('InitOnceBeginInitialize',once,0,pending,context);
  const execute=call('InitOnceExecuteOnce',once,0x123400,0,0);assert.equal(execute.wait(),undefined);
  call('InitOnceComplete',once,4,0);assert.deepEqual(execute.wait().call,{address:0x123400,args:[once,0,0]});
});
test('Win32 init once: bad flags, reserved context bits, invalid state and output pages are atomic',()=>{
  const {m,call,once,pending,context}=setup();
  assert.equal(call('InitOnceComplete',once,0,0),0);assert.equal(call('GetLastError'),31);
  for(const flags of [3,4,0xffffffff]){assert.equal(call('InitOnceBeginInitialize',once,flags,pending,context),0);assert.equal(call('GetLastError'),87);}
  assert.throws(()=>call('InitOnceBeginInitialize',once,0,0x60000000,context),e=>e.code==='ACCESS_VIOLATION');assert.equal(m.u32(once),0);
  call('InitOnceBeginInitialize',once,0,pending,context);
  for(const [flags,value] of [[0,3],[4,4],[6,0],[1,0]]){assert.equal(call('InitOnceComplete',once,flags,value),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(once),1);}
});
