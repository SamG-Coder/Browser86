import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide,extended){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(64,true),o=extended?4:0,name=p.heap.alloc(32);m.string(name,'Validation',wide,11);if(extended)m.w32(cls,48);m.w32(cls+o+36,name);return {p,m,u,cls,o,register:()=>u('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls)};}
test('Class registration rejects signed-negative extra counts without consuming atoms or names',()=>{
 for(const wide of [false,true])for(const extended of [false,true])for(const field of [8,12]){const {p,m,u,cls,o,register}=setup(wide,extended),next=p.apis.gui.nextAtom;for(const value of [0xffffffff,0x80000000]){m.w32(cls+o+field,value);assert.equal(register(),0);assert.equal(p.lastError,87);assert.equal(p.apis.gui.nextAtom,next);assert.equal(p.apis.gui.classes.size,0);}m.w32(cls+o+field,0);assert.equal(register(),next);}
});
test('RegisterClassEx requires the exact x86 structure size in either encoding',()=>{
 for(const wide of [false,true]){const {p,m,cls,register}=setup(wide,true),next=p.apis.gui.nextAtom;for(const size of [0,40,47,49,80,0xffffffff]){m.w32(cls,size);assert.equal(register(),0);assert.equal(p.lastError,87);assert.equal(p.apis.gui.nextAtom,next);}m.w32(cls,48);assert.equal(register(),next);}
});
test('Class registration accepts verified extra storage above forty bytes',()=>{
 for(const wide of [false,true])for(const extended of [false,true])for(const size of [0,40,41,256]){const {p,m,cls,o,register}=setup(wide,extended);m.w32(cls+o+8,size);m.w32(cls+o+12,size);p.setError(1234);assert.ok(register());assert.equal(p.lastError,1234);const record=p.apis.gui.classes.get('validation');assert.equal(record.classExtra,size);assert.equal(record.windowExtra,size);}
});
test('Truncated registration structures fault before changing registry or atom allocation',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){const {p,m,u}=setup(wide,extended),next=p.apis.gui.nextAtom;m.map(0x60000000,4096);const ptr=0x60001000-(extended?44:36);if(extended)m.w32(ptr,48);assert.throws(()=>u('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),ptr));assert.equal(p.apis.gui.nextAtom,next);assert.equal(p.apis.gui.classes.size,0);}
});
