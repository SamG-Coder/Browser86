import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'CancelMode',false,16);m.w32(cls+36,name);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,u,create};}
test('Default cancellation releases only the receiving window capture and ignores unused parameters',()=>{
 const {p,u,create}=setup(),a=create(),b=create();for(const suffix of ['A','W']){u('SetCapture',a);p.setError(1234);assert.equal(u('DefWindowProc'+suffix,b,31,123,456),0);assert.equal(u('GetCapture'),a);assert.equal(u('DefWindowProc'+suffix,a,31,123,456),0);assert.equal(u('GetCapture'),0);assert.equal(p.lastError,1234);assert.equal(u('DefWindowProc'+suffix,a,31,0,0),0);}
});
test('Cancellation clears capture before notification and waits for callback completion',()=>{
 const {u,create}=setup(),h=create();u('SetWindowLongW',h,-4,12345);u('SetCapture',h);const result=u('DefWindowProcA',h,31,0,0);assert.deepEqual(result.call.args,[h,0x215,0,0]);assert.equal(u('GetCapture'),0);assert.equal(result.then(7),0);
});
test('Cancellation does not overwrite capture acquired during its notification',()=>{
 const {u,create}=setup(),a=create(),b=create();u('SetWindowLongA',a,-4,12345);u('SetCapture',a);const result=u('DefWindowProcW',a,31,0,0);u('SetCapture',b);assert.equal(result.then(0),0);assert.equal(u('GetCapture'),b);
});
test('Disabling a default-procedure window releases its capture but preserves another window capture',()=>{
 const {u,create}=setup(),a=create(),b=create();u('SetCapture',a);assert.equal(u('EnableWindow',b,0),0);assert.equal(u('GetCapture'),a);assert.equal(u('EnableWindow',a,0),0);assert.equal(u('GetCapture'),0);assert.equal(u('IsWindowEnabled',a),0);assert.equal(u('EnableWindow',a,0),1);
});
test('Custom procedures can handle cancellation without releasing capture; invalid HWND is inert',()=>{
 const {u,create}=setup(),h=create();u('SetWindowLongA',h,-4,12345);u('SetCapture',h);const result=u('SendMessageA',h,31,0,0);assert.equal(result.call.args[1],31);assert.equal(result.then(99),99);assert.equal(u('GetCapture'),h);assert.equal(u('DefWindowProcA',123,31,0,0),0);assert.equal(u('GetCapture'),h);
});
