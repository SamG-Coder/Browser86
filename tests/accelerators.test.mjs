import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Accelerators decode EXE resources and dispatch commands only with matching modifiers',()=>{
 const {p}=guest('HelloConsole.exe'),m=p.memory,gui=p.apis.gui,call=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),resource=p.heap.alloc(8),msg=p.heap.alloc(28);
 m.w16(resource,0x89);m.w16(resource+2,65);m.w16(resource+4,42);
 p.loader.resource=()=>({address:resource,size:8});gui.windows.set(1,{hwnd:1,proc:123,enabled:true,wide:false});
 const table=call('LoadAcceleratorsA',0,1);gui.msgStruct(msg,{hwnd:1,message:0x100,wParam:65,lParam:1});
 assert.equal(call('TranslateAcceleratorA',1,table,msg),0);gui.keys.add(17);
 const result=call('TranslateAcceleratorA',1,table,msg);assert.deepEqual(result.call.args,[1,0x111,0x1002a,0]);assert.equal(result.then(0),1);
 gui.keys.add(16);assert.equal(call('TranslateAcceleratorA',1,table,msg),0);
});
test('Keyboard state exposes pressed keys in the high bit',()=>{
 const {p}=guest('HelloConsole.exe'),m=p.memory,gui=p.apis.gui,call=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),out=p.heap.alloc(256);
 gui.keys.add(17);gui.keys.add(65);assert.equal(call('GetKeyState',17)&0x8000,0x8000);assert.equal(call('GetKeyState',16),0);assert.equal(call('GetKeyboardState',out),1);assert.equal(m.u8(out+65),128);assert.equal(m.u8(out+64),0);
});
