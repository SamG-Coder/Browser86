import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),name=p.heap.alloc(32),cls=p.heap.alloc(40,true);m.string(name,'Procedure',wide,10);m.w32(cls+4,111);m.w32(cls+36,name);const atom=u('RegisterClass'+(wide?'W':'A'),cls),create=()=>{let r=u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);while(r?.call)r=r.then(r.call.args[1]===129?1:0);return r;};return {p,u,create,suffix:wide?'W':'A'};}
test('Class procedure replacement applies to future windows and preserves existing procedures through restoration',()=>{
 for(const wide of [false,true]){const {p,u,create,suffix}=setup(wide),old=create();p.setError(1234);assert.equal(u('SetClassLong'+suffix,old,-24,222),111);assert.equal(p.lastError,1234);assert.equal(u('GetClassLong'+suffix,old,-24),222);const newer=create();assert.equal(u('SendMessage'+suffix,old,0x401,0,0).call.address,111);assert.equal(u('SendMessage'+suffix,newer,0x401,0,0).call.address,222);assert.equal(u('SetClassLong'+suffix,newer,-24,111),222);const restored=create();assert.equal(u('SendMessage'+suffix,newer,0x401,0,0).call.address,222);assert.equal(u('SendMessage'+suffix,restored,0x401,0,0).call.address,111);}
});
test('Per-window subclasses remain independent from class procedure mutations',()=>{
 const {u,create,suffix}=setup(false),h=create();u('SetWindowLongW',h,-4,333);assert.equal(u('SetClassLongA',h,-24,222),111);assert.equal(u('GetWindowLongW',h,-4),333);assert.equal(u('IsWindowUnicode',h),1);const other=create();assert.equal(u('GetWindowLongA',other,-4),222);assert.equal(u('IsWindowUnicode',other),0);
});
test('Null class procedure replacement returns the previous value and can be restored',()=>{
 for(const wide of [false,true]){const {p,u,create,suffix}=setup(wide),h=create();p.setError(1234);assert.equal(u('SetClassLong'+suffix,h,-24,0),111);assert.equal(u('GetClassLong'+suffix,h,-24),0);assert.equal(p.lastError,1234);assert.equal(u('SetClassLong'+suffix,h,-24,111),0);assert.equal(u('GetWindowLong'+suffix,h,-4),111);}
});
test('Cross-encoding thunk requirements and invalid HWNDs do not mutate class procedures',()=>{
 const {p,u,create}=setup(false),h=create();assert.throws(()=>u('SetClassLongW',h,-24,222),/thunks/);assert.equal(u('GetClassLongA',h,-24),111);assert.equal(u('SetClassLongA',123,-24,222),0);assert.equal(p.lastError,1400);assert.equal(u('GetClassLongA',h,-24),111);
});
