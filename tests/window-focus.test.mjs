import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui;for(const w of [{hwnd:1,parent:0,style:0x80000000},{hwnd:2,parent:1,style:0x40000000},{hwnd:3,parent:1,style:0x40000000},{hwnd:4,parent:1,style:0x80000000}])gui.windows.set(w.hwnd,{...w,proc:123,enabled:true});return {p,gui,call:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a)};}
function drain(result,callback=()=>{}){while(result?.call){callback(result.call.args);result=result.then(123);}return result;}
test('SetFocus sends loss and gain callbacks with the new focus already observable',()=>{
 const {gui,call}=setup();const log=[];const run=h=>drain(call('SetFocus',h),a=>log.push([...a,call('GetFocus')]));
 assert.equal(run(2),0);assert.equal(run(3),2);assert.equal(run(3),3);assert.equal(run(0),3);
 assert.deepEqual(log,[[2,7,0,0,2],[2,8,3,0,3],[3,7,2,0,3],[3,8,0,0,0]]);assert.equal(gui.focus,0);
});
test('SetFocus rejects invalid or disabled child ancestry while ignoring disabled popup owners',()=>{
 const {p,gui,call}=setup();gui.focus=3;gui.window(1).style|=0x08000000;
 assert.equal(call('SetFocus',2),0);assert.equal(p.lastError,87);assert.equal(gui.focus,3);
 assert.equal(call('SetFocus',123),0);assert.equal(p.lastError,1400);assert.equal(gui.focus,3);
 assert.equal(drain(call('SetFocus',4)),3);assert.equal(gui.focus,4);
 gui.window(4).style|=0x08000000;assert.equal(call('SetFocus',4),0);assert.equal(p.lastError,87);
});
test('Disabling the focused window cancels modes, clears focus while still enabled, then reports disable',()=>{
 const {gui,call}=setup();gui.focus=2;const log=[];
 assert.equal(drain(call('EnableWindow',2,0),a=>log.push([a[1],call('GetFocus'),call('IsWindowEnabled',2)])),0);
 assert.deepEqual(log,[[31,2,1],[8,0,1],[10,0,0]]);assert.equal(gui.focus,0);
});
test('A nested SetFocus supersedes an outer transition without a stale gain notification',()=>{
 const {gui,call}=setup();gui.focus=2;const log=[];
 const result=drain(call('SetFocus',3),a=>{log.push(a.slice(0,3));if(a[0]===2&&a[1]===8)drain(call('SetFocus',4),b=>log.push(b.slice(0,3)));});
 assert.equal(result,2);assert.equal(gui.focus,4);assert.deepEqual(log,[[2,8,3],[3,8,4],[4,7,3]]);
});
