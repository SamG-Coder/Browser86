import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,out:p.heap.alloc(544),call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 code pages: concrete availability differs from aliases and preserves last error',()=>{
  const {p,call}=setup();p.setError(123);
  for(const cp of [437,1252,65001])assert.equal(call('IsValidCodePage',cp),1);
  for(const cp of [0,1,3,932,99999,0xffffffff])assert.equal(call('IsValidCodePage',cp),0);
  assert.equal(p.lastError,123);
});
test('Win32 code pages: basic x86 structure and aliases report fixed profiles',()=>{
  const {m,out,call}=setup();
  for(const [cp,max] of [[0,1],[1,1],[3,1],[437,1],[1252,1],[65001,4]]){
    m.fill(out,24,0xcc);assert.equal(call('GetCPInfo',cp,out),1);assert.equal(m.u32(out),max);assert.equal(m.u8(out+4),63);
    assert.deepEqual([...m.read(out+5,13)],Array(13).fill(0));assert.equal(m.u32(out+20),0xcccccccc);
  }
});
test('Win32 code pages: ANSI/Unicode extended structures contain exact offsets and names',()=>{
  const {m,out,call}=setup();
  for(const wide of [false,true])for(const [cp,id,name] of [[0,1252,'1252  (ANSI - Latin I)'],[1,437,'437   (OEM - United States)'],[65001,65001,'65001 (UTF-8)']]){
    assert.equal(call('GetCPInfoEx'+(wide?'W':'A'),cp,0,out),1);assert.equal(m.u16(out+18),id===65001?0xfffd:63);assert.equal(m.u32(out+20),id);
    assert.equal(wide?m.wstr(out+24):m.cstr(out+24),name);
  }
});
test('Win32 code pages: flags and unsupported pages fail without writes, ranges validate atomically',()=>{
  const {p,m,out,call}=setup();m.fill(out,544,0xcc);
  assert.equal(call('GetCPInfoExW',1252,1,out),0);assert.equal(p.lastError,1004);assert.equal(m.u32(out),0xcccccccc);
  assert.equal(call('GetCPInfo',99999,out),0);assert.equal(p.lastError,87);assert.equal(m.u32(out),0xcccccccc);
  assert.equal(call('GetCPInfoExW',65001,1,out),1);
  m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
  for(const name of ['GetCPInfo','GetCPInfoExA','GetCPInfoExW'])assert.throws(()=>name==='GetCPInfo'?call(name,1252,edge):call(name,1252,0,edge));
  assert.equal(m.u32(edge),0xcccccccc);
});
