import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide,extended){const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a),cls=p.heap.alloc(48,true),name=p.heap.alloc(32);m.string(name,'QueryClass',wide,11);const o=extended?4:0;if(extended)m.w32(cls,48);[3,0,8,12,0,111,222,6,123,name].forEach((v,i)=>m.w32(cls+o+i*4,v));if(extended)m.w32(cls+44,333);const atom=call('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls),h=call('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,m,call,h,atom,cls};}
test('GetClassLong retains x86 registration fields across all A/W and extended variants',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){const {p,m,call,h,atom,cls}=setup(wide,extended);m.fill(cls,48,0);for(const suffix of ['A','W'])for(const [index,value]of [[-32,atom],[-26,3],[-20,8],[-18,12],[-16,p.main.base],[-14,111],[-12,222],[-10,6],[-34,extended?333:0],[-8,123]]){p.setError(1234);assert.equal(call('GetClassLong'+suffix,h,index),value);assert.equal(p.lastError,1234);}}
});
test('Class extra DWORD queries accept unaligned in-bounds offsets and reject overflow',()=>{
 const {p,call,h}=setup(false,false);for(const i of [0,1,4]){p.setError(1234);assert.equal(call('GetClassLongA',h,i),0);assert.equal(p.lastError,1234);}for(const i of [5,8,0x7fffffff,-100]){assert.equal(call('GetClassLongW',h,i),0);assert.equal(p.lastError,1413);}
});
test('Class procedure queries remain class-based after window subclassing and reject unsupported thunks',()=>{
 const {p,call,h}=setup(false,false);call('SetWindowLongW',h,-4,456);assert.equal(call('GetClassLongA',h,-24),0);assert.throws(()=>call('GetClassLongW',h,-24),/thunks/);
});
test('Class queries reject invalid and destroyed windows and explicitly identify built-in metadata gaps',()=>{
 const {p,m,call,h}=setup(true,true);assert.equal(call('GetClassLongW',123,-32),0);assert.equal(p.lastError,1400);call('DestroyWindow',h);assert.equal(call('GetClassLongA',h,-32),0);assert.equal(p.lastError,1400);const name=p.heap.alloc(16);m.string(name,'STATIC',false,16);const builtin=call('CreateWindowExA',0,name,0,0,0,0,20,20,0,0,0,0);assert.throws(()=>call('GetClassLongA',builtin,-32),/Built-in/);
});
