import test from 'node:test';
import assert from 'node:assert/strict';
import {machine} from './helpers.mjs';
test('PADDD wraps each lane independently without changing flags',()=>{const {c}=machine([0x66,0x0f,0xfe,0xc1]),a=new DataView(c.xmm[0].buffer),b=new DataView(c.xmm[1].buffer);[0xffffffff,0x7fffffff,10,0].forEach((v,i)=>a.setUint32(i*4,v,true));[1,1,20,0xffffffff].forEach((v,i)=>b.setUint32(i*4,v,true));const flags=c.flags;c.step();assert.deepEqual(Array.from({length:4},(_,i)=>a.getUint32(i*4,true)),[0,0x80000000,30,0xffffffff]);assert.equal(c.flags,flags);});
test('PSHUFHW and PSHUFLW rearrange one half and preserve the other',()=>{for(const prefix of [0xf3,0xf2]){const {c}=machine([prefix,0x0f,0x70,0xc0,0x1b]),view=new DataView(c.xmm[0].buffer);for(let i=0;i<8;i++)view.setUint16(i*2,i,true);c.step();assert.deepEqual(Array.from({length:8},(_,i)=>view.getUint16(i*2,true)),prefix===0xf3?[0,1,2,3,7,6,5,4]:[3,2,1,0,4,5,6,7]);}});
