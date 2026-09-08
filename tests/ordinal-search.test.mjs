import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,s:text=>p.heap.string(text,true),call:(...args)=>p.apis.lookup('kernel32.dll','FindStringOrdinal').fn(...args)};}
test('Win32 ordinal search: forward, backward, prefix and suffix modes clear last error',()=>{
  const {p,s,call}=setup(),a=s('ababa'),b=s('ba');
  for(const [flags,result] of [[0,1],[0x400000,1],[0x800000,3],[0x100000,-1],[0x200000,3]]){
    p.setError(999);assert.equal(call(flags,a,-1,b,-1,0),result);assert.equal(p.lastError,0);
  }
  assert.equal(call(0,a,-1,s('z'),-1,0),-1);assert.equal(p.lastError,0);
});
test('Win32 ordinal search: empty values and counted embedded NULs use UTF-16 offsets',()=>{
  const {s,call}=setup(),a=s('abc'),empty=s('');
  for(const flags of [0,0x400000,0x800000,0x100000,0x200000]){
    assert.equal(call(flags,a,-1,empty,0,0),flags===0x800000||flags===0x200000?3:0);
    assert.equal(call(flags,empty,0,empty,0,0),0);assert.equal(call(flags,empty,0,a,1,0),-1);
  }
  const counted=s('a\0bc');assert.equal(call(0,counted,4,s('\0b'),2,0),1);assert.equal(call(0,counted,-1,s('b'),1,0),-1);
  assert.equal(call(0,s('😀x'),3,s('x'),1,0),2);
});
test('Win32 ordinal search: pinned case mappings preserve nonlinguistic distinctions',()=>{
  const {s,call}=setup();
  assert.equal(call(0x800000,s('éÉé'),3,s('É'),1,1),2);
  assert.equal(call(0,s('AbC'),3,s('bc'),2,1),1);assert.equal(call(0,s('AbC'),3,s('bc'),2,0),-1);
  for(const [a,b] of [['ı','I'],['ß','SS'],['K','K'],['\u{10428}','\u{10400}']])assert.equal(call(0,s(a),-1,s(b),-1,1),-1);
});
test('Win32 ordinal search: invalid flags, arguments and inaccessible counted buffers',()=>{
  const {p,m,s,call}=setup(),a=s('a');
  for(const flags of [1,0xc00000,0x300000,0xffffffff]){assert.equal(call(flags,a,1,a,1,0),-1);assert.equal(p.lastError,1004);}
  for(const args of [[0,0,a,0,0],[a,-2,a,1,0],[a,1,a,0xfffffffe,0],[a,1,a,1,2]]){assert.equal(call(0,...args),-1);assert.equal(p.lastError,87);}
  m.map(0x60000000,4096);m.w16(0x60000ffe,97);assert.equal(call(0,0x60000ffe,1,a,1,0),0);
  assert.throws(()=>call(0,0x60000ffe,2,a,1,0));assert.throws(()=>call(0,a,1,0x60000ffe,-1,0));
});
