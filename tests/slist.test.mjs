import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('IA-32 InitializeSListHead resets exactly the eight-byte header',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,address=p.heap.alloc(24);m.fill(address,24,0xa5);
  p.apis.lookup('kernel32.dll','InitializeSListHead').fn(address+8);
  assert.deepEqual([...m.read(address,24)],[...Array(8).fill(0xa5),...Array(8).fill(0),...Array(8).fill(0xa5)]);
});
