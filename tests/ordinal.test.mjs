import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,s:text=>p.heap.string(text,true),call:(...args)=>p.apis.lookup('kernel32.dll','CompareStringOrdinal').fn(...args)};}
test('Win32 ordinal comparison: UTF-16 lengths, embedded NULs and CSTR result codes',()=>{
  const {p,s,call}=setup(),a=s('A\0x'),b=s('a\0y');p.setError(123);
  assert.equal(call(a,-1,b,-1,1),2);assert.equal(call(a,3,b,3,1),1);assert.equal(call(b,3,a,3,1),3);
  assert.equal(call(a,1,b,1,0),1);assert.equal(call(a,0,b,0,0),2);assert.equal(call(a,0,b,1,0),1);assert.equal(p.lastError,123);
  assert.equal(call(s('\ud800'),1,s('\ue000'),1,0),1);
});
test('Win32 ordinal comparison: native nonlinguistic case behavior avoids Unicode expansion',()=>{
  const {s,call}=setup();
  for(const [a,b,result] of [['é','É',2],['ß','SS',3],['ı','I',3],['ſ','S',3],['K','K',3],['σ','ς',1],['\u{10428}','\u{10400}',3]]){
    assert.equal(call(s(a),-1,s(b),-1,1),result,`${a} / ${b}`);
  }
});
test('Win32 ordinal comparison: seeded native Windows vectors match on all platforms',()=>{
  const {p,m,call}=setup(),a=p.heap.alloc(32,true),b=p.heap.alloc(32,true);
  const vectors=JSON.parse(fs.readFileSync(new URL('./ordinal-native-vectors.json',import.meta.url),'utf8'));
  for(const [left,right,ignore,result] of vectors){left.forEach((c,i)=>m.w16(a+i*2,c));right.forEach((c,i)=>m.w16(b+i*2,c));assert.equal(call(a,left.length,b,right.length,ignore),result);}
  assert.equal(vectors.length,512);
});
test('Win32 ordinal comparison: validates pointers, signed lengths, booleans and counted ranges',()=>{
  const {p,m,s,call}=setup(),a=s('a');
  for(const args of [[0,0,a,0,0],[a,0,0,0,0],[a,-2,a,1,0],[a,1,a,0xfffffffe,0],[a,1,a,1,2]]){
    assert.equal(call(...args),0);assert.equal(p.lastError,87);
  }
  m.map(0x60000000,4096);m.w16(0x60000ffe,65);
  assert.equal(call(0x60000ffe,1,s('A'),1,0),2);assert.throws(()=>call(0x60000ffe,2,a,1,0));
  assert.throws(()=>call(0x60000ffe,-1,a,1,0));
});
