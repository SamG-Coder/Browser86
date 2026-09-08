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

test('CheckRadioButton changes only immediate children within inclusive signed ID range',()=>{
 const {p,u,create}=setup(),parent=create(0),a=create(4),b=create(9),outside=create(4),grand=create(4),popup=create(4);for(const [h,id,owner,child]of [[a,-1,parent,true],[b,2,parent,true],[outside,3,parent,true],[grand,1,a,true],[popup,1,parent,false]]){const w=p.apis.gui.window(h);w.id=id;w.parent=owner;if(child)w.style|=0x40000000;u('SendMessageA',h,0xf1,1,0);}assert.equal(u('CheckRadioButton',parent,-1,2,2),1);assert.deepEqual([a,b,outside,grand,popup].map(h=>u('SendMessageA',h,0xf0,0,0)),[0,1,1,1,1]);assert.equal(u('CheckRadioButton',parent,-1,2,99),1);assert.equal(u('SendMessageA',b,0xf0,0,0),0);
});
test('CheckRadioButton synchronously visits custom controls and skips destroyed later children',()=>{
 const {p,u,create}=setup(),parent=create(0),a=create(0),b=create(0);for(const [h,id]of [[a,1],[b,2]]){const w=p.apis.gui.window(h);w.id=id;w.parent=parent;w.style|=0x40000000;u('SetWindowLongW',h,-4,12345);}const first=u('CheckRadioButton',parent,1,2,2);assert.deepEqual(first.call.args,[a,0xf1,0,0]);const second=first.then(77);assert.deepEqual(second.call.args,[b,0xf1,1,0]);assert.equal(second.then(0),1);const again=u('CheckRadioButton',parent,1,2,1);u('SetWindowLongW',b,-4,0);u('DestroyWindow',b);assert.equal(again.then(0),1);assert.equal(p.messageQueue.length,0);
});
test('CheckRadioButton accepts empty and reversed ranges and rejects invalid parents',()=>{
 const {p,u,create}=setup(),parent=create(0);for(const args of [[1,2,9],[2,1,1]]){p.setError(1234);assert.equal(u('CheckRadioButton',parent,...args),1);assert.equal(p.lastError,1234);}for(const h of [0,123]){assert.equal(u('CheckRadioButton',h,2,1,1),0);assert.equal(p.lastError,1400);}
});

test('Automatic radio activation respects group boundaries and clears manual radios but not checkboxes',()=>{
 const {p,u,create}=setup(),parent=create(0),styles=[0x20009,4,3,9,0x20009,9],buttons=styles.map(style=>{const h=create(style),w=p.apis.gui.window(h);w.parent=parent;w.style|=0x50000000;w.visible=true;u('SendMessageA',h,0xf1,1,0);return h;});
 for(const [index,expected]of [[3,[0,0,1,1,1,1]],[3,[0,0,1,1,1,1]],[5,[0,0,1,1,0,1]],[0,[1,0,1,0,0,1]]]){assert.equal(u('SendMessageW',buttons[index],0xf5,0,0),0);assert.deepEqual(buttons.map(h=>u('SendMessageA',h,0xf0,0,0)),expected);}
});
test('Automatic radio activation skips hidden and disabled peers and updates browser-click state',()=>{
 const {p,u,create}=setup(),parent=create(0),buttons=[0x20009,4,9].map(type=>{const h=create(type),w=p.apis.gui.window(h);w.parent=parent;w.style|=0x50000000;w.visible=true;u('SendMessageA',h,0xf1,1,0);return h;});p.apis.gui.window(buttons[0]).visible=false;p.apis.gui.window(buttons[1]).enabled=false;p.inputEvent({kind:'click',hwnd:buttons[2]});assert.deepEqual(buttons.map(h=>u('SendMessageA',h,0xf0,0,0)),[1,1,1]);assert.equal(p.messageQueue.at(-1).lParam,buttons[2]);
});

test('BM_SETSTYLE replaces only type bits and retains check state across button types',()=>{
 const {p,u,create}=setup(),h=create(0xc05);u('SendMessageA',h,0xf1,2,0);const original=u('GetWindowLongA',h,-16);for(const style of [3,0,9,5,0x4000,0xffff,0xffffffff]){assert.equal(u('SendMessageW',h,0xf4,style,0),0);assert.equal(u('GetWindowLongA',h,-16),((original&~15)|(style&15))>>>0);assert.equal(u('SendMessageA',h,0xf0,0,0),2);}assert.equal(p.apis.gui.window(h).enabled,true);
});
test('BM_SETSTYLE redraw uses only the low word and publishes even an unchanged type',()=>{
 const {p,u,create}=setup(),h=create(5),gui=p.apis.gui,updates=[],notify=gui.notify;gui.notify=w=>updates.push(gui.serialize(w));try{for(const redraw of [0,0x10000,1,0x10001])u('SendMessageA',h,0xf4,3,redraw);assert.equal(updates.length,2);assert.ok(updates.every(w=>(w.style&15)===3));}finally{gui.notify=notify;}
});
test('BM_SETSTYLE changes future activation behavior and custom procedures can override it',()=>{
 const {p,u,create}=setup(),h=create(2);u('SendMessageA',h,0xf5,0,0);assert.equal(u('SendMessageA',h,0xf0,0,0),0);u('SendMessageA',h,0xf4,3,1);u('SendMessageA',h,0xf5,0,0);assert.equal(u('SendMessageA',h,0xf0,0,0),1);u('SetWindowLongW',h,-4,12345);const result=u('SendMessageW',h,0xf4,0,1);assert.deepEqual(result.call.args,[h,0xf4,0,1]);assert.equal(result.then(7),7);assert.equal(p.apis.gui.window(h).style&15,3);
});
