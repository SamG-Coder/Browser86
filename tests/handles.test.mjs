import test from 'node:test';
import assert from 'node:assert/strict';
import {guest,run} from './helpers.mjs';

const SELF=0xFFFFFFFF;
function setup(){
  const {p}=guest('HelloConsole.exe');
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const out=p.heap.alloc(16);
  const duplicate=(h,inherit=0,options=2)=>{assert.equal(call('DuplicateHandle',SELF,h,SELF,out,0,inherit,options),1);return p.memory.u32(out);};
  return {p,call,out,duplicate};
}

test('Win32 handles: duplicated files share position and survive closing the original',()=>{
  const {p,call,out,duplicate}=setup(),name=p.heap.string('shared.txt'),data=p.heap.string('abcdef');
  const h=call('CreateFileA',name,0xC0000000,0,0,2,0,0),d=duplicate(h);
  assert.notEqual(h,d);
  assert.equal(call('WriteFile',h,data,3,out,0),1);
  assert.equal(call('WriteFile',d,data+3,3,out,0),1);
  assert.equal(call('SetFilePointer',d,0,0,0),0);
  assert.equal(call('ReadFile',h,out+4,2,out,0),1);assert.equal(p.memory.u16(out+4),0x6261);
  assert.equal(call('CloseHandle',h),1);
  assert.equal(call('ReadFile',d,out+4,2,out,0),1);assert.equal(p.memory.u16(out+4),0x6463);
  // Sharing denial belongs to the surviving open object, not just its first handle.
  assert.equal(call('CreateFileA',name,0x80000000,3,0,3,0,0),SELF);assert.equal(call('GetLastError'),32);
  assert.equal(call('CloseHandle',d),1);
  assert.notEqual(call('CreateFileA',name,0x80000000,3,0,3,0,0),SELF);
});

test('Win32 handles: flags are per handle, mask updates preserve other bits and close protection works',()=>{
  const {p,call,out,duplicate}=setup(),h=call('CreateEventA',0,0,0,0);
  assert.equal(call('GetHandleInformation',h,out),1);assert.equal(p.memory.u32(out),0);
  assert.equal(call('SetHandleInformation',h,3,3),1);
  const d=duplicate(h,0);
  call('GetHandleInformation',d,out);assert.equal(p.memory.u32(out),0);
  assert.equal(call('CloseHandle',h),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('SetHandleInformation',h,2,0),1);
  call('GetHandleInformation',h,out);assert.equal(p.memory.u32(out),1);
  assert.equal(call('CloseHandle',h),1);assert.equal(p.handleFlags.has(h),false);
  assert.equal(call('SetEvent',d),1);assert.equal(call('WaitForSingleObject',d,0),0);
  const inherited=duplicate(d,1);
  call('GetHandleInformation',inherited,out);assert.equal(p.memory.u32(out),1);
  assert.equal(call('SetHandleInformation',d,4,4),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('CloseHandle',d),1);assert.equal(call('CloseHandle',inherited),1);
});

test('Win32 handles: aliases share semaphore counts and mutex ownership without double-acquiring wait-all',()=>{
  const {p,call,out,duplicate}=setup(),h=call('CreateSemaphoreA',0,1,1,0),d=duplicate(h);
  p.memory.w32(out,h);p.memory.w32(out+4,d);
  assert.equal(call('WaitForMultipleObjects',2,out,1,0),SELF);assert.equal(call('GetLastError'),87);
  assert.equal(call('WaitForMultipleObjects',2,out,0,0),0);
  assert.equal(call('WaitForSingleObject',d,0),258);
  const mutex=call('CreateMutexA',0,1,0),alias=duplicate(mutex);
  call('CloseHandle',mutex);assert.equal(call('ReleaseMutex',alias),1);
  assert.equal(call('ReleaseMutex',alias),0);assert.equal(call('GetLastError'),288);
});

