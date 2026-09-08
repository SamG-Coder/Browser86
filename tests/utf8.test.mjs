import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,out=p.heap.alloc(128,true);return {p,m,out,bytes:values=>{const a=p.heap.alloc(values.length);m.write(a,Uint8Array.from(values));return a;},s:text=>p.heap.string(text,true),call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(65001,...args)};}
test('Win32 UTF-8: BOM preservation, supplementary characters and terminator counts',()=>{
  const {p,m,out,bytes,s,call}=setup(),src=bytes([239,187,191,65,240,159,152,128,0]);p.setError(123);
  assert.equal(call('MultiByteToWideChar',8,src,-1,0,0),5);assert.equal(call('MultiByteToWideChar',8,src,-2,out,64),5);assert.equal(m.wstr(out),'\ufeffA😀');
  assert.equal(call('WideCharToMultiByte',0x80,s('\ufeffA😀'),-2,out,128,0,0),9);assert.deepEqual([...m.read(out,9)],[239,187,191,65,240,159,152,128,0]);assert.equal(p.lastError,123);
  assert.equal(call('MultiByteToWideChar',0,bytes([65,0,66]),3,out,64),3);assert.equal(m.u16(out+4),66);
});
test('Win32 UTF-8: malformed byte sequences match native replacement consumption and strict failures',()=>{
  const {p,m,out,bytes,call}=setup();
  for(const [input,expected] of [[[0xed,0xa0,0x80],[65533,65533]],[[0xe0,0x80,0x80],[65533,65533]],[[0xf0,0x80,0x80,0x80],[65533,65533,65533]],[[0xf4,0x90,0x80,0x80],[65533,65533,65533]],[[0xe2,0x82],[65533]],[[0xc0,0xaf],[65533,65533]],[[0xf0,0x90,65,0x80],[65533,65,65533]]]){
    const src=bytes(input);assert.equal(call('MultiByteToWideChar',0,src,input.length,out,64),expected.length);assert.deepEqual(expected.map((_,i)=>m.u16(out+i*2)),expected);
    m.w32(out,0xcccccccc);assert.equal(call('MultiByteToWideChar',8,src,input.length,out,64),0);assert.equal(p.lastError,1113);assert.equal(m.u32(out),0xcccccccc);
  }
});
test('Win32 UTF-8: unpaired UTF-16 surrogates reject strictly or encode replacement characters',()=>{
  const {p,m,out,s,call}=setup();
  for(const text of ['\ud800','\udc00','\ud800A','\ud800\ud800']){
    const src=s(text),expected=new TextEncoder().encode(text);
    assert.equal(call('WideCharToMultiByte',0,src,text.length,out,128,0,0),expected.length);assert.deepEqual(m.read(out,expected.length),expected);
    m.w32(out,0xcccccccc);assert.equal(call('WideCharToMultiByte',0x80,src,text.length,out,128,0,0),0);assert.equal(p.lastError,1113);assert.equal(m.u32(out),0xcccccccc);
  }
});
test('Win32 UTF-8: flags, pointers, capacities and complete output memory are validated',()=>{
  const {p,m,out,s,bytes,call}=setup(),a=bytes([65,0]),w=s('A');
  assert.equal(call('MultiByteToWideChar',1,a,1,out,64),0);assert.equal(p.lastError,1004);
  assert.equal(call('WideCharToMultiByte',8,w,1,out,128,0,0),0);assert.equal(p.lastError,1004);
  for(const [d,u] of [[a,0],[0,out]]){assert.equal(call('WideCharToMultiByte',0,w,1,out,128,d,u),0);assert.equal(p.lastError,87);}
  assert.equal(call('MultiByteToWideChar',0,a,0,out,64),0);assert.equal(p.lastError,87);
  assert.equal(call('WideCharToMultiByte',0,w,1,0,1,0,0),0);assert.equal(p.lastError,87);
  m.w32(out,0xcccccccc);assert.equal(call('WideCharToMultiByte',0,s('é'),1,out,1,0,0),0);assert.equal(p.lastError,122);assert.equal(m.u32(out),0xcccccccc);
  m.map(0x60000000,4096);const edge=0x60000ffe;m.w16(edge,0xcccc);
  assert.throws(()=>call('MultiByteToWideChar',0,bytes([65,66]),2,edge,2));assert.equal(m.u16(edge),0xcccc);
  assert.throws(()=>call('WideCharToMultiByte',0,s('€'),1,edge,3,0,0));assert.equal(m.u16(edge),0xcccc);
});
