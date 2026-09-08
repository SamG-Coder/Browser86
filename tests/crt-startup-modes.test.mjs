import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Single-thread CRT locale configuration returns the previous setting',()=>{
  const {p}=guest('HelloConsole.exe'),c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a);
  assert.equal(c('_configthreadlocale',0),2);assert.equal(c('_configthreadlocale',1),2);assert.equal(c('_configthreadlocale',0),1);assert.equal(c('_configthreadlocale',2),1);
  assert.equal(c('_configthreadlocale',9),-1);assert.equal(p.memory.u32(c('_errno')),22);assert.equal(c('_configthreadlocale',0),2);
});
test('CRT default allocation policy is supported and new-handler requests are explicit',()=>{
  const {p}=guest('HelloConsole.exe'),c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a);
  assert.equal(c('_set_new_mode',0),0);assert.equal(c('_query_new_mode'),0);assert.equal(c('_set_new_mode',9),-1);assert.equal(p.memory.u32(c('_errno')),22);assert.throws(()=>c('_set_new_mode',1),{code:'CRT_NEW_MODE'});
});