test('Win32 handles: CLOSE_SOURCE succeeds, closes on failure, and supports no target process',()=>{
  const {p,call,out,duplicate}=setup();
  let h=call('CreateEventA',0,0,1,0),d=duplicate(h,0,3);
  assert.equal(p.object(h),null);assert.equal(call('WaitForSingleObject',d,0),0);
  h=call('CreateEventA',0,0,1,0);
  assert.equal(call('DuplicateHandle',SELF,h,123,out,0,0,3),0);
  assert.equal(call('GetLastError'),6);assert.equal(p.object(h),null);
  h=call('CreateEventA',0,0,1,0);
  assert.equal(call('DuplicateHandle',SELF,h,0,0,0,0,1),1);assert.equal(p.object(h),null);
  h=call('CreateEventA',0,0,1,0);const size=p.handles.size;
  assert.throws(()=>call('DuplicateHandle',SELF,h,SELF,1,0,0,3),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.handles.size,size-1);
});

test('Win32 handles: invalid types, buffers and unsupported modes do not allocate duplicates',()=>{
  const {p,call,out}=setup(),h=call('CreateEventA',0,0,1,0),size=p.handles.size;
  assert.equal(call('DuplicateHandle',123,h,SELF,out,0,0,2),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('DuplicateHandle',SELF,h,SELF,out,0,0,4),0);assert.equal(call('GetLastError'),87);
  assert.throws(()=>call('DuplicateHandle',SELF,h,SELF,out,0,0,0),e=>e.code==='UNSUPPORTED_HANDLE');
  assert.throws(()=>call('DuplicateHandle',SELF,11,SELF,out,0,0,2),e=>e.code==='UNSUPPORTED_HANDLE');
  assert.throws(()=>call('DuplicateHandle',SELF,h,SELF,1,0,0,2),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(p.handles.size,size);
  assert.equal(call('GetHandleInformation',h,0),0);assert.equal(call('GetLastError'),87);
  for(const type of ['find','window','gdi','module','registry','global']){
    const other=p.handle(type,{});
    assert.equal(call('CloseHandle',other),0);assert.equal(call('GetLastError'),6);
    assert.equal(call('DuplicateHandle',SELF,other,SELF,out,0,0,2),0);
    assert.ok(p.object(other));
  }
});

test('Win32 handles: process/thread pseudo handles become real queryable waitable handles',()=>{
  const {p,call,out,duplicate}=setup(),process=duplicate(SELF),thread=duplicate(0xFFFFFFFE);
  assert.equal(call('GetProcessId',process),4);assert.equal(call('GetThreadId',thread),8);
  assert.equal(call('GetProcessId',thread),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('GetThreadId',process),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('GetExitCodeProcess',process,out),1);assert.equal(p.memory.u32(out),259);
  assert.equal(call('GetExitCodeThread',thread,out),1);assert.equal(p.memory.u32(out),259);
  for(const h of [process,thread,SELF,0xFFFFFFFE])assert.equal(call('WaitForSingleObject',h,0),258);
  assert.equal(call('CheckRemoteDebuggerPresent',process,out),1);assert.equal(p.memory.u32(out),0);
  // Resolve both process arguments before CLOSE_SOURCE removes their shared handle.
  assert.equal(call('DuplicateHandle',process,process,process,out,0,0,3),1);
  const replacement=p.memory.u32(out);assert.equal(call('GetProcessId',replacement),4);
  assert.equal(call('TerminateProcess',replacement,42),1);
  assert.equal(call('GetExitCodeProcess',replacement,out),1);assert.equal(p.memory.u32(out),42);
  assert.equal(call('WaitForSingleObject',thread,0),0);
});

test('EXE: handle duplication, shared file position, flags and process queries use real imports',()=>{
  const fixture=guest('tests/HandleObjects.exe');run(fixture.p);
  assert.equal(fixture.p.status,'exited');assert.equal(fixture.p.exitCode,0);
  assert.match(fixture.output(),/Handle checks passed/);
  assert.deepEqual(fixture.p.apis.missingImports(),[]);
});
