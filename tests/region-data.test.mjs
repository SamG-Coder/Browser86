import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('GetRegionData exports native headers and rectangles with size queries and untouched tails',()=>{
 const {p,m,call}=setup(),out=p.heap.alloc(68);
 for(const [bounds,expected] of [[[10,20,1,2],[32,1,1,16,1,2,10,20,1,2,10,20]],[[1,2,1,20],[32,1,0,0,0,0,0,0]],[[-10,-20,-1,-2],[32,1,1,16,-10,-20,-1,-2,-10,-20,-1,-2]]]){
  const h=call('CreateRectRgn',...bounds),size=expected.length*4;
  for(const count of [0,1,31,32,47,48,64,0xffffffff]){p.setError(1234);assert.equal(call('GetRegionData',h,count,0),size);assert.equal(p.lastError,1234);m.write(out,new Uint8Array(68).fill(204));
   const result=call('GetRegionData',h,count,out);assert.equal(result,count<size?0:size);assert.equal(p.lastError,count<size?87:1234);
   if(count<size)assert.ok(m.read(out,68).every(n=>n===204));else{assert.deepEqual(expected.map((_,i)=>m.i32(out+4*i)),expected);assert.ok(m.read(out+size,68-size).every(n=>n===204));}
  }call('DeleteObject',h);
 }
});
test('GetRegionData reflects mutations and validates only the actual output size atomically',()=>{
 const {p,m,call}=setup(),h=call('CreateRectRgn',1,2,10,20),out=p.heap.alloc(48);
 call('OffsetRgn',h,2,-1);call('GetRegionData',h,48,out);assert.deepEqual([16,20,24,28,32,36,40,44].map(i=>m.i32(out+i)),[3,1,12,19,3,1,12,19]);
 m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);assert.throws(()=>call('GetRegionData',h,48,edge));assert.equal(m.u32(edge),0xcccccccc);assert.equal(call('GetRegionData',h,1,edge),0);assert.equal(p.lastError,87);
 assert.equal(call('GetRegionData',h,100,0x60000fd0),48);
 call('SetRectRgn',h,1,2,1,20);assert.equal(call('GetRegionData',h,0,0),32);assert.equal(call('GetRegionData',h,100,0x60000fe0),32);
 for(const bad of [0,123,call('GetStockObject',0)])for(const ptr of [0,edge]){assert.equal(call('GetRegionData',bad,48,ptr),0);assert.equal(p.lastError,6);}
});
