import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),gui=p.apis.gui;gui.windows.set(1,{hwnd:1});return {p,gui,call:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),str:(s,wide=false)=>{const a=p.heap.alloc((s.length+1)*2);p.memory.string(a,s,wide,s.length+1);return a;}};}
for(const wide of [false,true])test(`Property enumeration ${wide?'W':'A'} preserves spelling, integer keys, callback ABI and removes current entries`,()=>{
 const {p,call,str}=setup(),suffix=wide?'W':'A';call('SetPropW',1,str('MiXéd',true),12);call('SetPropA',1,str('MIXÉD'),34);call('SetPropW',1,5,0);
 const before=p.heap.blocks.size,log=[];let result=call('EnumPropsEx'+suffix,1,123,0xdeadbeef);
 while(result?.call){assert.equal(result.call.address,123);const [h,key,data,param]=result.call.args;assert.equal(param,0xdeadbeef);log.push([key<65536?key:(wide?p.memory.wstr(key):p.memory.cstr(key)),data]);assert.equal(call('RemoveProp'+suffix,h,key),data);result=result.then(7);}
 assert.equal(result,7);assert.deepEqual(log,[['MiXéd',34],[5,0]]);assert.equal(p.heap.blocks.size,before);
 p.setError(1234);assert.equal(call('EnumProps'+suffix,1,0),-1);assert.equal(p.lastError,1234);
});
test('EnumProps returns the last callback integer, stops at zero and validates the window before callbacks',()=>{
 const {p,call,str}=setup();call('SetPropA',1,str('One'),1);call('SetPropA',1,str('Two'),2);
 for(const suffix of ['A','W']){const before=p.heap.blocks.size;const result=call('EnumProps'+suffix,1,123);assert.equal(result.call.args.length,3);assert.equal(result.then(0),0);assert.equal(p.heap.blocks.size,before);let all=call('EnumProps'+suffix,1,123);while(all?.call)all=all.then(0xfffffffe);assert.equal(all,-2);}
 assert.equal(call('EnumPropsExW',123,0,0),-1);assert.equal(p.lastError,1400);assert.throws(()=>call('EnumPropsA',1,0),e=>e.code==='CALLBACK_POINTER');
});
test('Nested enumeration keeps outer callback name buffers alive until their own return',()=>{
 const {p,call,str}=setup();call('SetPropW',1,str('Nested',true),123);const before=p.heap.blocks.size,outer=call('EnumPropsW',1,111),outerName=outer.call.args[1];
 let inner=call('EnumPropsExA',1,222,3);while(inner?.call)inner=inner.then(1);assert.equal(p.memory.wstr(outerName),'Nested');assert.ok(p.heap.blocks.has(outerName));assert.equal(outer.then(1),1);assert.equal(p.heap.blocks.size,before);
});
