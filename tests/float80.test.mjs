import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFloat80,decodeFloat80} from '../src/runtime/float80.js';
import {machine} from './helpers.mjs';
test('x87 extended storage preserves binary64 values including special and subnormal values',()=>{for(const value of [0,-0,1,-2.5,Math.PI,Number.MIN_VALUE,Number.MAX_VALUE,Infinity,-Infinity,NaN])assert.ok(Object.is(decodeFloat80(encodeFloat80(value)),value));assert.deepEqual([...encodeFloat80(1)],[0,0,0,0,0,0,0,128,255,63]);assert.deepEqual([...encodeFloat80(-0)],[0,0,0,0,0,0,0,0,0,128]);});
test('FSTP m80 writes exactly ten bytes and FLD m80 restores the value',()=>{const {c,m}=machine([0xdb,0x3d,0x03,0,2,0,0xdb,0x2d,0x03,0,2,0]);m.fill(0x20000,20,0xa5);c.fpush(42.125);c.step();assert.equal(c.fpu.length,0);assert.equal(m.u8(0x20002),0xa5);assert.equal(m.u8(0x2000d),0xa5);c.step();assert.equal(c.fpop(),42.125);});
