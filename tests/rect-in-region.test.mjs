import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
const vectors=JSON.parse(fs.readFileSync(new URL('./rect-in-region-vectors.json',import.meta.url),'utf8'));
test('RectInRegion matches 2508 native normalized, boundary, empty and signed-coordinate cases',()=>{
 const {p}=guest('HelloConsole.exe'),m=p.memory,call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),input=p.heap.alloc(16);
 for(const v of vectors){const h=call('CreateRectRgn',...v.bounds);for(const [l,t,r,b,result,error] of v.cases){[l,t,r,b].forEach((n,i)=>m.w32(input+4*i,n));p.setError(1234);assert.equal(call('RectInRegion',h,input),result,JSON.stringify([v.bounds,l,t,r,b]));assert.equal(p.lastError,error);assert.deepEqual([0,4,8,12].map(i=>m.i32(input+i)),[l,t,r,b]);}assert.equal(call('DeleteObject',h),1);}
});
test('RectInRegion validates input for valid regions and preserves invalid-handle last error',()=>{
 const {p}=guest('HelloConsole.exe'),m=p.memory,call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),h=call('CreateRectRgn',1,2,10,20),empty=call('CreateRectRgn',0,0,0,0);
 for(const bad of [0,123,call('GetStockObject',0)]){p.setError(1234);assert.equal(call('RectInRegion',bad,0),0);assert.equal(p.lastError,1234);}
 m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);for(const ptr of [0,edge]){assert.throws(()=>call('RectInRegion',h,ptr));p.setError(1234);assert.equal(call('RectInRegion',empty,ptr),0);assert.equal(p.lastError,1234);}assert.equal(m.u32(edge),0xcccccccc);
 const out=p.heap.alloc(16);assert.equal(call('GetRgnBox',h,out),2);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[1,2,10,20]);
});
