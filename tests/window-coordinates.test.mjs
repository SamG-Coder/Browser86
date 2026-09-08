import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Window rectangles use nested child screen bounds and client dimensions',()=>{
 const {p,m,call}=setup(),out=p.heap.alloc(16),windows=p.apis.gui.windows;
 windows.set(4,{hwnd:4,parent:2,style:0x40000000,x:-3,y:5,width:11,height:13});
 windows.get(3).width=11;windows.get(3).height=13;
 const rect=()=>[0,4,8,12].map(i=>m.i32(out+i));p.setError(1234);
 assert.equal(call('GetWindowRect',4,out),1);assert.deepEqual(rect(),[44,64,55,77]);assert.equal(p.lastError,1234);
 assert.equal(call('GetClientRect',4,out),1);assert.deepEqual(rect(),[0,0,11,13]);assert.equal(p.lastError,1234);
 assert.equal(call('GetWindowRect',3,out),1);assert.deepEqual(rect(),[-5,20,6,33]);
 windows.get(1).x=-100;assert.equal(call('GetWindowRect',4,out),1);assert.deepEqual(rect(),[-96,64,-85,77]);
});
test('Rectangle queries reject invalid windows and null outputs and validate all sixteen bytes',()=>{
 const {p,m,call}=setup();m.map(0x60000000,4096);const out=0x60000ff8;
 for(const name of ['GetWindowRect','GetClientRect']){
  p.setError(1234);assert.equal(call(name,123,0),0);assert.equal(p.lastError,1400);
  assert.equal(call(name,1,0),0);assert.equal(p.lastError,1400);
  m.w32(out,123);m.w32(out+4,456);assert.equal(call(name,123,out),0);assert.equal(p.lastError,1400);
  assert.throws(()=>call(name,1,out));assert.deepEqual([m.u32(out),m.u32(out+4)],[123,456]);
 }
});
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
