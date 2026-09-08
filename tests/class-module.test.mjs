import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'ModuleClass',false,16);m.w32(cls+36,name);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,u,atom,name,create};}
test('Class module setters return normalized registration identity then retain raw replacement values',()=>{
 const {p,u,create}=setup(),h=create();let previous=p.main.base;for(const value of [0,0x1234,0xfedcba98,p.main.base]){p.setError(1234);assert.equal(u('SetClassLongW',h,-16,value),previous);assert.equal(u('GetClassLongA',h,-16),value);assert.equal(p.lastError,1234);previous=value;}
});
test('Module replacement is shared across class windows without altering per-window instance handles',()=>{
 const {u,create}=setup(),a=create(),b=create();u('SetClassLongA',a,-16,1234);assert.equal(u('GetClassLongW',b,-16),1234);assert.equal(u('GetWindowLongW',b,-6),0);
});
test('UnregisterClass checks explicit replacement module identity and accepts null for both names and atoms',()=>{
 for(const byName of [false,true]){const {p,u,atom,name,create}=setup(),h=create(),key=byName?name:atom;u('SetClassLongW',h,-16,1234);assert.equal(u('UnregisterClassA',key,p.main.base),0);assert.equal(p.lastError,1411);assert.equal(u('UnregisterClassA',key,0),0);assert.equal(p.lastError,1412);u('DestroyWindow',h);p.setError(1234);assert.equal(u('UnregisterClassA',key,0),1);assert.equal(p.lastError,1234);}
 const {u,atom,create}=setup(),h=create();u('SetClassLongA',h,-16,5678);u('DestroyWindow',h);assert.equal(u('UnregisterClassW',atom,5678),1);
});
test('Null module replacement remains queryable and invalid-window setters fail without mutation',()=>{
 const {p,u,atom,create}=setup(),h=create();u('SetClassLongA',h,-16,0);assert.equal(u('SetClassLongW',123,-16,456),0);assert.equal(p.lastError,1400);assert.equal(u('GetClassLongW',h,-16),0);u('DestroyWindow',h);assert.equal(u('UnregisterClassA',atom,0),1);
});
