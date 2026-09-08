import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('ShowWindow delivers size synchronously before the first queued paint',()=>{
 const {p}=guest('HelloConsole.exe'),gui=p.apis.gui,w={hwnd:1,proc:123,enabled:true,visible:false,style:0,width:340,height:617,wide:false};gui.windows.set(1,w);
 const result=p.apis.lookup('user32.dll','ShowWindow').fn(1,5);assert.deepEqual(result.call.args,[1,5,0,340|(617<<16)]);assert.equal(p.messageQueue.length,0);assert.equal(result.then(0),0);assert.equal(p.messageQueue[0].message,15);
});
