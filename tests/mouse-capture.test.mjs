import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'CaptureClass',false,16);m.w32(cls+36,name);const atom=u('RegisterClassA',cls),create=(x=0,y=0,parent=0)=>u('CreateWindowExA',0,atom,0,parent?0x40000000:0,x,y,20,20,parent,0,0,0);return {p,u,create,gui:p.apis.gui};}
test('Capture transfers state before synchronous notification, including same-window reassignment',()=>{
 const {p,u,create}=setup(),a=create(),b=create();u('SetWindowLongW',a,-4,12345);p.setError(1234);assert.equal(u('SetCapture',a),0);assert.equal(p.lastError,1234);
 let result=u('SetCapture',a);assert.deepEqual(result.call.args,[a,0x215,0,a]);assert.equal(u('GetCapture'),a);assert.equal(result.then(99),a);
 result=u('SetCapture',b);assert.deepEqual(result.call.args,[a,0x215,0,b]);assert.equal(u('GetCapture'),b);assert.equal(result.then(0),a);assert.equal(p.lastError,1234);
});
test('Null capture and ReleaseCapture notify the previous owner and return their distinct results',()=>{
 const {u,create}=setup(),h=create();u('SetWindowLongA',h,-4,12345);u('SetCapture',h);let result=u('SetCapture',0);assert.deepEqual(result.call.args,[h,0x215,0,0]);assert.equal(u('GetCapture'),0);assert.equal(result.then(0),h);
 u('SetCapture',h);result=u('ReleaseCapture');assert.equal(u('GetCapture'),0);assert.equal(result.then(7),1);assert.equal(u('ReleaseCapture'),1);
});
test('Invalid capture targets leave capture and error-free notifications untouched',()=>{
 const {p,u,create}=setup(),h=create();u('SetCapture',h);assert.equal(u('SetCapture',123),0);assert.equal(p.lastError,1400);assert.equal(u('GetCapture'),h);u('DestroyWindow',h);assert.equal(u('SetCapture',h),0);assert.equal(p.lastError,1400);
});
test('Destroying a captured window retains capture through destruction callbacks then clears it silently',()=>{
 const {u,create}=setup(),h=create();u('SetWindowLongA',h,-4,12345);u('SetCapture',h);let result=u('DestroyWindow',h);assert.equal(result.call.args[1],2);assert.equal(u('GetCapture'),h);result=result.then(0);assert.equal(result.call.args[1],0x82);assert.equal(u('GetCapture'),h);assert.equal(result.then(0),1);assert.equal(u('GetCapture'),0);
});
test('Captured mouse input maps source and nested destination coordinates and release restores routing',()=>{
 const {p,u,create,gui}=setup(),source=create(100,200),parent=create(20,30),target=create(7,8,parent);u('SetCapture',target);gui.input({kind:'mouse',event:'move',hwnd:source,x:3,y:4,buttons:1});let msg=p.messageQueue.at(-1);assert.equal(msg.hwnd,target);assert.equal(msg.message,0x200);assert.equal(msg.wParam,1);assert.equal(msg.lParam,76|(166<<16));
 u('ReleaseCapture');gui.input({kind:'mouse',event:'up',hwnd:source,x:-2,y:-3,buttons:0});msg=p.messageQueue.at(-1);assert.equal(msg.hwnd,source);assert.equal(msg.lParam,0xfffdfffe);
});
test('Capture callback reentrancy preserves the latest state while returning the original prior owner',()=>{
 const {u,create}=setup(),a=create(),b=create(),c=create();u('SetWindowLongA',a,-4,12345);u('SetCapture',a);const result=u('SetCapture',b);assert.equal(u('SetCapture',c),b);assert.equal(result.then(0),a);assert.equal(u('GetCapture'),c);
});
