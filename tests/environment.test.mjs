import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,s:(text,wide=false)=>p.heap.string(text,wide),call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}

test('Win32 environment: case-insensitive names, empty values, deletion and last error',()=>{
  const {p,m,s,call}=setup(),name=s('B86_TEST'),out=p.heap.alloc(32);
  call('SetLastError',999);assert.equal(call('SetEnvironmentVariableA',name,s('abc')),1);
  assert.equal(call('GetEnvironmentVariableA',s('b86_test'),out,32),3);assert.equal(m.cstr(out),'abc');assert.equal(call('GetLastError'),999);
  m.w8(out,88);assert.equal(call('GetEnvironmentVariableA',name,out,3),4);assert.equal(m.u8(out),0);
  assert.equal(call('SetEnvironmentVariableA',name,s('')),1);assert.equal(call('GetEnvironmentVariableA',name,0,0),1);
  m.w8(out,88);assert.equal(call('GetEnvironmentVariableA',name,out,1),0);assert.equal(m.u8(out),0);assert.equal(call('GetLastError'),999);
  assert.equal(call('SetEnvironmentVariableA',name,0),1);m.w8(out,88);assert.equal(call('GetEnvironmentVariableA',name,out,32),0);assert.equal(call('GetLastError'),203);assert.equal(m.u8(out),88);
  assert.equal(call('SetEnvironmentVariableA',s('BAD=NAME'),s('x')),0);assert.equal(call('GetLastError'),87);
});
test('Win32 environment: ACP byte counts differ from UTF-16 character counts',()=>{
  const {p,m,s,call}=setup(),out=p.heap.alloc(32);call('SetEnvironmentVariableW',s('CODE',true),s('éΩ😀',true));
  assert.equal(call('GetEnvironmentVariableA',s('CODE'),0,0),4);assert.equal(call('GetEnvironmentVariableA',s('CODE'),out,4),3);assert.deepEqual([...m.read(out,4)],[233,63,63,0]);
  assert.equal(call('GetEnvironmentVariableW',s('CODE',true),0,0),5);assert.equal(call('GetEnvironmentVariableW',s('CODE',true),out,5),4);assert.equal(m.wstr(out),'éΩ😀');
});
test('Win32 environment: expansion is single-pass and validates complete output before writing',()=>{
  const {p,m,s,call}=setup(),out=p.heap.alloc(128);call('SetEnvironmentVariableA',s('ONE'),s('%TWO%'));call('SetEnvironmentVariableA',s('TWO'),s('done'));
  const src=s('[%one%] %UNKNOWN%'),expected='[%TWO%] %UNKNOWN%';m.w8(out,88);
  assert.equal(call('ExpandEnvironmentStringsA',src,out,1),expected.length+1);assert.equal(m.u8(out),88);
  assert.equal(call('ExpandEnvironmentStringsA',src,out,128),expected.length+1);assert.equal(m.cstr(out),expected);
  m.map(0x60000000,4096);const edge=0x60000ffe;m.w16(edge,0xcccc);
  assert.throws(()=>call('ExpandEnvironmentStringsW',s('abcd',true),edge,5));assert.equal(m.u16(edge),0xcccc);
  call('SetEnvironmentVariableW',s('BOUND',true),s('abcd',true));assert.throws(()=>call('GetEnvironmentVariableW',s('BOUND',true),edge,5));assert.equal(m.u16(edge),0xcccc);
});
test('Win32 environment: sorted independent OEM and Unicode blocks have owned allocations',()=>{
  const {p,m,s,call}=setup();p.environment.clear();p.environment.set('Z','last');p.environment.set('A','éΩ');
  const a=call('GetEnvironmentStrings'),w=call('GetEnvironmentStringsW');
  assert.deepEqual([...m.read(a,13)],[65,61,130,234,0,90,61,108,97,115,116,0,0]);
  assert.equal(m.wstr(w),'A=éΩ');assert.equal(m.wstr(w+10),'Z=last');assert.equal(m.u16(w+24),0);
  call('SetEnvironmentVariableA',s('A'),s('changed'));assert.equal(m.wstr(w),'A=éΩ');
  const foreign=p.heap.alloc(16);assert.equal(call('FreeEnvironmentStringsA',foreign),0);assert.equal(p.heap.free(foreign),true);
  assert.equal(call('FreeEnvironmentStringsW',a),0);assert.equal(call('FreeEnvironmentStringsA',a),1);assert.equal(call('FreeEnvironmentStringsA',a),0);assert.equal(call('FreeEnvironmentStringsW',w),1);
  p.environment.clear();const empty=call('GetEnvironmentStringsA');assert.deepEqual([...m.read(empty,2)],[0,0]);assert.equal(call('FreeEnvironmentStringsA',empty),1);
});
test('Win32 environment: guest processes are isolated and CRT getenv observes Win32 updates',()=>{
  const a=setup(),b=setup();a.call('SetEnvironmentVariableA',a.s('B86_PRIVATE'),a.s('local'));
  assert.equal(b.call('GetEnvironmentVariableA',b.s('B86_PRIVATE'),0,0),0);assert.equal(b.call('GetLastError'),203);
  const value=a.p.apis.lookup('msvcrt.dll','getenv').fn(a.s('B86_PRIVATE'));assert.equal(a.m.cstr(value),'local');
});
