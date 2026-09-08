import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Wide CRT rename and remove mutate only the virtual filesystem and report missing paths',()=>{
 const {p}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a),a=p.heap.string('C:/app/café.tmp',true),b=p.heap.string('C:/app/café.dat',true);
 p.vfs.writeFile('C:/app/café.tmp',Uint8Array.of(1,2,3));assert.equal(call('_wrename',a,b),0);assert.deepEqual([...p.vfs.readFile('C:/app/café.dat')],[1,2,3]);assert.equal(call('_wremove',b),0);assert.equal(call('_wremove',b),-1);assert.equal(p.memory.u32(call('_errno')),2);
});
