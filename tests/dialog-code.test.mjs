import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),create=(name,style)=>u('CreateWindowExA',0,p.heap.string(name),0,style,0,0,20,20,0,0,0,0);return {p,u,create};}
test('Built-in button dialog codes identify each supported button type',()=>{
 const {p,u,create}=setup(),expected=[0x2020,0x2010,0x2000,0x2000,0x2040,0x2000,0x2000,0x100,0x2020,0x2040,0x2020,0x2000];for(const [type,code]of expected.entries()){const h=create('BUTTON',type);for(const suffix of ['A','W']){p.setError(1234);assert.equal(u('SendMessage'+suffix,h,0x87,0,0),code);assert.equal(p.lastError,1234);}}
});
test('Static and edit dialog codes distinguish multiline controls for query and key messages',()=>{
 const {p,u,create}=setup(),msg=p.heap.alloc(28,true);for(const [name,style,code]of [['STATIC',0,0x100],['STATIC',0x100,0x100],['EDIT',0,0x89],['EDIT',4,0x8d],['EDIT',0x1000,0x89],['EDIT',0x1004,0x8d],['EDIT',0x804,0x8d]]){const h=create(name,style);for(const message of [0x100,0x102])for(const key of [9,13,27,65]){p.memory.w32(msg+4,message);p.memory.w32(msg+8,key);assert.equal(u('SendMessageW',h,0x87,key,msg),code);assert.equal(p.memory.u32(msg+8),key);}}
});
test('Dialog codes follow button type changes and preserve custom/default procedure behavior',()=>{
 const {u,create}=setup(),h=create('BUTTON',0);u('SendMessageA',h,0xf4,1,0);assert.equal(u('SendMessageW',h,0x87,0,0),0x2010);assert.equal(u('DefWindowProcW',h,0x87,0,0),0);u('SetWindowLongW',h,-4,12345);const result=u('SendMessageW',h,0x87,9,1234);assert.deepEqual(result.call.args,[h,0x87,9,1234]);assert.equal(result.then(7),7);
});
