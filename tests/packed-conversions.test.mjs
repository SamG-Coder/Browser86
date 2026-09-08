import test from 'node:test';
import assert from 'node:assert/strict';
import {machine} from './helpers.mjs';
test('CVTPD2PS narrows two doubles and clears high lanes on self conversion',()=>{const {c}=machine([0x66,0x0f,0x5a,0xc0]),v=new DataView(c.xmm[0].buffer);v.setFloat64(0,1.1,true);v.setFloat64(8,-2.5,true);c.step();assert.equal(v.getFloat32(0,true),Math.fround(1.1));assert.equal(v.getFloat32(4,true),-2.5);assert.equal(v.getBigUint64(8,true),0n);});
test('CVTPS2PD widens two floats into double lanes',()=>{const {c}=machine([0x0f,0x5a,0xc0]),v=new DataView(c.xmm[0].buffer);v.setFloat32(0,1.25,true);v.setFloat32(4,-2.5,true);c.step();assert.equal(v.getFloat64(0,true),1.25);assert.equal(v.getFloat64(8,true),-2.5);});
test('CVTDQ2PS converts every signed dword including float32 rounding boundaries',()=>{const {c}=machine([0x0f,0x5b,0xc0]),v=new DataView(c.xmm[0].buffer),values=[-2147483648,2147483647,16777217,-1];values.forEach((x,i)=>v.setInt32(i*4,x,true));c.step();assert.deepEqual(values.map((x,i)=>v.getFloat32(i*4,true)),values.map(Math.fround));});
test('MOVQ self load preserves the low qword and clears only high lanes',()=>{const {c}=machine([0xf3,0x0f,0x7e,0xc0]),v=new DataView(c.xmm[0].buffer);v.setFloat64(0,340,true);v.setFloat64(8,617,true);c.step();assert.equal(v.getFloat64(0,true),340);assert.equal(v.getBigUint64(8,true),0n);});
