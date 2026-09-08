import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide=false,extended=false,proc=0){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),name=p.heap.alloc(24),cls=p.heap.alloc(48,true),o=extended?4:0;m.string(name,'ExtraClass',wide,11);if(extended)m.w32(cls,48);m.w32(cls+o+4,proc);m.w32(cls+o+8,8);m.w32(cls+o+12,8);m.w32(cls+o+36,name);const atom=u('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,m,u,create,atom};}
test('Window extra storage starts at zero and supports overlapping A/W DWORD writes for all class variants',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){const {p,u,create}=setup(wide,extended),h=create();p.setError(1234);assert.equal(u('GetWindowLongW',h,4),0);assert.equal(u('SetWindowLongA',h,0,0x12345678),0);assert.equal(u('GetWindowLongW',h,1),0x123456);assert.equal(u('SetWindowLongW',h,1,0xaabbccdd),0x123456);assert.equal(u('GetWindowLongA',h,0),0xbbccdd78);assert.equal(p.lastError,1234);}
});
test('Window data is independent of sibling windows, class extra data and GWL_USERDATA',()=>{
 const {u,create}=setup(),h=create(),other=create();u('SetClassLongA',h,0,123);u('SetWindowLongA',h,-21,456);u('SetWindowLongA',h,0,789);assert.equal(u('GetWindowLongW',other,0),0);assert.equal(u('GetClassLongW',h,0),123);assert.equal(u('GetWindowLongW',h,-21),456);u('DestroyWindow',h);assert.equal(u('GetWindowLongA',create(),0),0);assert.equal(u('GetWindowLongA',other,0),0);
});
test('Window extra storage is available during creation and destruction callbacks',()=>{
 const {u,create}=setup(false,false,12345);let result=create(),h=result.call.args[0];assert.equal(result.call.args[1],129);assert.equal(u('SetWindowLongW',h,0,0xabcdef12),0);result=result.then(1);assert.equal(u('GetWindowLongA',h,0),0xabcdef12);assert.equal(result.then(0),h);result=u('DestroyWindow',h);while(result?.call){assert.equal(u('GetWindowLongW',h,0),0xabcdef12);result=result.then(0);}assert.equal(u('GetWindowLongA',h,0),0);
});
test('Window extra bounds and invalid handles fail before modifying data',()=>{
 const {p,u,create}=setup(),h=create();u('SetWindowLongA',h,4,0xdeadbeef);for(const index of [5,8,0x7fffffff])for(const suffix of ['A','W']){assert.equal(u('SetWindowLong'+suffix,h,index,0),0);assert.equal(p.lastError,1413);assert.equal(u('GetWindowLong'+suffix,h,index),0);assert.equal(p.lastError,1413);assert.equal(u('GetWindowLongA',h,4),0xdeadbeef);}assert.equal(u('SetWindowLongW',123,0,1),0);assert.equal(p.lastError,1400);
});
