import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe'),gui=p.apis.gui;for(const w of [{hwnd:1,style:0x80000000,parent:0},{hwnd:2,style:0x50000000,parent:1},{hwnd:3,style:0x50000000,parent:2},{hwnd:4,style:0x90000000,parent:1}])gui.windows.set(w.hwnd,{...w,visible:!!(w.style&0x10000000),enabled:true});return {p,gui,events,call:(n,...args)=>p.apis.lookup('user32.dll',n).fn(...args)};}
test('Visibility follows child ancestry, excludes popup owners, and tracks ShowWindow and style writes',()=>{
 const {p,call}=setup();p.setError(1234);assert.equal(call('IsWindowVisible',3),0);assert.equal(call('IsWindowVisible',4),1);assert.equal(p.lastError,1234);
 call('ShowWindow',1,5);assert.equal(call('IsWindowVisible',3),1);assert.ok(call('GetWindowLongA',1,-16)&0x10000000);
 call('ShowWindow',2,0);assert.equal(call('IsWindowVisible',3),0);assert.equal(call('GetWindowLongA',2,-16)&0x10000000,0);
 call('SetWindowLongA',2,-16,0x50000000);assert.equal(call('IsWindowVisible',3),1);
});
test('EnableWindow callback sequence and state match repeated disable and enable operations',()=>{
 const {p,gui,call}=setup();gui.window(1).proc=123;
 for(const [enable,expected,expectedLog]of [[0,0,[[31,0,1],[10,0,0]]],[0,1,[[31,0,0]]],[1,1,[[10,1,1]]],[1,0,[]],[2,0,[]]]){
  p.setError(1234);let result=call('EnableWindow',1,enable),log=[];while(result?.call){const [h,msg,wp]=result.call.args;log.push([msg,wp,call('IsWindowEnabled',h)]);result=result.then(987);}
  assert.equal(result,expected);assert.deepEqual(log,expectedLog);assert.equal(p.lastError,1234);assert.equal(call('IsWindowEnabled',2),1);assert.equal(!!(call('GetWindowLongA',1,-16)&0x08000000),!enable);assert.equal(gui.window(1).enabled,!!enable);
 }
});
test('Window state queries validate handles and observe direct disabled style changes',()=>{
 const {p,gui,call}=setup();for(const name of ['IsWindowEnabled','IsWindowVisible','EnableWindow'])for(const h of [0,123]){assert.equal(call(name,h,0),0);assert.equal(p.lastError,1400);}
 call('SetWindowLongW',1,-16,0x88000000);assert.equal(call('IsWindowEnabled',1),0);assert.equal(gui.window(1).enabled,false);assert.equal(call('EnableWindow',1,1),1);assert.equal(call('IsWindowEnabled',1),1);
});
test('Destroying a window in WM_CANCELMODE does not send WM_ENABLE to the dead window',()=>{
 const {gui,events,call}=setup();gui.window(4).proc=123;let result=call('EnableWindow',4,0);assert.equal(result.call.args[1],31);
 let destroy=gui.destroy(4);while(destroy?.call)destroy=destroy.then(0);assert.equal(destroy,1);assert.equal(result.then(0),0);assert.equal(gui.window(4),undefined);assert.equal(events.filter(e=>e.type==='window'&&e.op==='update').length,0);
});
