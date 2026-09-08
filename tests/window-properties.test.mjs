import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui;for(const hwnd of [1,2])gui.windows.set(hwnd,{hwnd,style:0x80000000});return {p,gui,m:p.memory,call:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),str:(s,wide=false)=>{const a=p.heap.alloc((s.length+1)*2);p.memory.string(a,s,wide,s.length+1);return a;}};}
test('Window properties share case-insensitive ANSI and Unicode names and replace arbitrary data values',()=>{
 const {p,call,str}=setup(),a=str('Café'),w=str('CAFÉ',true);p.setError(1234);
 assert.equal(call('SetPropA',1,a,0xffffffff),1);assert.equal(call('GetPropW',1,w),0xffffffff);assert.equal(p.lastError,1234);
 assert.equal(call('SetPropW',1,w,0),1);assert.equal(call('GetPropA',1,a),0);assert.equal(p.lastError,1234);
 assert.equal(call('RemovePropW',1,w),0);assert.equal(p.lastError,1234);assert.equal(call('GetPropA',1,a),0);assert.equal(p.lastError,1234); // Replacing by string acquired another global atom reference.
});
test('Integer and decimal-string property keys alias without dereferencing low addresses',()=>{
 const {p,call,str}=setup();for(const key of [1,0xbfff,0xcfff]){p.setError(1234);assert.equal(call('SetPropW',1,key,123),1);assert.equal(call('GetPropA',1,key),123);assert.equal(call('RemovePropA',1,key),123);assert.equal(p.lastError,1234);}
 call('SetPropA',1,str('#0001'),456);assert.equal(call('GetPropW',1,1),456);assert.equal(call('RemovePropW',1,str('#1',true)),456);
 for(const op of ['Set','Get','Remove'])for(const name of ['#0','#49152','#65535']){assert.equal(call(op+'PropW',1,str(name,true),1),0);assert.equal(p.lastError,87);}
 assert.equal(call('SetPropA',1,0,1),0);assert.equal(p.lastError,87);p.setError(1234);assert.equal(call('GetPropW',1,0),0);assert.equal(call('RemovePropW',1,0),0);assert.equal(p.lastError,1234);
});
test('Property lists isolate windows and missing string names follow guest name lifetime',()=>{
 const {p,call,str}=setup(),name=str('Browser86Unique');assert.equal(call('GetPropA',1,name),0);assert.equal(p.lastError,2);call('SetPropA',2,name,42);
 p.setError(1234);assert.equal(call('GetPropA',1,name),0);assert.equal(call('RemovePropA',1,name),0);assert.equal(p.lastError,1234);assert.equal(call('GetPropA',2,name),42);
 call('RemovePropA',2,name);assert.equal(call('GetPropA',1,name),0);assert.equal(p.lastError,2);
});
test('Property names enforce native limits and malformed memory cannot change an existing value',()=>{
 const {p,m,call,str}=setup(),name=str('safe');call('SetPropA',1,name,987);
 for(const suffix of ['A','W']){const wide=suffix==='W';assert.equal(call('SetProp'+suffix,1,str('x'.repeat(255),wide),1),1);for(const op of ['Set','Get','Remove']){assert.equal(call(op+'Prop'+suffix,1,str('x'.repeat(256),wide),1),0);assert.equal(p.lastError,87);assert.equal(call(op+'Prop'+suffix,1,str('',wide),1),0);assert.equal(p.lastError,123);assert.equal(call(op+'Prop'+suffix,123,name,1),0);assert.equal(p.lastError,1400);}}
 m.map(0x60000000,4096);m.w8(0x60000fff,65);assert.throws(()=>call('SetPropA',1,0x60000fff,1));assert.equal(call('GetPropA',1,name),987);
});
test('Properties remain available during destruction and never own the attached data handle',()=>{
 const {p,gui,call,str}=setup(),name=str('OwnedByApp'),data=p.handle('event',{signaled:false});call('SetPropA',1,name,data);gui.window(1).proc=123;
 let result=gui.destroy(1);while(result?.call){assert.equal(call('GetPropA',1,name),data);if(result.call.args[1]===130)assert.equal(call('RemovePropA',1,name),data);result=result.then(0);}
 assert.equal(result,1);assert.ok(p.handles.has(data));assert.equal(call('GetPropA',1,name),0);assert.equal(p.lastError,1400);
});
