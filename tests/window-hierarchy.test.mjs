import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui;for(const w of [{hwnd:1,style:0x80000000,parent:0},{hwnd:2,style:0x40000000,parent:1},{hwnd:3,style:0x40000000,parent:2},{hwnd:4,style:0x80000000,parent:1},{hwnd:5,style:0,parent:1}])gui.windows.set(w.hwnd,w);return {p,gui,call:(n,...args)=>p.apis.lookup('user32.dll',n).fn(...args)};}
test('GetParent distinguishes child parents, popup owners and overlapped owners',()=>{
 const {p,call}=setup();p.setError(1234);for(const [h,expected]of [[1,0],[2,1],[3,2],[4,1],[5,0]]){assert.equal(call('GetParent',h),expected);assert.equal(p.lastError,1234);}
 for(const h of [0,123]){assert.equal(call('GetParent',h),0);assert.equal(p.lastError,1400);}
});
test('IsChild follows child ancestry and validates both handles without treating owners or self as parents',()=>{
 const {p,call}=setup();for(const [a,b,expected]of [[1,3,1],[2,3,1],[1,2,1],[1,4,0],[1,5,0],[1,1,0],[3,1,0],[2,2,0],[4,3,0]]){p.setError(1234);assert.equal(call('IsChild',a,b),expected);assert.equal(p.lastError,1234);}
 for(const [a,b]of [[0,3],[123,3],[1,123],[123,123]]){assert.equal(call('IsChild',a,b),0);assert.equal(p.lastError,1400);}
});
test('CreateWindowEx normalizes nonchild owners to the top-level window for both string variants',()=>{
 for(const wide of [false,true]){
  const {p,gui,call}=setup(),name=p.heap.alloc(32);p.memory.string(name,'STATIC',wide,16);
  for(const style of [0x80000000,0,0x40000000]){
   const h=call('CreateWindowEx'+(wide?'W':'A'),0,name,0,style,0,0,20,20,3,0,0,0);
   assert.ok(h);assert.equal(gui.window(h).parent,style===0x40000000?3:1);assert.equal(call('GetParent',h),style===0?0:style===0x40000000?3:1);
  }
 }
});
test('CREATESTRUCT preserves the requested owner while GetParent observes normalized popup ownership',()=>{
 const {p,gui,call}=setup(),name=p.heap.alloc(32);p.memory.string(name,'OwnerProbe',false,32);gui.classes.set('ownerprobe',{name:'OwnerProbe',proc:123});
 let result=call('CreateWindowExA',0,name,0,0x80000000,0,0,20,20,3,0,0,0),messages=[];
 while(result?.call){const [h,msg,,cs]=result.call.args;messages.push(msg);assert.equal(p.memory.u32(cs+12),3);assert.equal(call('GetParent',h),1);result=result.then(msg===129?1:0);}
 assert.ok(result);assert.deepEqual(messages,[129,1]);
});
