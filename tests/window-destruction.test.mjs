import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){
 const {p,events}=guest('HelloConsole.exe'),gui=p.apis.gui;
 const create=(parent=0,style=0x40000000,proc=0)=>{const hwnd=p.handle('window',{}),dc=gui.newDC(hwnd);gui.windows.set(hwnd,{hwnd,parent,style,proc,dc});p.timers.set(hwnd+':1',{hwnd});return hwnd;};
 return {p,gui,events,create};
}
test('DestroyWindow recursively releases nested windows, owned popups, timers and DCs',()=>{
 const {p,gui,events,create}=setup(),parent=create(0,0x80000000),child=create(parent),grandchild=create(child),owned=create(parent,0x80000000),other=create(0,0x80000000);
 const doomed=[parent,child,grandchild,owned],dcs=doomed.map(h=>gui.window(h).dc);gui.focus=grandchild;
 assert.equal(gui.destroy(parent),1);for(const h of [...doomed,...dcs])assert.equal(p.handles.has(h),false);
 assert.deepEqual([...gui.windows.keys()],[other]);assert.equal(p.timers.size,1);assert.equal(gui.focus,0);
 assert.deepEqual(events.filter(e=>e.type==='window'&&e.op==='destroy').map(e=>e.window.hwnd),[owned,grandchild,child,parent]);
 assert.equal(gui.destroy(parent),0);assert.equal(p.lastError,1400);
});
test('Destruction callbacks follow native owner and child ordering while handles remain queryable',()=>{
 const {gui,create}=setup(),parent=create(0,0x80000000,1),child=create(parent,0x40000000,1),grandchild=create(child,0x40000000,1),owned=create(parent,0x80000000,1),log=[];
 let result=gui.destroy(parent);while(result?.call){const [h,message]=result.call.args;assert.ok(gui.window(h));log.push([h,message]);if(h===parent&&message===2)assert.ok(gui.window(grandchild));if(h===parent&&message===130)assert.equal(gui.window(child),undefined);result=result.then(0);}
 assert.equal(result,1);assert.deepEqual(log,[[owned,2],[owned,130],[parent,2],[child,2],[grandchild,2],[grandchild,130],[child,130],[parent,130]]);
});
test('Destruction callbacks may destroy a sibling without duplicate notifications',()=>{
 const {gui,create}=setup(),parent=create(0,0x80000000,1),child=create(parent),sibling=create(parent),log=[];
 let result=gui.destroy(parent);while(result?.call){const [h,message]=result.call.args;log.push([h,message]);if(message===2){assert.equal(gui.destroy(parent),0);assert.equal(gui.destroy(sibling),1);}result=result.then(0);}
 assert.equal(result,1);assert.equal(gui.window(child),undefined);assert.equal(gui.windows.size,0);assert.deepEqual(log,[[parent,2],[parent,130]]);
});
