import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
import {shellArguments} from '../src/runtime/command-line.js';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,count=p.heap.alloc(4,true);return {p,m,count,s:text=>p.heap.string(text,true),call:(src,out=count)=>p.apis.lookup('shell32.dll','CommandLineToArgvW').fn(src,out)};}
test('Win32 command line: shell parsing matches seeded native cases',()=>{
  const vectors=JSON.parse(fs.readFileSync(new URL('./command-line-native-vectors.json',import.meta.url)));
  for(const [input,expected] of vectors)assert.deepEqual(shellArguments(input),expected,JSON.stringify(input));assert.equal(vectors.length,1031);
});
test('Win32 command line: contiguous x86 pointer/string allocation is released by one LocalFree',()=>{
  const {p,m,count,s,call}=setup();p.setError(123);const block=call(s('"C:\\app name\\a.exe" "one two" three'));
  assert.equal(m.u32(count),3);assert.equal(p.lastError,123);const size=p.heap.blocks.get(block);
  const args=Array.from({length:3},(_,i)=>{const ptr=m.u32(block+i*4);assert.ok(ptr>=block+16&&ptr<block+size);return m.wstr(ptr);});
  assert.deepEqual(args,['C:\\app name\\a.exe','one two','three']);assert.equal(p.apis.lookup('kernel32.dll','LocalFree').fn(block),0);assert.equal(p.heap.blocks.has(block),false);
});
test('Win32 command line: empty input uses guest executable and leading whitespace yields empty argv zero',()=>{
  const {p,m,count,s,call}=setup();let block=call(s(''));assert.equal(m.u32(count),1);assert.equal(m.wstr(m.u32(block)),p.exePath.replaceAll('/','\\'));
  block=call(s(' \t alpha ""'));assert.equal(m.u32(count),3);assert.deepEqual([0,1,2].map(i=>m.wstr(m.u32(block+i*4))),['','alpha','']);
});
test('Win32 command line: bad output/input pointers do not allocate or overwrite the count',()=>{
  const {p,m,count,s,call}=setup(),src=s('a');const before=p.heap.blocks.size;
  assert.equal(call(0),0);assert.equal(p.lastError,87);assert.equal(call(src,0),0);assert.equal(p.lastError,87);
  assert.throws(()=>call(src,0x60000000));m.w32(count,123);assert.throws(()=>call(0x60000000));assert.equal(m.u32(count),123);assert.equal(p.heap.blocks.size,before);
});
