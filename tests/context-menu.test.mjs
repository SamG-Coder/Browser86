import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a);for(const w of [{hwnd:1,x:100,y:200,parent:0,style:0},{hwnd:2,x:10,y:20,parent:1,style:0x40000000},{hwnd:3,x:30,y:40,parent:1,style:0x80000000}])gui.windows.set(w.hwnd,{...w,className:'Custom',proc:0,wide:false});return {p,gui,u};}
test('Right-button default processing sends context menu with signed client-to-screen coordinates',()=>{
 const {p,u}=setup();u('SetWindowLongW',2,-4,12345);for(const suffix of ['A','W']){p.setError(1234);const result=u('DefWindowProc'+suffix,2,0x205,0xffff,0xfffdfffe);assert.deepEqual(result.call.args,[2,0x7b,2,108|(217<<16)]);assert.equal(result.then(7),0);assert.equal(p.lastError,1234);}
});
test('Child context messages forward original target and keyboard sentinel and discard parent result',()=>{
 const {u}=setup();u('SetWindowLongA',1,-4,12345);const result=u('DefWindowProcW',2,0x7b,2,0xffffffff);assert.deepEqual(result.call.args,[1,0x7b,2,0xffffffff]);assert.equal(result.then(99),0);assert.equal(u('DefWindowProcA',3,0x7b,3,0xffffffff),0);
});
test('Nested default dispatch reaches the parent synchronously without queuing extra messages',()=>{
 const {p,u}=setup();u('SetWindowLongA',1,-4,12345);const result=u('SendMessageA',2,0x205,0,0x00060005);assert.deepEqual(result.call.args,[1,0x7b,2,115|(226<<16)]);assert.equal(p.messageQueue.length,0);assert.equal(result.then(0),0);
});
test('Applications may consume right-button releases; invalid windows remain inert',()=>{
 const {u}=setup();u('SetWindowLongA',2,-4,12345);const result=u('SendMessageW',2,0x205,2,0);assert.equal(result.call.args[1],0x205);assert.equal(result.then(9),9);assert.equal(u('DefWindowProcA',123,0x205,0,0),0);
});
