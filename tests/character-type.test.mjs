import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,s:text=>p.heap.string(text,true),out:p.heap.alloc(128,true),call:(...args)=>p.apis.lookup('kernel32.dll','GetStringTypeW').fn(...args)};}
test('Win32 character types: all 196608 classifications match native output hashes',()=>{
  const {p,m,call}=setup(),src=p.heap.alloc(131072),out=p.heap.alloc(131072),hashes=JSON.parse(fs.readFileSync(new URL('./character-type-native-hashes.json',import.meta.url)));
  for(let i=0;i<65536;i++)m.w16(src+i*2,i);
  for(const mode of [1,2,4]){assert.equal(call(mode,src,65536,out),1);assert.equal(createHash('sha256').update(m.read(out,131072)).digest('hex'),hashes[mode]);}
});
test('Win32 character types: letters, digits, whitespace, bidi and script properties',()=>{
  const {m,s,out,call}=setup(),src=s('Aa0 \t!\0');
  for(const [mode,expected] of [[1,[897,898,644,584,616,528,544]],[2,[1,1,3,10,9,11,0]],[4,[32832,32832,64,72,8,72,0]]]){
    assert.equal(call(mode,src,7,out),1);assert.deepEqual(expected.map((_,i)=>m.u16(out+i*2)),expected);
  }
  assert.equal(call(4,s('אا\u0301一'),4,out),1);assert.deepEqual([0,1,2,3].map(i=>m.u16(out+i*2)),[32768,32768,3,33024]);
});
test('Win32 character types: negative counts include NUL, counted NULs and surrogates remain units',()=>{
  const {p,m,s,out,call}=setup();p.setError(123);
  assert.equal(call(1,s('a'),-2,out),1);assert.equal(m.u16(out),898);assert.equal(m.u16(out+2),544);assert.equal(p.lastError,123);
  assert.equal(call(4,s('😀'),2,out),1);assert.equal(m.u16(out),2048);assert.equal(m.u16(out+2),4096);
  assert.equal(call(1,s('A\0a'),3,out),1);assert.equal(m.u16(out+4),898);
});
test('Win32 character types: invalid parameters and whole-range validation preserve output',()=>{
  const {p,m,s,out,call}=setup(),src=s('AB');m.fill(out,8,204);
  for(const mode of [0,3,8]){assert.equal(call(mode,src,2,out),0);assert.equal(p.lastError,1004);}
  for(const args of [[0,1,out],[src,0,out],[src,1,0],[src,1,src]]){assert.equal(call(1,...args),0);assert.equal(p.lastError,87);}
  m.map(0x60000000,4096);const edge=0x60000ffe;m.w16(edge,0xcccc);
  assert.throws(()=>call(1,src,2,edge));assert.equal(m.u16(edge),0xcccc);
  assert.throws(()=>call(1,edge,2,out));assert.equal(m.u32(out),0xcccccccc);
});
