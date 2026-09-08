import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('GetWindowPlacement returns the virtual normal rectangle and validates structure length',()=>{
 const {p}=guest('HelloConsole.exe'),m=p.memory,gui=p.apis.gui,out=p.heap.alloc(44),call=(...a)=>p.apis.lookup('user32.dll','GetWindowPlacement').fn(...a);gui.windows.set(1,{hwnd:1,x:10,y:20,width:340,height:617,visible:true});
 m.w32(out,44);assert.equal(call(1,out),1);assert.equal(m.u32(out+8),1);assert.deepEqual([28,32,36,40].map(i=>m.i32(out+i)),[10,20,350,637]);m.w32(out,40);assert.equal(call(1,out),0);assert.equal(p.lastError,87);
});
test('SetWindowPlacement restores saved bounds before synchronous size notification',()=>{const {p}=guest('HelloConsole.exe'),m=p.memory,gui=p.apis.gui,out=p.heap.alloc(44),w={hwnd:1,proc:123,width:1,height:1,visible:false,style:0};gui.windows.set(1,w);m.w32(out,44);m.w32(out+8,1);[20,30,360,647].forEach((v,i)=>m.w32(out+28+i*4,v));const result=p.apis.lookup('user32.dll','SetWindowPlacement').fn(1,out);assert.deepEqual([w.x,w.y,w.width,w.height],[20,30,340,617]);assert.equal(w.visible,true);assert.deepEqual(result.call.args,[1,5,0,340|(617<<16)]);assert.equal(result.then(0),1);assert.equal(p.messageQueue.at(-1).message,15);m.w32(out,40);assert.equal(p.apis.lookup('user32.dll','SetWindowPlacement').fn(1,out),0);assert.equal(w.width,340);});
