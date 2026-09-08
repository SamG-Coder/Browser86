import test from 'node:test';
import assert from 'node:assert/strict';
import {mouseMessage} from '../src/runtime/mouse-messages.js';
import {guest} from './helpers.mjs';
test('All five DOM mouse buttons map to distinct Win32 down/up messages and X identifiers',()=>{
 for(const [button,flag,down,extra]of [[0,1,0x201,0],[1,4,0x207,0],[2,2,0x204,0],[3,8,0x20b,1],[4,16,0x20b,2]]){
  const key=[1,16,2,32,64][button];assert.deepEqual(mouseMessage({event:'down',button,buttons:flag}),{message:down,wParam:key|(extra<<16)});assert.deepEqual(mouseMessage({event:'up',button,buttons:0}),{message:down+1,wParam:extra<<16});
 }
});
test('Mouse move translates every button combination and modifiers without an X-button high word',()=>{
 for(let buttons=0;buttons<32;buttons++)for(const shiftKey of [false,true])for(const ctrlKey of [false,true]){
  const expected=(buttons&1?1:0)|(buttons&2?2:0)|(buttons&4?16:0)|(buttons&8?32:0)|(buttons&16?64:0)|(shiftKey?4:0)|(ctrlKey?8:0);
  assert.deepEqual(mouseMessage({event:'move',button:4,buttons,shiftKey,ctrlKey}),{message:0x200,wParam:expected});
 }
});
test('Button releases retain other held buttons and modifiers; unknown actions do not become moves',()=>{
 assert.deepEqual(mouseMessage({event:'up',button:2,buttons:5,ctrlKey:true,shiftKey:true}),{message:0x205,wParam:29});assert.equal(mouseMessage({event:'down',button:5}),null);assert.equal(mouseMessage({event:'cancel',buttons:1}),null);assert.deepEqual(mouseMessage({event:'down',buttons:1}),{message:0x201,wParam:1});
});
test('GUI input preserves right/X-button identity under capture and signed coordinate mapping',()=>{
 const {p}=guest('HelloConsole.exe'),gui=p.apis.gui;gui.windows.set(1,{hwnd:1,x:10,y:20,style:0});gui.windows.set(2,{hwnd:2,x:30,y:40,style:0});gui.capture=2;
 gui.input({kind:'mouse',event:'down',hwnd:1,button:4,buttons:18,shiftKey:true,ctrlKey:true,x:1,y:2});let msg=p.messageQueue.at(-1);assert.equal(msg.hwnd,2);assert.equal(msg.message,0x20b);assert.equal(msg.wParam,0x2004e);assert.equal(msg.lParam,0xffeeffed);
 gui.capture=0;gui.input({kind:'mouse',event:'up',hwnd:1,button:2,buttons:0,x:1,y:2});msg=p.messageQueue.at(-1);assert.equal(msg.hwnd,1);assert.equal(msg.message,0x205);assert.equal(msg.wParam,0);
});
