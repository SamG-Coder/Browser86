import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');for(const w of [{hwnd:1,x:40,y:50,style:0x80000000},{hwnd:2,x:7,y:9,parent:1,style:0x40000000},{hwnd:3,x:-5,y:20,parent:1,style:0x80000000}])p.apis.gui.windows.set(w.hwnd,w);return {p,m:p.memory,call:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a)};}
test('Window coordinate conversions accumulate child origins but not popup owners',()=>{
 const {p,m,call}=setup(),point=p.heap.alloc(8);p.setError(1234);assert.equal(call('ClientToScreen',2,point),1);assert.deepEqual([m.i32(point),m.i32(point+4)],[47,59]);assert.equal(p.lastError,1234);assert.equal(call('ScreenToClient',2,point),1);assert.deepEqual([m.i32(point),m.i32(point+4)],[0,0]);call('ClientToScreen',3,point);assert.deepEqual([m.i32(point),m.i32(point+4)],[-5,20]);
});
test('MapWindowPoints translates arrays and packs signed deltas independently of point count',()=>{
 const {p,m,call}=setup(),points=p.heap.alloc(16);[0,0,10,20].forEach((v,i)=>m.w32(points+4*i,v));assert.equal(call('MapWindowPoints',2,0,points,2),0x003b002f);assert.deepEqual([0,4,8,12].map(i=>m.i32(points+i)),[47,59,57,79]);assert.equal(call('MapWindowPoints',0,2,points,2),0xffc5ffd1);assert.deepEqual([0,4,8,12].map(i=>m.i32(points+i)),[0,0,10,20]);assert.equal(call('MapWindowPoints',2,0,0,0),0x003b002f);p.setError(1234);assert.equal(call('MapWindowPoints',0,0,points,2),0);assert.equal(p.lastError,1234);
});
test('Coordinate APIs validate full point arrays before writing and reject mirrored layouts',()=>{
 const {p,m,call}=setup(),point=p.heap.alloc(8);for(const n of ['ClientToScreen','ScreenToClient']){assert.equal(call(n,0,point),0);assert.equal(p.lastError,1400);assert.equal(call(n,2,0),0);assert.equal(p.lastError,1400);}assert.equal(call('MapWindowPoints',123,0,0,0),0);assert.equal(p.lastError,1400);
 m.map(0x60000000,4096);const edge=0x60000ff8;m.w32(edge,123);assert.throws(()=>call('MapWindowPoints',2,0,edge,2));assert.equal(m.u32(edge),123);assert.throws(()=>call('MapWindowPoints',2,0,0,1));p.apis.gui.windows.get(1).exStyle=0x400000;assert.throws(()=>call('ClientToScreen',2,point),e=>e.code==='UNSUPPORTED_GUI');
});
