import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
import {mulDiv} from '../src/runtime/integer-math.js';
test('Win32 MulDiv: native edge combinations and seeded full-width inputs match',()=>{
  const vectors=JSON.parse(fs.readFileSync(new URL('./muldiv-native-vectors.json',import.meta.url)));
  for(const [a,b,c,result] of vectors)assert.equal(mulDiv(a,b,c),result,`${a} * ${b} / ${c}`);assert.equal(vectors.length,4245);
});
test('Win32 MulDiv: signed half rounding and exact products above Number precision',()=>{
  for(const [a,b,c,result] of [[5,3,2,8],[-5,3,2,-8],[5,3,-2,-8],[-5,3,-2,8],[1,1,3,0],[2,1,3,1],[2147483647,2147483647,2147483647,2147483647]])assert.equal(mulDiv(a,b,c),result);
});
test('Win32 MulDiv: failures and legitimate negative results preserve guest last error',()=>{
  const {p}=guest('HelloConsole.exe'),call=p.apis.lookup('kernel32.dll','MulDiv').fn;p.setError(123);
  for(const args of [[1,1,0],[2147483647,2,1],[-2147483648,1,2],[-1,1,1]]){assert.equal(call(...args),-1);assert.equal(p.lastError,123);}
  assert.equal(call(0xffffffff,3,2),-2);assert.equal(p.lastError,123);
});
