import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
const ALL=0x1F0003,SYNC=0x100000,FAILED=0xFFFFFFFF;
function setup(){
  const {p}=guest('HelloConsole.exe');
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const str=(s,wide=false)=>p.heap.string(s,wide);
  const out=p.heap.alloc(16,true);
  const duplicate=(h,access=0,options=2)=>{assert.equal(call('DuplicateHandle',FAILED,h,FAILED,out,access,0,options),1);return p.memory.u32(out);};
  return {p,call,str,out,duplicate};
}

test('Win32 names: create-existing returns a new handle without resetting state or initial ownership',()=>{
  const {call,str}=setup(),name=str('state');
  const e=call('CreateEventA',0,1,1,name);assert.equal(call('GetLastError'),0);
  const other=call('CreateEventA',0,0,0,name);assert.notEqual(e,other);assert.equal(call('GetLastError'),183);
  assert.equal(call('WaitForSingleObject',other,0),0);assert.equal(call('WaitForSingleObject',e,0),0);
  call('CloseHandle',e);call('CloseHandle',other);
  const sem=call('CreateSemaphoreA',0,2,3,name);
  const alias=call('CreateSemaphoreA',0,FAILED,0,name);assert.ok(alias);assert.equal(call('GetLastError'),183);
  assert.equal(call('WaitForSingleObject',sem,0),0);assert.equal(call('WaitForSingleObject',alias,0),0);
  assert.equal(call('WaitForSingleObject',alias,0),258);
  call('CloseHandle',sem);call('CloseHandle',alias);
  const mutex=call('CreateMutexA',0,0,name),owner=call('CreateMutexA',0,1,name);
  assert.equal(call('ReleaseMutex',owner),0);assert.equal(call('GetLastError'),288);
  assert.equal(call('WaitForSingleObject',mutex,0),0);assert.equal(call('ReleaseMutex',owner),1);
});

test('Win32 names: Unicode, case-sensitive names and Local/Global namespaces remain guest-isolated',()=>{
  const a=setup(),b=setup();
  const h=a.call('CreateEventW',0,0,1,a.str('café',true));
  const alias=a.call('OpenEventA',SYNC,0,a.str('Local\\café'));assert.ok(alias);
  assert.equal(a.call('WaitForSingleObject',alias,0),0);assert.equal(a.call('WaitForSingleObject',h,0),258);
  assert.equal(a.call('OpenEventA',SYNC,0,a.str('CAFÉ')),0);assert.equal(a.call('GetLastError'),2);
  assert.equal(a.call('OpenEventA',SYNC,0,a.str('Global\\café')),0);
  const global=a.call('CreateEventA',0,0,1,a.str('Global\\café'));
  assert.equal(a.call('WaitForSingleObject',global,0),0);
  assert.equal(b.call('OpenEventW',SYNC,0,b.str('Local\\café',true)),0);
  assert.equal(b.call('OpenEventA',SYNC,0,b.str('Global\\café')),0);
});

test('Win32 names: type collisions and final close honor opened/duplicated references',()=>{
  const {p,call,str,out,duplicate}=setup(),name=str('lifetime');
  const h=call('CreateEventA',0,0,1,name),open=call('OpenEventA',ALL,0,name),dup=duplicate(h);
  assert.equal(call('CreateMutexA',0,0,name),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('OpenSemaphoreA',ALL,0,name),0);assert.equal(call('GetLastError'),6);
  call('CloseHandle',h);call('CloseHandle',open);
  const moved=duplicate(dup,0,3);assert.equal(p.object(dup),null);
  const reopened=call('OpenEventA',SYNC,0,name);assert.ok(reopened);
  assert.equal(call('WaitForSingleObject',reopened,0),0);
  call('CloseHandle',reopened);call('CloseHandle',moved);
  assert.equal(call('OpenEventA',ALL,0,name),0);assert.equal(call('GetLastError'),2);assert.equal(p.namedObjects.size,0);
  const fresh=call('CreateMutexA',0,1,name);assert.ok(fresh);assert.equal(call('GetLastError'),0);
  assert.equal(call('DuplicateHandle',FAILED,fresh,123,out,0,0,3),0);
  assert.equal(p.namedObjects.size,0);assert.equal(call('OpenMutexA',SYNC,0,name),0);
});

