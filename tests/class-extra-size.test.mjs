import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'ExtraSize',false,16);m.w32(cls+36,name);m.w32(cls+8,8);m.w32(cls+12,8);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,u,create};}
test('Class extra-size mutation fails with error 87 and leaves storage intact',()=>{
 const {p,u,create}=setup(),h=create();u('SetClassLongA',h,4,0xabcdef);for(const suffix of ['A','W'])for(const size of [0,4,8,12,0xffffffff]){assert.equal(u('SetClassLong'+suffix,h,-20,size),0);assert.equal(p.lastError,87);assert.equal(u('GetClassLongA',h,-20),8);assert.equal(u('GetClassLongW',h,4),0xabcdef);}
});
test('Window extra-size replacement affects future allocations while existing data and bounds persist',()=>{
 const {p,u,create}=setup(),original=create();u('SetWindowLongA',original,4,1234);let previous=8;
 for(const size of [4,12,0,8]){p.setError(1234);assert.equal(u('SetClassLongW',original,-18,size),previous);assert.equal(p.lastError,1234);const next=create();assert.equal(u('GetClassLongA',next,-18),size);assert.equal(u('GetWindowLongW',original,4),1234);
  for(const offset of [0,4,8]){p.setError(1234);assert.equal(u('GetWindowLongA',next,offset),0);assert.equal(p.lastError,offset+4<=size?1234:1413);}previous=size;
 }
});
test('Shrinking the class default does not shrink windows created with the previous larger size',()=>{
 const {u,create}=setup(),h=create();u('SetClassLongA',h,-18,12);const larger=create();u('SetWindowLongW',larger,8,0xfedcba98);u('SetClassLongW',h,-18,0);assert.equal(u('GetWindowLongA',larger,8),0xfedcba98);assert.equal(u('GetClassLongA',larger,-18),0);
});
test('Raw signed-negative size mutations are queryable but unverified creation is explicitly rejected',()=>{
 const {p,u,create}=setup(),h=create();assert.equal(u('SetClassLongA',h,-18,0xffffffff),8);assert.equal(u('GetClassLongW',h,-18),0xffffffff);const count=p.apis.gui.windows.size;assert.throws(create,/negative class extra-storage/);assert.equal(p.apis.gui.windows.size,count);assert.equal(u('SetClassLongW',123,-18,4),0);assert.equal(p.lastError,1400);assert.equal(u('SetClassLongW',h,-18,8),0xffffffff);assert.ok(create());
});
