import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,dc:p.apis.gui.newDC(0),call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('Brush origin keeps signed device coordinates and returns previous values without modulo reduction',()=>{
 const {p,m,dc,call}=setup(),out=p.heap.alloc(12);let previous=[0,0];
 for(const pair of [[19,-12],[-2147483648,2147483647],[0,0],[8,9]]){
  m.write(out,new Uint8Array(12).fill(204));p.setError(1234);assert.equal(call('SetBrushOrgEx',dc,...pair,out),1);assert.equal(p.lastError,1234);
  assert.deepEqual([m.i32(out),m.i32(out+4)],previous);assert.equal(m.u32(out+8),0xcccccccc);
  assert.equal(call('GetBrushOrgEx',dc,out),1);assert.deepEqual([m.i32(out),m.i32(out+4)],pair);assert.equal(p.lastError,1234);previous=pair;
 }
 assert.equal(call('SetBrushOrgEx',dc,3,4,0),1);assert.equal(call('GetBrushOrgEx',dc,out),1);assert.deepEqual([m.i32(out),m.i32(out+4)],[3,4]);
});
test('Brush origin belongs to each DC and participates in nested saved state',()=>{
 const {p,m,dc,call}=setup(),other=p.apis.gui.newDC(0),out=p.heap.alloc(8);
 call('SetBrushOrgEx',dc,19,-12,0);assert.equal(call('SaveDC',dc),1);call('SetBrushOrgEx',dc,7,8,0);assert.equal(call('SaveDC',dc),2);call('SetBrushOrgEx',dc,9,10,0);
 call('RestoreDC',dc,-1);call('GetBrushOrgEx',dc,out);assert.deepEqual([m.i32(out),m.i32(out+4)],[7,8]);
 call('RestoreDC',dc,1);call('GetBrushOrgEx',dc,out);assert.deepEqual([m.i32(out),m.i32(out+4)],[19,-12]);
 call('GetBrushOrgEx',other,out);assert.deepEqual([m.i32(out),m.i32(out+4)],[0,0]);
});
test('Brush origin validates handles and full outputs before modifying DC state',()=>{
 const {p,m,dc,call}=setup(),out=p.heap.alloc(8),wrong=call('GetStockObject',0);m.w32(out,123);
 for(const handle of [0,123,wrong]){assert.equal(call('GetBrushOrgEx',handle,out),0);assert.equal(p.lastError,87);assert.equal(call('SetBrushOrgEx',handle,1,2,out),0);assert.equal(p.lastError,6);assert.equal(m.u32(out),123);}
 assert.equal(call('GetBrushOrgEx',dc,0),0);assert.equal(p.lastError,87);
 call('SetBrushOrgEx',dc,19,-12,0);m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
 assert.throws(()=>call('GetBrushOrgEx',dc,edge));assert.throws(()=>call('SetBrushOrgEx',dc,7,8,edge));assert.equal(m.u32(edge),0xcccccccc);
 call('GetBrushOrgEx',dc,out);assert.deepEqual([m.i32(out),m.i32(out+4)],[19,-12]);
});
