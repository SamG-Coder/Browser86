import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,address=p.heap.alloc(16,true),compare=p.heap.alloc(16,true);return {p,m,address,compare,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 address waits: exact 1/2/4/8-byte comparison and zero-timeout errors',()=>{
  const {m,call,address,compare}=setup();
  for(const size of [1,2,4,8]){
    m.fill(address,16);m.fill(compare,16);m.w8(address+size-1,0x80);
    call('SetLastError',123);assert.equal(call('WaitOnAddress',address,compare,size,0),1);assert.equal(call('GetLastError'),123);
    m.w8(compare+size-1,0x80);assert.equal(call('WaitOnAddress',address,compare,size,0),0);assert.equal(call('GetLastError'),1460);
  }
});
test('Win32 address waits: wake-single follows arrival order, wake-all matches exact addresses and does not store signals',()=>{
  const {m,call,address,compare}=setup();call('WakeByAddressAll',address);
  const a=call('WaitOnAddress',address,compare,4,0xffffffff),b=call('WaitOnAddress',address,compare,4,0xffffffff),other=call('WaitOnAddress',address+4,compare,4,0xffffffff);
  assert.equal(a.wait(),undefined);m.w32(address,1);assert.equal(a.wait(),undefined);
  call('WakeByAddressSingle',address);assert.equal(a.wait(),1);assert.equal(b.wait(),undefined);assert.equal(other.wait(),undefined);
  call('WakeByAddressAll',address);assert.equal(b.wait(),1);assert.equal(other.wait(),undefined);
  call('WakeByAddressSingle',address+4);assert.equal(other.wait(),1);
  m.w32(address,0);assert.equal(call('WaitOnAddress',address,compare,4,0xffffffff).wait(),undefined);
});
test('Win32 address waits: timeout removes expired waiters before a subsequent wake',t=>{
  let now=100;t.mock.method(performance,'now',()=>now);
  const {call,address,compare}=setup(),a=call('WaitOnAddress',address,compare,4,10),b=call('WaitOnAddress',address,compare,4,20);
  now=110;call('WakeByAddressSingle',address);assert.equal(a.wait(),0);assert.equal(call('GetLastError'),1460);assert.equal(b.wait(),1);
  const c=call('WaitOnAddress',address,compare,4,10);now=119;assert.equal(c.wait(),undefined);now=120;assert.equal(c.wait(),0);
});
test('Win32 address waits: process polling suspends without instructions and wakes only within the same guest',t=>{
  let now=100;t.mock.method(performance,'now',()=>now);const a=setup(),b=setup();let result;
  a.p.resolveResult(a.call('WaitOnAddress',a.address,a.compare,8,0xffffffff),value=>{result=value;});const instructions=a.p.cpu.instructions;
  b.call('WakeByAddressAll',a.address);a.p.poll();assert.equal(result,undefined);assert.equal(a.p.cpu.instructions,instructions);
  a.call('WakeByAddressAll',a.address);a.p.poll();assert.equal(result,1);assert.equal(a.p.waiting,null);
});
test('Win32 address waits: invalid sizes and inaccessible ranges do not register a waiter',()=>{
  const {m,call,address,compare}=setup();
  for(const size of [0,3,16,0xffffffff]){assert.equal(call('WaitOnAddress',address,compare,size,0),0);assert.equal(call('GetLastError'),87);}
  assert.equal(call('WaitOnAddress',0,compare,4,0),0);assert.equal(call('GetLastError'),87);
  const page=0x60000000;m.map(page,4096,'rw','address compare');
  assert.throws(()=>call('WaitOnAddress',page+4092,compare,8,10),e=>e.code==='ACCESS_VIOLATION');
  assert.throws(()=>call('WaitOnAddress',address,page+4092,8,10),e=>e.code==='ACCESS_VIOLATION');
  assert.equal(call('WakeByAddressAll',page+4092),0);
});
