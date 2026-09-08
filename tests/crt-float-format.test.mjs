import test from 'node:test';
import assert from 'node:assert/strict';
import {formatFloat} from '../src/runtime/crt-float-format.js';
test('UCRT standard decimal formatting rounds exact halfway values to even',()=>{for(const [x,p,s]of [[2.5,0,'2'],[3.5,0,'4'],[-2.5,0,'-2'],[1.25,1,'1.2'],[1.75,1,'1.8'],[-0,2,'-0.00'],[0.1,20,'0.10000000000000000555']])assert.equal(formatFloat(x,'f',p),s);});
test('Scientific and general formats handle exponent carry, tiny values and trailing zeros',()=>{assert.equal(formatFloat(9.999,'e',2),'1.00e+01');assert.equal(formatFloat(123,'g',6),'123');assert.equal(formatFloat(0.00001,'g',6),'1e-05');assert.equal(formatFloat(Number.MIN_VALUE,'e',6),'4.940656e-324');assert.equal(formatFloat(Number.MAX_VALUE,'e',6),'1.797693e+308');assert.equal(formatFloat(1,'g',4,true),'1.000');assert.equal(formatFloat(Infinity,'E',2),'INF');});
