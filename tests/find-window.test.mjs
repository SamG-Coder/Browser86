import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('FindWindow matches top-level windows by optional case-insensitive class and caption',()=>{
  const {p}=guest('HelloConsole.exe'),u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),s=x=>p.heap.string(x),parent=u('CreateWindowExA',0,s('STATIC'),s('Calculator'),0,0,0,100,100,0,0,0,0);
  u('CreateWindowExA',0,s('EDIT'),s('Child'),0x40000000,0,0,20,20,parent,1,0,0);
  assert.equal(u('FindWindowA',s('static'),s('CALCULATOR')),parent);assert.equal(u('FindWindowW',0,p.heap.string('calculator',true)),parent);assert.equal(u('FindWindowA',s('EDIT'),0),0);assert.equal(u('FindWindowA',0,s('Child')),0);
  p.setError(123);assert.equal(u('FindWindowA',42,0),0);assert.equal(p.lastError,123);
});
