import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a),name=p.heap.alloc(16);m.string(name,'STATIC',false,16);const h=call('CreateWindowExA',0,name,0,0,0,0,20,20,0,0,0,0);call('SetWindowLong'+(wide?'W':'A'),h,-4,12345);return {p,m,h,call};}
test('GetWindowText dispatches custom content through all four encoding combinations',()=>{
 for(const wide of [false,true])for(const callerWide of [false,true]){
  const {p,m,h,call}=setup(wide),out=p.heap.alloc(64),before=new Set(p.heap.blocks.keys());m.fill(out,64,0x58);p.setError(1234);
  const result=call('GetWindowText'+(callerWide?'W':'A'),h,out,16);assert.equal(result.call.args[1],13);assert.equal(result.call.args[2],callerWide&&!wide?32:16);
  m.string(result.call.args[3],wide?'Café Ā':'Café',wide,result.call.args[2]);assert.equal(result.then(wide?6:4),wide?6:4);
  assert.equal(p.apis.str(out,callerWide),wide?(callerWide?'Café Ā':'Café A'):'Café');assert.equal(p.lastError,1234);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('GetWindowText null and zero-capacity exits precede window validation',()=>{
 for(const wide of [false,true]){const {p,m,h,call}=setup(wide),out=p.heap.alloc(8),api='GetWindowText'+(wide?'W':'A');for(const hwnd of [h,123])for(const count of [0,1,0xffffffff]){p.setError(1234);assert.equal(call(api,hwnd,0,count),0);assert.equal(p.lastError,1234);}m.fill(out,8,0x58);p.setError(1234);assert.equal(call(api,123,out,0),0);assert.equal(m.u32(out),0x58585858);assert.equal(p.lastError,1234);}
});
test('GetWindowText clears first character on invalid HWND or negative capacity',()=>{
 for(const wide of [false,true]){const {p,m,h,call}=setup(wide),out=p.heap.alloc(8),api='GetWindowText'+(wide?'W':'A');for(const hwnd of [h,123])for(const count of [0xffffffff,1,16]){if(hwnd===h&&count!==0xffffffff)continue;m.fill(out,8,0x58);p.setError(1234);assert.equal(call(api,hwnd,out,count),0);assert.equal(wide?m.u16(out):m.u8(out),0);assert.equal(m.u8(out+(wide?2:1)),0x58);assert.equal(p.lastError,hwnd===h?0:1400);}}
});
test('GetWindowText preserves short Unicode conversion behavior and callback errors',()=>{
 const {p,m,h,call}=setup(false),out=p.heap.alloc(16);m.fill(out,16,0x58);const result=call('GetWindowTextW',h,out,2);assert.equal(result.call.args[2],4);m.string(result.call.args[3],'Caf',false,4);p.setError(4321);assert.equal(result.then(3),3);assert.equal(m.u16(out),'C'.charCodeAt(0));assert.equal(m.u16(out+2),'a'.charCodeAt(0));assert.equal(m.u16(out+4),0x5858);assert.equal(p.lastError,4321);
 const other=setup(true),empty=other.p.heap.alloc(2);other.p.setError(1234);const tiny=other.call('GetWindowTextA',other.h,empty,1);assert.equal(other.p.lastError,0);other.m.w16(tiny.call.args[3],0);assert.equal(tiny.then(0),0);
});
test('GetWindowText rejects truncated first output character before any partial write',()=>{
 const {p,m,h,call}=setup(true);m.map(0x60000000,4096);m.w8(0x60000fff,0x58);const before=new Set(p.heap.blocks.keys());assert.throws(()=>call('GetWindowTextW',h,0x60000fff,2));assert.equal(m.u8(0x60000fff),0x58);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
});
