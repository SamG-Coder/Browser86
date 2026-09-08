import test from 'node:test';
import assert from 'node:assert/strict';
import {machine} from './helpers.mjs';
test('CVTDQ2PD converts signed low dwords without corrupting a self-source',()=>{const {c}=machine([0xf3,0x0f,0xe6,0xc0]),v=new DataView(c.xmm[0].buffer);v.setInt32(0,-2147483648,true);v.setInt32(4,2147483647,true);c.step();assert.equal(v.getFloat64(0,true),-2147483648);assert.equal(v.getFloat64(8,true),2147483647);});
test('CVTDQ2PD reads exactly eight bytes from an unaligned memory source',()=>{const {c,m}=machine([0xf3,0x0f,0xe6,0x05,0x01,0,2,0]);m.w32(0x20001,0xffffffff);m.w32(0x20005,42);const flags=c.flags;c.step();const v=new DataView(c.xmm[0].buffer);assert.equal(v.getFloat64(0,true),-1);assert.equal(v.getFloat64(8,true),42);assert.equal(c.flags,flags);});
