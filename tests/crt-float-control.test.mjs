import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('CRT startup precision request updates the real x87 control word',()=>{
  const {p}=guest('HelloConsole.exe'),out=p.heap.alloc(4),c=p.apis.lookup('msvcrt.dll','_controlfp_s').fn;
  assert.equal(c(out,0,0),0);assert.equal(p.memory.u32(out),0x8001f);
  assert.equal(c(out,0x10000,0x30000),0);assert.equal(p.cpu.fpuControl,0x27f);assert.equal(p.memory.u32(out),0x9001f);assert.equal(p.cpu.mxcsr,0x1f80);
  assert.equal(c(0,0,0),0);assert.throws(()=>c(out,0x100,0x300),{code:'CRT_FLOAT_CONTROL'});assert.equal(p.cpu.fpuControl,0x27f);
  assert.equal(c(out,0x80000000,0x80000000),22);
});
test('CRT controlfp leaves the denormal exception mask unchanged',()=>{
  const {p}=guest('HelloConsole.exe'),c=p.apis.lookup('msvcrt.dll','_controlfp_s').fn;p.cpu.fpuControl&=~2;p.cpu.mxcsr&=~0x100;
  c(0,0x10000,0x30000);assert.equal(p.cpu.fpuControl&2,0);assert.equal(p.cpu.mxcsr&0x100,0);
});
