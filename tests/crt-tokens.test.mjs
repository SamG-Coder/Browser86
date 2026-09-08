import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('strtok skips delimiter runs, terminates tokens and permits delimiter changes',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a),text=p.heap.string(' ,one,,two:three'),comma=p.heap.string(' ,'),colon=p.heap.string(':');
  const first=c('strtok',text,comma);assert.equal(m.cstr(first),'one');assert.equal(m.u8(first+3),0);assert.equal(m.cstr(c('strtok',0,comma)),'two:three');assert.equal(c('strtok',0,comma),0);
  c('strtok',p.heap.string('a,b:c'),comma);assert.equal(m.cstr(c('strtok',0,colon)),'b');assert.equal(m.cstr(c('strtok',0,colon)),'c');assert.equal(c('strtok',0,colon),0);
});
