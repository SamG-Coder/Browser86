import test from 'node:test';
import assert from 'node:assert/strict';
import {machine} from './helpers.mjs';
test('MOVLPD stores exactly the low eight bytes without changing registers or flags',()=>{
 const {c,m}=machine([0x66,0x0f,0x13,0x05,0x03,0x00,0x02,0x00]);c.xmm[0].set(Array.from({length:16},(_,i)=>i+1));m.fill(0x20000,32,0xaa);const flags=c.flags;c.step();assert.deepEqual([...m.read(0x20000,13)],[0xaa,0xaa,0xaa,1,2,3,4,5,6,7,8,0xaa,0xaa]);assert.deepEqual([...c.xmm[0]],Array.from({length:16},(_,i)=>i+1));assert.equal(c.flags,flags);
});
test('MOVLPD rejects a register destination',()=>{const {c}=machine([0x66,0x0f,0x13,0xc0]);assert.throws(()=>c.step(),/requires a memory/);});
