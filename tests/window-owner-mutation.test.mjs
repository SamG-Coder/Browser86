import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),name=p.heap.alloc(16);m.string(name,'STATIC',false,16);const create=(parent=0,style=0x80000000)=>u('CreateWindowExA',0,name,0,style,0,0,20,20,parent,0,0,0);return {p,events,u,create};}
test('Top-level owner setters return old ownership and store supplied child owners without normalization',()=>{
 for(const suffix of ['A','W']){const {p,u,create}=setup(),owner=create(),child=create(owner,0x40000000),target=create();p.setError(1234);assert.equal(u('SetWindowLong'+suffix,target,-8,owner),0);assert.equal(p.lastError,1234);assert.equal(u('SetWindowLong'+suffix,target,-8,child),owner);assert.equal(u('GetWindowLongA',target,-8),child);assert.equal(u('GetParent',target),child);assert.equal(u('IsChild',child,target),0);assert.equal(u('SetWindowLong'+suffix,target,-8,0),child);assert.equal(p.lastError,1400);assert.equal(u('GetParent',target),0);}
});
test('Changing ownership changes destruction lifetime and detachment leaves windows alive',()=>{
 const {u,create}=setup(),old=create(),newOwner=create(),target=create(old);u('SetWindowLongA',target,-8,newOwner);u('DestroyWindow',old);assert.equal(u('IsWindow',target),1);u('DestroyWindow',newOwner);assert.equal(u('IsWindow',target),0);
 const owner=create(),detached=create(owner);u('SetWindowLongW',detached,-8,0);u('DestroyWindow',owner);assert.equal(u('IsWindow',detached),1);
});
test('Invalid owners and self ownership fail without changing state or emitting updates',()=>{
 const {p,events,u,create}=setup(),owner=create(),target=create(owner),before=events.length;for(const candidate of [123,target]){assert.equal(u('SetWindowLongW',target,-8,candidate),0);assert.equal(p.lastError,87);assert.equal(u('GetWindowLongA',target,-8),owner);}assert.equal(events.length,before);assert.equal(u('SetWindowLongA',123,-8,owner),0);assert.equal(p.lastError,1400);
});
test('Child reparenting and ownership cycles are explicit unsupported paths without mutations',()=>{
 const {u,create}=setup(),owner=create(),child=create(owner,0x40000000),target=create(owner);assert.throws(()=>u('SetWindowLongA',child,-8,target),/reparenting/);assert.equal(u('GetParent',child),owner);assert.throws(()=>u('SetWindowLongW',owner,-8,target),/Cyclic/);assert.equal(u('GetWindowLongA',owner,-8),0);
});