test('Win32 names: access rights constrain waits and mutation across opens and duplicates',()=>{
  const {call,str,duplicate,out,p}=setup(),name=str('rights'),h=call('CreateEventA',0,0,1,name);
  const reader=call('OpenEventA',SYNC,0,name),writer=call('OpenEventA',2,0,name),copy=duplicate(reader);
  assert.equal(call('SetEvent',reader),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('ResetEvent',copy),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('WaitForSingleObject',writer,0),FAILED);assert.equal(call('GetLastError'),5);
  p.memory.w32(out,h);p.memory.w32(out+4,writer);
  assert.equal(call('WaitForMultipleObjects',2,out,0,0),FAILED);assert.equal(call('GetLastError'),5);
  assert.equal(call('WaitForSingleObject',copy,0),0);
  assert.equal(call('SetEvent',writer),1);
  const reduced=duplicate(h,2,0);assert.equal(call('WaitForSingleObject',reduced,0),FAILED);
  assert.equal(call('ResetEvent',reduced),1);
  const sem=call('CreateSemaphoreA',0,0,1,str('sem')),waiter=call('OpenSemaphoreA',SYNC,0,str('sem'));
  assert.equal(call('ReleaseSemaphore',waiter,1,0),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('ReleaseSemaphore',sem,1,0),1);assert.equal(call('WaitForSingleObject',waiter,0),0);
});

test('Win32 names: SECURITY_ATTRIBUTES records inheritance, validates layout and rejects custom descriptors',()=>{
  const {p,call,str,out}=setup(),sa=p.heap.alloc(12,true),name=str('attributes');
  p.memory.w32(sa,12);p.memory.w32(sa+8,1);
  const h=call('CreateEventA',sa,0,0,name);assert.ok(h);
  call('GetHandleInformation',h,out);assert.equal(p.memory.u32(out),1);
  const opened=call('OpenEventA',ALL,1,name);call('GetHandleInformation',opened,out);assert.equal(p.memory.u32(out),1);
  p.memory.w32(sa+4,1);
  assert.throws(()=>call('CreateEventA',sa,0,0,str('custom')),e=>e.code==='UNSUPPORTED_SYNC');
  // Windows ignores the supplied descriptor when opening an existing object.
  assert.ok(call('CreateEventA',sa,1,1,name));assert.equal(call('GetLastError'),183);
  p.memory.w32(sa,8);assert.equal(call('CreateEventA',sa,0,0,name),0);assert.equal(call('GetLastError'),87);
});

test('Win32 names: A/W Ex creation and Open functions preserve flags, generic rights and mutex release',()=>{
  const {call,str}=setup();
  for(const wide of [false,true]){
    const s=wide?'W':'A',event=str('event'+s,wide),mutex=str('mutex'+s,wide),sem=str('semaphore'+s,wide);
    const e=call('CreateEventEx'+s,0,event,3,0x10000000);assert.ok(e);
    const er=call('OpenEvent'+s,0x20000000,0,event);
    assert.equal(call('WaitForSingleObject',er,0),0);assert.equal(call('WaitForSingleObject',er,0),0);
    assert.equal(call('ResetEvent',er),0);assert.equal(call('GetLastError'),5);
    const ew=call('OpenEvent'+s,0x40000000,0,event);assert.equal(call('ResetEvent',ew),1);
    const mu=call('CreateMutexEx'+s,0,mutex,1,0x02000000);assert.ok(mu);
    const mr=call('OpenMutex'+s,0,0,mutex);assert.ok(mr);assert.equal(call('ReleaseMutex',mr),1);
    assert.equal(call('WaitForSingleObject',mr,0),FAILED);assert.equal(call('GetLastError'),5);
    const se=call('CreateSemaphoreEx'+s,0,1,1,sem,0,ALL);assert.ok(se);
    const sr=call('OpenSemaphore'+s,SYNC,0,sem);assert.equal(call('WaitForSingleObject',sr,0),0);
    assert.equal(call('WaitForSingleObject',se,0),258);
  }
});

test('Win32 names: invalid names, pointers, access masks and Ex flags fail without allocating objects',()=>{
  const {p,call,str}=setup(),before=p.handles.size;
  for(const text of ['', 'Local\\','Global\\','bad\\name','x'.repeat(260)]){
    assert.equal(call('CreateEventA',0,0,0,str(text)),0);assert.equal(call('GetLastError'),123);
  }
  assert.equal(call('OpenEventA',ALL,0,0),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('OpenEventA',ALL,0,str('missing')),0);assert.equal(call('GetLastError'),2);
  assert.throws(()=>call('CreateMutexW',0,0,1),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(call('CreateEventExA',0,str('invalid'),4,ALL),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('CreateMutexExA',0,str('invalid'),2,ALL),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('CreateSemaphoreExA',0,1,1,str('invalid'),1,ALL),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('CreateEventExA',0,str('invalid'),0,0x100),0);assert.equal(call('GetLastError'),5);
  assert.equal(p.handles.size,before);assert.equal(p.namedObjects.size,0);
});
