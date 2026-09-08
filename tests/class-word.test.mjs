import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'WordClass',false,16);m.w32(cls+36,name);m.w32(cls+8,8);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,u,atom,create};}
test('WORD writes overlap shared DWORD storage without overwriting neighboring bytes',()=>{
 const {p,u,create}=setup(),a=create(),b=create();u('SetClassLongW',a,0,0x12345678);p.setError(1234);assert.equal(u('GetClassWord',b,1),0x3456);assert.equal(u('SetClassWord',b,1,0xffffabcd),0x3456);assert.equal(u('GetClassLongA',a,0),0x12abcd78);assert.equal(u('GetClassWord',a,2),0x12ab);assert.equal(p.lastError,1234);
});
test('Class WORD bounds permit the last two bytes but reject partial and overflowing accesses',()=>{
 const {p,u,create}=setup(),h=create();assert.equal(u('SetClassWord',h,6,0xabcd),0);assert.equal(u('GetClassWord',h,6),0xabcd);for(const index of [7,8,0x7fffffff]){assert.equal(u('GetClassWord',h,index),0);assert.equal(p.lastError,1413);assert.equal(u('SetClassWord',h,index,0),0);assert.equal(p.lastError,1413);}assert.equal(u('GetClassWord',h,6),0xabcd);
});
test('GetClassWord exposes the atom only; metadata writes and other negative indices fail',()=>{
 const {p,u,atom,create}=setup(),h=create();p.setError(1234);assert.equal(u('GetClassWord',h,-32),atom);assert.equal(p.lastError,1234);for(const index of [-32,-26,-20,-18,-16,-14,-12,-10,-8,-7,-99]){assert.equal(u('SetClassWord',h,index,atom),0);assert.equal(p.lastError,1413);if(index!==-32){assert.equal(u('GetClassWord',h,index),0);assert.equal(p.lastError,1413);}}assert.equal(u('GetClassWord',h,-32),atom);
});
test('WORD accessors reject invalid and destroyed HWNDs and preserve surviving class storage',()=>{
 const {p,u,create}=setup(),a=create(),b=create();u('SetClassWord',a,0,1234);u('DestroyWindow',a);for(const h of [123,a]){assert.equal(u('GetClassWord',h,0),0);assert.equal(p.lastError,1400);assert.equal(u('SetClassWord',h,0,0),0);assert.equal(p.lastError,1400);}assert.equal(u('GetClassWord',b,0),1234);
});
