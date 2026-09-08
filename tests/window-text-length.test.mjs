import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a),name=p.heap.alloc(16);m.string(name,'STATIC',false,16);const h=call('CreateWindowExA',0,name,0,0,0,0,20,20,0,0,0,0);call('SetWindowLong'+(wide?'W':'A'),h,-4,12345);return {p,m,h,call};}
test('Window length APIs query custom procedures and cross-encoding queries retrieve actual text',()=>{
 for(const wide of [false,true])for(const callerWide of [false,true]){
  const {p,m,h,call}=setup(wide),before=new Set(p.heap.blocks.keys());p.setError(1234);
  let result=call('GetWindowTextLength'+(callerWide?'W':'A'),h);assert.deepEqual(result.call.args,[h,14,0,0]);result=result.then(7);
  if(wide!==callerWide){assert.equal(result.call.args[1],13);assert.equal(result.call.args[2],8);m.string(result.call.args[3],'Café',wide,8);result=result.then(4);assert.equal(result,4);}else assert.equal(result,7);
  assert.equal(p.lastError,1234);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('Length messages preserve wParam and normalize cross-encoding lParam, with no text callback for zero',()=>{
 for(const wide of [false,true])for(const callerWide of [false,true]){const {call,h}=setup(wide),result=call('SendMessage'+(callerWide?'W':'A'),h,14,99,88);assert.deepEqual(result.call.args,[h,14,99,wide===callerWide?88:0]);assert.equal(result.then(0),0);}
});
test('Length query invalid HWNDs fail with 1400 and callback-set errors survive',()=>{
 const {p,call,h}=setup(true);for(const suffix of ['A','W']){p.setError(1234);assert.equal(call('GetWindowTextLength'+suffix,123),0);assert.equal(p.lastError,1400);}
 let result=call('GetWindowTextLengthA',h);result=result.then(7);p.setError(4321);assert.equal(result.then(0),0);assert.equal(p.lastError,4321);
});
test('Cross-encoding length queries bound allocations and release buffers on invalid results or destruction',()=>{
 const {p,call,h}=setup(false),before=new Set(p.heap.blocks.keys());assert.throws(()=>call('GetWindowTextLengthW',h).then(1048576),/conversion limit/);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 const bad=call('GetWindowTextLengthW',h).then(7);assert.throws(()=>bad.then(8),/count outside/);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 const pending=call('GetWindowTextLengthW',h).then(7);let destroy=call('DestroyWindow',h);while(destroy?.call)destroy=destroy.then(0);assert.equal(pending.then(0),0);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
});
