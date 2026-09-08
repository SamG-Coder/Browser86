import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('Rectangular regions normalize bounds and distinguish empty regions and point edges',()=>{
 const {p,m,call}=setup(),input=p.heap.alloc(16),out=p.heap.alloc(20);
 for(const r of [[1,2,10,20],[10,20,1,2],[10,2,1,20],[1,20,10,2]]){
  r.forEach((n,i)=>m.w32(input+4*i,n));const a=call('CreateRectRgn',...r),b=call('CreateRectRgnIndirect',input);m.w32(input,99);assert.equal(call('EqualRgn',a,b),1);assert.equal(call('GetObjectType',a),8);
  m.write(out,new Uint8Array(20).fill(204));assert.equal(call('GetRgnBox',a,out),2);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[1,2,10,20]);assert.equal(m.u32(out+16),0xcccccccc);
  for(const [x,y,result] of [[1,2,1],[9,19,1],[10,2,0],[1,20,0],[0,2,0]])assert.equal(call('PtInRegion',a,x,y),result);
  assert.equal(call('DeleteObject',a),1);assert.equal(call('DeleteObject',b),1);
 }
 const a=call('CreateRectRgn',1,2,1,20),b=call('CreateRectRgn',50,30,70,30);assert.equal(call('EqualRgn',a,b),1);assert.equal(call('GetRgnBox',a,out),1);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[0,0,0,0]);assert.equal(call('PtInRegion',a,1,2),0);assert.equal(call('OffsetRgn',a,2147483647,2147483647),1);
});
test('Region creation range and mutation follow distinct native coordinate limits',()=>{
 const {p,m,call}=setup(),out=p.heap.alloc(16);
 for(const x of [-0x8000000,0x7ffffff]){p.setError(1234);const h=call('CreateRectRgn',x,0,0,1);assert.ok(h);assert.equal(p.lastError,1234);call('DeleteObject',h);}
 for(const x of [-0x8000001,0x8000000,2147483647,-2147483648]){assert.equal(call('CreateRectRgn',x,0,0,1),0);assert.equal(p.lastError,87);}
 const h=call('CreateRectRgn',1,2,10,20);assert.equal(call('OffsetRgn',h,2,-1),2);call('GetRgnBox',h,out);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[3,1,12,19]);
 p.setError(1234);assert.equal(call('OffsetRgn',h,2147483647,0),0);assert.equal(p.lastError,1234);call('GetRgnBox',h,out);assert.equal(m.i32(out),3);
 assert.equal(call('SetRectRgn',h,0,0,2147483647,5),1);assert.equal(call('GetRgnBox',h,out),2);assert.equal(m.i32(out+8),2147483647);assert.equal(call('OffsetRgn',h,1,0),0);
});
test('Region invalid handles preserve native errors and guest outputs validate atomically',()=>{
 const {p,m,call}=setup(),h=call('CreateRectRgn',1,2,10,20),wrong=call('GetStockObject',0),out=p.heap.alloc(16);m.w32(out,123);
 for(const bad of [0,123,wrong]){for(const [n,args] of [['GetRgnBox',[bad,out]],['EqualRgn',[h,bad]],['SetRectRgn',[bad,1,2,3,4]],['OffsetRgn',[bad,1,2]]]){p.setError(1234);assert.equal(call(n,...args),0);assert.equal(p.lastError,1234);}assert.equal(call('PtInRegion',bad,1,2),0);assert.equal(p.lastError,6);}
 assert.equal(m.u32(out),123);m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
 for(const ptr of [0,edge]){const count=p.handles.size;assert.throws(()=>call('CreateRectRgnIndirect',ptr));assert.equal(p.handles.size,count);assert.throws(()=>call('GetRgnBox',h,ptr));}assert.equal(m.u32(edge),0xcccccccc);
 for(const n of ['GetObjectA','GetObjectW']){assert.equal(call(n,h,16,out),0);assert.equal(p.lastError,6);}
 const dc=p.apis.gui.newDC(0);assert.equal(call('SelectObject',dc,h),2);
});
