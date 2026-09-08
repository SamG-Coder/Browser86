import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe'),u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),name=p.heap.string('BUTTON'),create=type=>u('CreateWindowExA',0,name,0,0x10000|type,0,0,20,20,0,0,0,0);return {p,events,u,create};}
test('Built-in button check states clamp to style-specific bounds and preserve last error',()=>{
 const {p,u,create}=setup();for(let type=0;type<12;type++){const h=create(type),max=[5,6].includes(type)?2:[2,3,4,9].includes(type)?1:0;assert.equal(u('SendMessageW',h,0xf0,0,0),0);for(const state of [0,1,2,3,0xffffffff,0]){p.setError(1234);assert.equal(u('SendMessageA',h,0xf1,state,0),0);assert.equal(u('SendMessageW',h,0xf0,0,0),Math.min(state,max));if(![4,9].includes(type))assert.equal(p.lastError,1234);}}
});
test('Radio check state updates tab-stop style without changing sibling state',()=>{
 const {u,create}=setup(),a=create(4),b=create(9);u('SendMessageA',a,0xf1,1,0);u('SendMessageA',b,0xf1,1,0);assert.ok(u('GetWindowLongA',b,-16)&0x10000);u('SendMessageA',b,0xf1,0,0);assert.equal(u('GetWindowLongA',b,-16)&0x10000,0);assert.equal(u('SendMessageA',a,0xf0,0,0),1);
});
test('Button state is per-window, serialized, and bypassed by custom or default procedures',()=>{
 const {p,u,create}=setup(),a=create(5),b=create(5);u('SendMessageA',a,0xf1,2,0);assert.equal(p.apis.gui.serialize(p.apis.gui.window(a)).checkState,2);assert.equal(u('SendMessageA',b,0xf0,0,0),0);assert.equal(u('DefWindowProcA',a,0xf1,0,0),0);assert.equal(u('SendMessageA',a,0xf0,0,0),2);u('SetWindowLongW',a,-4,12345);const call=u('SendMessageW',a,0xf1,0,0);assert.equal(call.call.address,12345);assert.equal(call.then(7),7);assert.equal(p.apis.gui.window(a).checkState,2);
});

test('Automatic checkbox clicks cycle state while manual styles preserve it',()=>{
 const {u,create}=setup();for(const [type,expected] of [[3,[1,0,1,0]],[6,[1,2,0,1]],[2,[0,0,0,0]],[5,[0,0,0,0]]]){const h=create(type);for(const state of expected){assert.equal(u('SendMessageA',h,0xf5,0,0),0);assert.equal(u('SendMessageA',h,0xf0,0,0),state);}}
});
test('BM_CLICK updates state before synchronous parent notification and preserves reentrant changes',()=>{
 const {p,u,create}=setup(),parent=create(0),child=create(3),w=p.apis.gui.window(child);w.parent=parent;w.style|=0x40000000;w.id=0x12345678;u('SetWindowLongW',parent,-4,12345);const result=u('SendMessageW',child,0xf5,0,0);assert.deepEqual(result.call.args,[parent,0x111,0x5678,child]);assert.equal(w.checkState,1);assert.equal(p.messageQueue.length,0);u('SendMessageW',child,0xf1,0,0);assert.equal(result.then(7),0);assert.equal(w.checkState,0);
});
test('Browser click input toggles before queued command and suppresses disabled controls',()=>{
 const {p,u,create}=setup(),parent=create(0),child=create(6),w=p.apis.gui.window(child);w.parent=parent;w.id=42;for(const state of [1,2,0]){p.inputEvent({kind:'click',hwnd:child});assert.equal(w.checkState,state);const message=p.messageQueue.pop();assert.deepEqual([message.hwnd,message.message,message.wParam,message.lParam],[parent,0x111,42,child]);}w.enabled=false;p.inputEvent({kind:'click',hwnd:child});assert.equal(w.checkState,0);assert.equal(p.messageQueue.length,0);assert.equal(u('SendMessageW',child,0xf5,0,0),0);assert.equal(w.checkState,1);
});
