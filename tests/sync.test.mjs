import test from 'node:test';
import assert from 'node:assert/strict';
import {guest,run} from './helpers.mjs';

const FAILED=0xFFFFFFFF,TIMEOUT=258;
function setup(){
  const {p}=guest('HelloConsole.exe');
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const array=handles=>{const a=p.heap.alloc(handles.length*4);handles.forEach((h,i)=>p.memory.w32(a+i*4,h));return a;};
  return {p,call,array};
}

test('Win32 sync: A/W manual and auto events preserve reset semantics',()=>{
  const {call}=setup();
  for(const suffix of ['A','W'])for(const manual of [0,1]){
    const h=call('CreateEvent'+suffix,0,manual,1,0);
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('WaitForSingleObject',h,0),manual?0:TIMEOUT);
    assert.equal(call('SetEvent',h),1);assert.equal(call('SetEvent',h),1);
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('WaitForSingleObject',h,0),manual?0:TIMEOUT);
    assert.equal(call('ResetEvent',h),1);
    assert.equal(call('WaitForSingleObject',h,0),TIMEOUT);
    assert.equal(call('CloseHandle',h),1);
    assert.equal(call('SetEvent',h),0);assert.equal(call('GetLastError'),6);
  }
});

test('Win32 sync: A/W mutex initial ownership, recursion and unowned release',()=>{
  const {call}=setup();
  for(const suffix of ['A','W'])for(const owned of [0,1]){
    const h=call('CreateMutex'+suffix,0,owned,0);
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('WaitForSingleObjectEx',h,FAILED,0),0);
    for(let i=0;i<2+owned;i++)assert.equal(call('ReleaseMutex',h),1);
    assert.equal(call('ReleaseMutex',h),0);assert.equal(call('GetLastError'),288);
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('ReleaseMutex',h),1);
    assert.equal(call('CloseHandle',h),1);
    assert.equal(call('ReleaseMutex',h),0);assert.equal(call('GetLastError'),6);
  }
});

test('Win32 sync: A/W semaphore counts, signed LONG bounds and failed release atomicity',()=>{
  const {p,call}=setup(),out=p.heap.alloc(4);
  for(const suffix of ['A','W']){
    for(const [initial,max] of [[0,0],[2,1],[FAILED,2],[0,0x80000000]]){
      assert.equal(call('CreateSemaphore'+suffix,0,initial,max,0),0);
      assert.equal(call('GetLastError'),87);
    }
    const h=call('CreateSemaphore'+suffix,0,1,2,0);
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('WaitForSingleObject',h,0),TIMEOUT);
    assert.equal(call('ReleaseSemaphore',h,2,out),1);assert.equal(p.memory.u32(out),0);
    p.memory.w32(out,0x12345678);
    assert.equal(call('ReleaseSemaphore',h,1,out),0);assert.equal(call('GetLastError'),298);
    assert.equal(p.memory.u32(out),0x12345678);
    for(const count of [0,FAILED,0x80000000]){
      assert.equal(call('ReleaseSemaphore',h,count,out),0);assert.equal(call('GetLastError'),87);
    }
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.throws(()=>call('ReleaseSemaphore',h,1,1),e=>e.code==='ACCESS_VIOLATION');
    assert.equal(call('WaitForSingleObject',h,0),0);
    assert.equal(call('WaitForSingleObject',h,0),TIMEOUT);
    assert.equal(call('ReleaseSemaphore',h,1,0),1);
    assert.equal(call('CloseHandle',h),1);
  }
});

test('Win32 sync: wait-any chooses the first ready index and consumes only that object',()=>{
  const {call,array}=setup();
  const e=call('CreateEventA',0,0,0,0),s=call('CreateSemaphoreA',0,2,2,0),m=call('CreateMutexA',0,0,0);
  const ptr=array([e,s,m]);
  assert.equal(call('WaitForMultipleObjects',3,ptr,0,0),1);
  call('SetEvent',e);
  assert.equal(call('WaitForMultipleObjectsEx',3,ptr,0,0,0),0);
  assert.equal(call('WaitForMultipleObjects',3,ptr,0,0),1);
  assert.equal(call('WaitForMultipleObjects',3,ptr,0,0),2);
  assert.equal(call('ReleaseMutex',m),1);
  assert.equal(call('ReleaseMutex',m),0);assert.equal(call('GetLastError'),288);
});

test('Win32 sync: wait-all is atomic for event, semaphore and mutex on timeout and success',()=>{
  const {call,array}=setup();
  const event=call('CreateEventW',0,0,1,0),sem=call('CreateSemaphoreW',0,1,1,0);
  const mutex=call('CreateMutexW',0,0,0),gate=call('CreateEventW',0,1,0,0);
  const ptr=array([event,sem,mutex,gate]);
  assert.equal(call('WaitForMultipleObjects',4,ptr,1,0),TIMEOUT);
  assert.equal(call('ReleaseMutex',mutex),0);assert.equal(call('GetLastError'),288);
  call('SetEvent',gate);
  assert.equal(call('WaitForMultipleObjectsEx',4,ptr,1,0,0),0);
  assert.equal(call('WaitForSingleObject',event,0),TIMEOUT);
  assert.equal(call('WaitForSingleObject',sem,0),TIMEOUT);
  assert.equal(call('ReleaseMutex',mutex),1);
  assert.equal(call('ReleaseMutex',mutex),0);
  assert.equal(call('WaitForSingleObject',gate,0),0);
});

