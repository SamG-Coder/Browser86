import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');p.apis.gui.windows.set(1,{width:8,height:8});return {p,m:p.memory,dc:p.apis.gui.newDC(1),call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('Clip visibility intersects application clips with the current surface and saved state',()=>{
 const {p,m,dc,call}=setup(),out=p.heap.alloc(20),r=call('CreateRectRgn',-2,-3,6,7);m.w32(out+16,0xcccccccc);
 assert.equal(call('GetClipBox',dc,out),2);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[0,0,8,8]);call('SelectClipRgn',dc,r);call('SaveDC',dc);call('GetClipBox',dc,out);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[0,0,6,7]);assert.equal(m.u32(out+16),0xcccccccc);
 const empty=call('CreateRectRgn',0,0,0,0);call('SelectClipRgn',dc,empty);assert.equal(call('GetClipBox',dc,out),1);assert.deepEqual([0,4,8,12].map(i=>m.i32(out+i)),[0,0,0,0]);assert.equal(call('PtVisible',dc,1,1),0);
 call('RestoreDC',dc,-1);assert.equal(call('PtVisible',dc,5,6),1);assert.equal(call('PtVisible',dc,6,6),0);assert.equal(call('PtVisible',dc,5,7),0);p.apis.gui.windows.get(1).width=4;call('GetClipBox',dc,out);assert.equal(m.i32(out+8),4);
});
test('RectVisible normalizes query corners and uses strict overlap at degenerate boundaries',()=>{
 const {p,m,dc,call}=setup(),input=p.heap.alloc(16);call('SelectClipRgn',dc,call('CreateRectRgn',2,2,6,6));
 for(const [rect,result] of [[[6,2,7,6],0],[[6,6,6,6],0],[[2,2,2,2],0],[[6,6,2,2],1],[[3,0,3,8],1],[[3,3,3,3],1],[[0,0,1,1],0]]){rect.forEach((n,i)=>m.w32(input+4*i,n));p.setError(1234);assert.equal(call('RectVisible',dc,input),result);assert.equal(p.lastError,1234);}
});
test('Visibility APIs preserve distinct invalid handle and null pointer behavior',()=>{
 const {p,m,dc,call}=setup(),out=p.heap.alloc(16);p.setError(1234);assert.equal(call('GetClipBox',dc,0),0);assert.equal(p.lastError,1234);assert.equal(call('RectVisible',0,0),0);assert.equal(p.lastError,1234);
 for(const bad of [0,123,call('GetStockObject',4)]){assert.equal(call('GetClipBox',bad,out),0);assert.equal(p.lastError,6);assert.equal(call('PtVisible',bad,1,1),-1);assert.equal(p.lastError,6);assert.equal(call('RectVisible',bad,out),-1);assert.equal(p.lastError,6);}
 m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);assert.throws(()=>call('GetClipBox',dc,edge));assert.equal(m.u32(edge),0xcccccccc);assert.throws(()=>call('RectVisible',dc,edge));
});
