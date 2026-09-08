import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,gui:p.apis.gui,call:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),str:(s,wide=false)=>{const a=p.heap.alloc((s.length+1)*2);p.memory.string(a,s,wide,s.length+1);return a;}};}
test('IsWindowUnicode follows registered class encoding across both creation variants',()=>{
 for(const registeredWide of [false,true])for(const createdWide of [false,true]){
  const {p,call,str}=setup(),cls=p.heap.alloc(40,true),className=str('Encoding',registeredWide);p.memory.w32(cls+36,className);assert.ok(call('RegisterClass'+(registeredWide?'W':'A'),cls));
  const hwnd=call('CreateWindowEx'+(createdWide?'W':'A'),0,str('Encoding',createdWide),0,0x80000000,0,0,20,20,0,0,0,0);p.setError(1234);assert.equal(call('IsWindowUnicode',hwnd),registeredWide?1:0);assert.equal(p.lastError,1234);
  call('SetWindowLongA',hwnd,-4,123);assert.equal(call('IsWindowUnicode',hwnd),0);call('SetWindowLongW',hwnd,-4,456);assert.equal(call('IsWindowUnicode',hwnd),1);
 }
});
test('Built-in window encoding follows the creation variant and invalid windows report error 1400',()=>{
 const {p,call,str}=setup();for(const wide of [false,true]){const h=call('CreateWindowEx'+(wide?'W':'A'),0,str('STATIC',wide),0,0x80000000,0,0,20,20,0,0,0,0);assert.equal(call('IsWindowUnicode',h),wide?1:0);call('DestroyWindow',h);assert.equal(call('IsWindowUnicode',h),0);assert.equal(p.lastError,1400);}
});
test('Window owner IDs match the guest process/thread and validate optional output atomically',()=>{
 const {p,m,call,str}=setup(),h=call('CreateWindowExA',0,str('STATIC'),0,0x80000000,0,0,20,20,0,0,0,0),out=p.heap.alloc(4);p.setError(1234);
 assert.equal(call('GetWindowThreadProcessId',h,out),p.apis.lookup('kernel32.dll','GetCurrentThreadId').fn());assert.equal(m.u32(out),p.apis.lookup('kernel32.dll','GetCurrentProcessId').fn());assert.equal(p.lastError,1234);assert.equal(call('GetWindowThreadProcessId',h,0),8);
 m.w32(out,0x12345678);assert.equal(call('GetWindowThreadProcessId',123,out),0);assert.equal(p.lastError,1400);assert.equal(m.u32(out),0x12345678);
 m.map(0x60000000,4096);m.w16(0x60000ffe,0x1234);assert.throws(()=>call('GetWindowThreadProcessId',h,0x60000ffe));assert.equal(m.u16(0x60000ffe),0x1234);
});
