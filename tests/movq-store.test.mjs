import test from 'node:test';
import assert from 'node:assert/strict';
import {machine} from './helpers.mjs';
test('MOVQ store copies low 64 bits and leaves surrounding bytes intact',()=>{const {c,m}=machine([0x66,0x0f,0xd6,0x05,0x03,0,2,0]);c.xmm[0].set(Array.from({length:16},(_,i)=>i+1));m.fill(0x20000,20,0xaa);const flags=c.flags;c.step();assert.deepEqual([...m.read(0x20002,10)],[0xaa,1,2,3,4,5,6,7,8,0xaa]);assert.equal(c.flags,flags);});
test('MOVQ register destination clears high 64 bits including self moves',()=>{for(const modrm of [0xc1,0xc0]){const {c}=machine([0x66,0x0f,0xd6,modrm]);c.xmm[0].fill(7);c.xmm[1].fill(8);c.step();assert.deepEqual([...c.xmm[modrm&7]],[...Array(8).fill(7),...Array(8).fill(0)]);}});
