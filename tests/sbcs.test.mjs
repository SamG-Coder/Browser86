import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,out=p.heap.alloc(1024,true),used=p.heap.alloc(4,true);return {p,m,out,used,s:text=>p.heap.string(text,true),bytes:values=>{const a=p.heap.alloc(values.length);m.write(a,Uint8Array.from(values));return a;},call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args)};}
test('Win32 SBCS: exact OEM round trip for all bytes and ACP/thread/OEM aliases',()=>{
  const {m,out,used,bytes,call}=setup(),values=Array.from({length:256},(_,i)=>i),src=bytes(values),encoded=out+512;
  assert.equal(call('MultiByteToWideChar',1,0,src,256,out,256),256);
  assert.equal(call('WideCharToMultiByte',437,0x400,out,256,encoded,256,0,used),256);assert.deepEqual([...m.read(encoded,256)],values);assert.equal(m.u32(used),0);
  for(const cp of [0,3,1252]){assert.equal(call('MultiByteToWideChar',cp,0,bytes([128,233]),2,out,16),2);assert.equal(m.u16(out),0x20ac);assert.equal(m.u16(out+2),233);}
});
test('Win32 SBCS: best-fit versus exact mapping, custom defaults and surrogate code units',()=>{
  const {p,m,out,used,s,bytes,call}=setup(),fallback=bytes([33]);p.setError(123);
  assert.equal(call('WideCharToMultiByte',1252,0,s('∞Ā'),2,out,16,fallback,used),2);assert.equal(m.cstr(out),'8A');assert.equal(m.u32(used),0);
  assert.equal(call('WideCharToMultiByte',1252,0x400,s('∞Ā'),2,out,16,fallback,used),2);assert.deepEqual([...m.read(out,2)],[33,33]);assert.equal(m.u32(used),1);
  assert.equal(call('WideCharToMultiByte',437,0x400,s('∞'),1,out,16,0,used),1);assert.equal(m.u8(out),236);assert.equal(m.u32(used),0);
  assert.equal(call('WideCharToMultiByte',1252,0,s('😀'),2,out,16,fallback,used),2);assert.deepEqual([...m.read(out,2)],[33,33]);assert.equal(m.u32(used),1);assert.equal(p.lastError,123);
});
test('Win32 SBCS: decomposition, glyph mode, signed counts and query default reporting',()=>{
  const {m,out,used,s,bytes,call}=setup();
  assert.equal(call('MultiByteToWideChar',1252,2,bytes([233]),1,out,16),2);assert.equal(m.u16(out),101);assert.equal(m.u16(out+2),0x301);
  assert.equal(call('MultiByteToWideChar',437,4,bytes([1]),1,out,16),1);assert.equal(m.u16(out),0x263a);
  assert.equal(call('MultiByteToWideChar',437,0,bytes([65,0]),-2,out,16),2);
  assert.equal(call('WideCharToMultiByte',1252,0x400,s('☃'),-1,0,0,0,used),2);assert.equal(m.u32(used),1);
});
test('Win32 SBCS: short buffers preserve native prefixes and report substitutions actually written',()=>{
  const {p,m,out,used,s,bytes,call}=setup();
  for(const [text,byte,flag] of [['A☃',65,0],['☃A',63,1]]){m.fill(out,4,204);assert.equal(call('WideCharToMultiByte',1252,0,s(text),2,out,1,0,used),0);assert.equal(p.lastError,122);assert.equal(m.u8(out),byte);assert.equal(m.u8(out+1),204);assert.equal(m.u32(used),flag);}
  assert.equal(call('MultiByteToWideChar',1252,0,bytes([65,66]),2,out,1),0);assert.equal(p.lastError,122);assert.equal(m.u16(out),65);
  assert.equal(call('MultiByteToWideChar',1252,2,bytes([233]),1,out,1),1);assert.equal(m.u16(out),101);
});
test('Win32 SBCS: invalid flags, unsupported composition and memory errors are explicit',()=>{
  const {p,m,out,used,s,bytes,call}=setup(),a=bytes([65]),w=s('A');
  assert.equal(call('MultiByteToWideChar',1252,3,a,1,out,16),0);assert.equal(p.lastError,1004);
  assert.equal(call('WideCharToMultiByte',437,128,w,1,out,16,0,used),0);assert.equal(p.lastError,1004);
  assert.throws(()=>call('WideCharToMultiByte',1252,512,w,1,out,16,0,used),e=>e.code==='UNSUPPORTED_NLS');
  m.map(0x60000000,4096);m.w16(0x60000ffe,0xcccc);
  assert.throws(()=>call('MultiByteToWideChar',1252,2,bytes([233]),1,0x60000ffe,2));assert.equal(m.u16(0x60000ffe),0xcccc);
  m.w8(out,204);assert.throws(()=>call('WideCharToMultiByte',1252,0,w,1,out,16,0,0x60000ffe));assert.equal(m.u8(out),204);
});
