import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32),out=p.heap.alloc(32);m.string(name,'Café Ā',true,16);m.w32(cls+36,name);const atom=u('RegisterClassW',cls),h=u('CreateWindowExW',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,m,u,h,out};}
test('Class-name queries truncate and terminate in the requested encoding with ANSI best-fit conversion',()=>{
 const {p,m,u,h,out}=setup();for(const wide of [false,true])for(const cap of [2,4,16]){m.fill(out,32,0x58);p.setError(1234);const n=u('GetClassName'+(wide?'W':'A'),h,out,cap),expected=(wide?'Café Ā':'Café A').slice(0,cap-1);assert.equal(n,expected.length);assert.equal(p.apis.str(out,wide),expected);assert.equal(m.u8(out+(n+1)*(wide?2:1)),0x58);assert.equal(p.lastError,1234);}
});
test('ANSI and Unicode zero/one capacities follow distinct native output and error rules',()=>{
 const {p,m,u,h,out}=setup();for(const cap of [0,1])for(const wide of [false,true]){m.fill(out,32,0x58);p.setError(1234);assert.equal(u('GetClassName'+(wide?'W':'A'),h,out,cap),0);assert.equal(p.lastError,wide?122:1234);assert.equal(m.u8(out),!wide&&cap===1?0:0x58);}
});
test('Class-name queries validate HWND before capacity and preserve output on failure',()=>{
 const {p,m,u,h,out}=setup();u('DestroyWindow',h);m.fill(out,32,0x58);for(const hwnd of [h,123])for(const suffix of ['A','W']){assert.equal(u('GetClassName'+suffix,hwnd,out,0),0);assert.equal(p.lastError,1400);assert.equal(m.u8(out),0x58);}
});
test('Class-name output ranges are checked before writes and negative capacities remain explicit',()=>{
 const {m,u,h,out}=setup();m.fill(out,32,0x58);assert.throws(()=>u('GetClassNameA',h,out,-1),/Negative class-name/);assert.equal(m.u8(out),0x58);const end=0x60000000;m.map(end,4096,'rw','class-name test');m.w8(end+4095,0x58);assert.throws(()=>u('GetClassNameW',h,end+4095,2));assert.equal(m.u8(end+4095),0x58);
});
