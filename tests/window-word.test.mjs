import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'WindowWord',false,16);m.w32(cls+36,name);m.w32(cls+12,8);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,u,create};}
test('Window WORDs overlap DWORDs and preserve neighboring bytes without sharing across windows',()=>{
 const {p,u,create}=setup(),a=create(),b=create();u('SetWindowLongW',a,0,0x12345678);p.setError(1234);assert.equal(u('SetWindowWord',a,1,0x1234abcd),0x3456);assert.equal(u('GetWindowLongA',a,0),0x12abcd78);assert.equal(u('GetWindowWord',a,2),0x12ab);assert.equal(u('GetWindowWord',b,1),0);assert.equal(p.lastError,1234);
});
test('Window WORD bounds use per-window allocation after class default changes',()=>{
 const {p,u,create}=setup(),a=create();u('SetClassLongA',a,-18,4);const b=create();assert.equal(u('SetWindowWord',a,6,1234),0);assert.equal(u('GetWindowWord',a,6),1234);for(const [h,index]of [[a,7],[a,0x7fffffff],[b,3],[b,6]]){assert.equal(u('GetWindowWord',h,index),0);assert.equal(p.lastError,1413);assert.equal(u('SetWindowWord',h,index,7),0);assert.equal(p.lastError,1413);}
});
test('WORD user-data writes preserve the high half and return only the prior low half',()=>{
 const {p,u,create}=setup(),h=create();u('SetWindowLongA',h,-21,0x12345678);p.setError(1234);assert.equal(u('GetWindowWord',h,-21),0x5678);assert.equal(u('SetWindowWord',h,-21,0xabcd),0x5678);assert.equal(u('GetWindowLongW',h,-21),0x1234abcd);assert.equal(p.lastError,1234);
});
test('Window WORD accessors validate HWNDs and keep uncertain metadata mutations explicit',()=>{
 const {p,u,create}=setup(),h=create();assert.equal(u('GetWindowWord',h,-16),0);assert.equal(p.lastError,1413);assert.throws(()=>u('SetWindowWord',h,-16,0),/Legacy WORD/);u('DestroyWindow',h);for(const hwnd of [h,123]){assert.equal(u('GetWindowWord',hwnd,0),0);assert.equal(p.lastError,1400);assert.equal(u('SetWindowWord',hwnd,0,0),0);assert.equal(p.lastError,1400);}
});
