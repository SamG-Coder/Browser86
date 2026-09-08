import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,a=p.heap.alloc(16),b=p.heap.alloc(16),out=p.heap.alloc(16);return {p,m,a,b,out,write:(ptr,r)=>r.forEach((v,i)=>m.w32(ptr+i*4,v)),read:ptr=>[0,4,8,12].map(i=>m.i32(ptr+i)),call:(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args)};}
test('Win32 rectangles: native intersections, unions and bounding differences match with aliasing',()=>{
  const {a,b,out,write,read,call}=setup(),vectors=JSON.parse(fs.readFileSync(new URL('./rectangle-native-vectors.json',import.meta.url)));
  for(const [name,x,y,result,expected] of vectors)for(const dest of [out,a,b]){write(a,x);write(b,y);assert.equal(call(name,dest,a,b),result);assert.deepEqual(read(dest),expected);}
  assert.equal(vectors.length,3072);
});
test('Win32 rectangles: point inclusion excludes right/bottom and empty/inverted rectangles',()=>{
  const {a,write,call}=setup();write(a,[-10,-5,10,5]);
  for(const [x,y,result] of [[-10,-5,1],[9,4,1],[10,0,0],[0,5,0],[-11,0,0],[0,-6,0]])assert.equal(call('PtInRect',a,x,y),result);
  write(a,[10,5,-10,-5]);assert.equal(call('IsRectEmpty',a),1);assert.equal(call('PtInRect',a,0,0),0);
});
test('Win32 rectangles: constructors, copy, equality, inflate and offset retain signed 32-bit coordinates',()=>{
  const {p,a,b,read,call}=setup();p.setError(123);
  assert.equal(call('SetRect',a,0,1,10,11),1);assert.equal(call('CopyRect',b,a),1);assert.equal(call('EqualRect',a,b),1);
  call('InflateRect',a,2,3);assert.deepEqual(read(a),[-2,-2,12,14]);call('OffsetRect',a,-3,4);assert.deepEqual(read(a),[-5,2,9,18]);
  call('SetRect',a,2147483647,0,2147483647,1);call('OffsetRect',a,1,0);assert.equal(read(a)[0],-2147483648);
  call('SetRectEmpty',a);assert.deepEqual(read(a),[0,0,0,0]);assert.equal(call('IsRectEmpty',a),1);assert.equal(p.lastError,123);
});
test('Win32 rectangles: complete destination validation prevents partial writes',()=>{
  const {m,a,b,out,write,call}=setup();write(a,[0,0,10,10]);write(b,[2,2,8,8]);m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
  for(const name of ['IntersectRect','UnionRect','SubtractRect'])assert.throws(()=>call(name,edge,a,b));
  assert.throws(()=>call('SetRect',edge,1,2,3,4));assert.throws(()=>call('InflateRect',edge,1,2));assert.equal(m.u32(edge),0xcccccccc);
  write(out,[123,123,123,123]);assert.throws(()=>call('CopyRect',out,edge));assert.equal(m.i32(out),123);
});