test('Win32 sync: invalid handles, duplicate handles and array bounds leave signals untouched',()=>{
  const {p,call,array}=setup(),h=call('CreateEventA',0,0,1,0);
  for(const handles of [[h,0],[h,11],[h,p.handle('file',{})]]){
    assert.equal(call('WaitForMultipleObjects',2,array(handles),0,0),FAILED);
    assert.equal(call('GetLastError'),6);
  }
  for(const [n,ptr] of [[0,0],[65,1],[1,0],[2,array([h,h])]]){
    assert.equal(call('WaitForMultipleObjects',n,ptr,1,0),FAILED);
    assert.equal(call('GetLastError'),87);
  }
  assert.throws(()=>call('WaitForMultipleObjects',1,1,0,0),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(call('WaitForSingleObject',h,0),0);
  for(const name of ['SetEvent','ResetEvent','ReleaseMutex','ReleaseSemaphore']){
    assert.equal(call(name,0,1,0),0);assert.equal(call('GetLastError'),6);
  }
  const events=Array.from({length:64},()=>call('CreateEventA',0,0,1,0));
  assert.equal(call('WaitForMultipleObjects',64,array(events),1,0),0);
  assert.equal(call('WaitForSingleObject',events[63],0),TIMEOUT);
});

test('Win32 sync: unsupported naming, security and APC modes fail explicitly',()=>{
  const {p,call,array}=setup(),h=call('CreateEventA',0,0,1,0);
  for(const suffix of ['A','W'])for(const kind of ['Event','Mutex','Semaphore']){
    const args=kind==='Mutex'?[0,0,0]:[0,0,1,0];
    args[args.length-1]=p.heap.string('sync',suffix==='W');
    assert.throws(()=>call('Create'+kind+suffix,...args),e=>e.code==='UNSUPPORTED_SYNC');
    args[args.length-1]=0;args[0]=p.heap.alloc(12);
    assert.throws(()=>call('Create'+kind+suffix,...args),e=>e.code==='UNSUPPORTED_SYNC');
  }
  assert.throws(()=>call('WaitForSingleObjectEx',h,0,1),e=>e.code==='UNSUPPORTED_APC');
  assert.throws(()=>call('WaitForMultipleObjectsEx',1,array([h]),0,0,1),e=>e.code==='UNSUPPORTED_APC');
  assert.equal(call('WaitForSingleObject',h,0),0);
});

test('Win32 sync: pending waits integrate with process polling and resume only when ready',()=>{
  const {p,call,array}=setup(),event=call('CreateEventA',0,0,1,0),sem=call('CreateSemaphoreA',0,0,1,0);
  let result;
  p.resolveResult(call('WaitForMultipleObjects',2,array([event,sem]),1,FAILED),value=>{result=value;});
  assert.equal(p.waiting.reason,'WaitForMultipleObjects');
  const before=p.cpu.instructions;
  p.tick();assert.equal(result,undefined);assert.equal(p.cpu.instructions,before);
  call('ReleaseSemaphore',sem,1,0);p.poll();
  assert.equal(result,0);assert.equal(p.waiting,null);
  assert.equal(call('WaitForSingleObject',event,0),TIMEOUT);
  assert.equal(call('WaitForSingleObject',sem,0),TIMEOUT);
});

test('Win32 sync: finite timeout is deterministic; infinite waits have no deadline',t=>{
  const {call}=setup(),h=call('CreateEventA',0,0,0,0);
  let now=100;t.mock.method(performance,'now',()=>now);
  const finite=call('WaitForSingleObjectEx',h,25,0),infinite=call('WaitForSingleObject',h,FAILED);
  now=124;assert.equal(finite.wait(),undefined);
  now=125;assert.equal(finite.wait(),TIMEOUT);
  now=1e12;assert.equal(infinite.wait(),undefined);
  call('SetEvent',h);assert.equal(infinite.wait(),0);
  const closed=call('WaitForSingleObject',h,FAILED);call('CloseHandle',h);
  assert.equal(closed.wait(),FAILED);assert.equal(call('GetLastError'),6);
});

test('EXE: compiled synchronization imports, stdcall stack, blocked wait and clean exit',()=>{
  const t=guest('tests/SyncPrimitives.exe');run(t.p);
  assert.equal(t.p.waiting?.reason,'WaitForSingleObjectEx');
  assert.match(t.output(),/Synchronization checks passed/);
  const gate=[...t.p.handles].find(([,o])=>o.type==='event');
  assert.ok(gate);
  t.p.apis.lookup('kernel32.dll','SetEvent').fn(gate[0]);
  t.p.tick();run(t.p);
  assert.equal(t.p.status,'exited');assert.equal(t.p.exitCode,0);
  assert.match(t.output(),/Synchronization wait resumed/);
  assert.equal([...t.p.handles.values()].filter(o=>['event','semaphore','mutex'].includes(o.type)).length,0);
  assert.deepEqual(t.p.apis.missingImports(),[]);
});

test('EXE: compiled synchronization timeout resumes through the guest ABI',t=>{
  let now=100;t.mock.method(performance,'now',()=>now);
  const fixture=guest('tests/SyncPrimitives.exe');run(fixture.p);
  assert.equal(fixture.p.waiting?.reason,'WaitForSingleObjectEx');
  now+=25;fixture.p.tick();run(fixture.p);
  assert.equal(fixture.p.status,'exited');assert.equal(fixture.p.exitCode,0);
  assert.match(fixture.output(),/Synchronization wait resumed/);
});
