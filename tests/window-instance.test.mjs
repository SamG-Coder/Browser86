import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide,instance,proc=0){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),name=p.heap.alloc(32),cls=p.heap.alloc(40,true);m.string(name,'Instance',wide,9);m.w32(cls+4,proc);m.w32(cls+16,p.main.base);m.w32(cls+36,name);const atom=u('RegisterClass'+(wide?'W':'A'),cls),result=u('CreateWindowEx'+(wide?'W':'A'),0,atom,0,0,0,0,20,20,0,0,instance,0);return {p,m,u,result};}
test('Window instance queries preserve the creation value including null in both encodings',()=>{
 for(const wide of [false,true])for(const instance of [0,0x12345678,0x80000001]){const {p,u,result:h}=setup(wide,instance);p.setError(1234);assert.equal(u('GetWindowLongA',h,-6),instance);assert.equal(u('GetWindowLongW',h,-6),instance);assert.equal(p.lastError,1234);assert.equal(u('GetClassLongA',h,-16),p.main.base);}
});
test('Instance mutations return previous values without changing class, procedure encoding or process identity',()=>{
 const {p,u,result:h}=setup(true,0);p.setError(1234);assert.equal(u('SetWindowLongA',h,-6,0x87654321),0);assert.equal(u('SetWindowLongW',h,-6,0),0x87654321);assert.equal(u('GetWindowLongA',h,-6),0);assert.equal(p.lastError,1234);assert.equal(u('IsWindowUnicode',h),1);assert.equal(u('GetClassLongW',h,-16),p.main.base);assert.equal(u('GetWindowThreadProcessId',h,0),8);
});
test('Creation callbacks can query and replace the instance without rewriting CREATESTRUCT',()=>{
 const {m,u,result}=setup(false,123,111),h=result.call.args[0],cs=result.call.args[3];assert.equal(u('GetWindowLongA',h,-6),123);assert.equal(u('SetWindowLongW',h,-6,456),123);assert.equal(m.u32(cs+4),123);const next=result.then(1);assert.equal(u('GetWindowLongA',h,-6),456);assert.equal(next.then(0),h);
});
test('Invalid window indices and handles report errors without mutating instance state',()=>{
 const {p,u,result:h}=setup(false,123);for(const suffix of ['A','W'])for(const index of [-99,-100]){assert.equal(u('GetWindowLong'+suffix,h,index),0);assert.equal(p.lastError,1413);assert.equal(u('SetWindowLong'+suffix,h,index,456),0);assert.equal(p.lastError,1413);assert.equal(u('GetWindowLongA',h,-6),123);}u('DestroyWindow',h);assert.equal(u('SetWindowLongA',h,-6,456),0);assert.equal(p.lastError,1400);assert.equal(u('GetWindowLongW',h,-6),0);assert.equal(p.lastError,1400);
});
