import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('CRT commit mode pointer is stable, writable and isolated per process',()=>{
  const {p}=guest('HelloConsole.exe'),get=()=>p.apis.lookup('msvcrt.dll','__p__commode').fn(),address=get();
  assert.equal(p.memory.u32(address),0);p.memory.w32(address,0x4000);
  assert.equal(get(),address);assert.equal(p.memory.u32(get()),0x4000);
  const {p:other}=guest('HelloConsole.exe');assert.equal(other.memory.u32(other.apis.lookup('msvcrt.dll','__p__commode').fn()),0);
});
test('CRT exit alias shares the reverse-order callback table with atexit',()=>{
  const {p}=guest('HelloConsole.exe'),c=(name,...args)=>p.apis.lookup('msvcrt.dll',name).fn(...args);
  assert.equal(c('_crt_atexit',1234),0);assert.equal(c('atexit',5678),0);
  const last=c('exit',7);assert.equal(last.call.address,5678);const first=last.then(0);assert.equal(first.call.address,1234);first.then(0);assert.equal(p.exitCode,7);
});
