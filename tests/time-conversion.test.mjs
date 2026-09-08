import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,a=p.heap.alloc(32,true),b=p.heap.alloc(32,true);return {m,a,b,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),put:(out,n)=>{m.w32(out,Number(n&0xffffffffn));m.w32(out+4,Number(n>>32n));},fields:(out,values)=>values.forEach((v,i)=>m.w16(out+i*2,v)),get:out=>Array.from({length:8},(_,i)=>m.u16(out+i*2))};}
test('Win32 time conversion: known epochs, leap date and high FILETIME boundary match native vectors',()=>{
  const {a,b,call,put,fields,get}=setup();call('SetLastError',123);
  for(const [ticks,expected] of [[0n,[1601,1,1,1,0,0,0,0]],[116444736000000000n,[1970,1,4,1,0,0,0,0]],[125963423999990000n,[2000,2,2,29,23,59,59,999]],[0x7fffffffffffffffn,[30828,9,4,14,2,48,5,477]]]){
    put(a,ticks);assert.equal(call('FileTimeToSystemTime',a,b),1);assert.deepEqual(get(b),expected);
    if(expected[0]<=30827){fields(b,[expected[0],expected[1],65535,...expected.slice(3)]);assert.equal(call('SystemTimeToFileTime',b,b),1);assert.equal(call('CompareFileTime',a,b),0);}
  }
  assert.equal(call('GetLastError'),123);
});
test('Win32 time conversion: rejects invalid dates and high-bit FILETIMEs without changing output',()=>{
  const {m,a,b,call,put,fields}=setup(),base=[2024,2,0,29,12,30,45,999];
  for(const [index,value] of [[0,1600],[0,30828],[0,1900],[1,0],[1,13],[3,0],[3,30],[4,24],[5,60],[6,60],[7,1000]]){
    const input=[...base];input[index]=value;fields(a,input);m.fill(b,16,0xcc);
    assert.equal(call('SystemTimeToFileTime',a,b),0);assert.equal(call('GetLastError'),87);assert.deepEqual([...m.read(b,16)],Array(16).fill(0xcc));
  }
  for(const value of [0x8000000000000000n,0xffffffffffffffffn]){put(a,value);assert.equal(call('FileTimeToSystemTime',a,b),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(b),0xcccccccc);}
});
test('Win32 time conversion: millisecond truncation and exact unsigned 100ns comparisons',()=>{
  const {m,a,b,call,put,get}=setup();
  for(const n of [1n,9999n,10000n,19999n]){put(a,n);assert.equal(call('FileTimeToSystemTime',a,b),1);assert.equal(get(b)[7],Number(n/10000n));}
  for(const [x,y] of [[2n**53n,2n**53n+1n],[0n,2n**63n],[2n**64n-2n,2n**64n-1n]]){
    put(a,x);put(b,y);assert.equal(call('CompareFileTime',a,b),-1);assert.equal(call('CompareFileTime',b,a),1);assert.equal(call('CompareFileTime',a,a),0);
  }
});
test('Win32 time conversion: whole-buffer validation and overlapping input/output',()=>{
  const {m,a,b,call,put,fields,get}=setup();m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
  put(a,0n);assert.throws(()=>call('FileTimeToSystemTime',a,edge));assert.equal(m.u32(edge),0xcccccccc);
  fields(a,[1601,1,0,1,0,0,0,0]);assert.throws(()=>call('SystemTimeToFileTime',a,edge));assert.equal(m.u32(edge),0xcccccccc);
  assert.throws(()=>call('CompareFileTime',edge,b));assert.throws(()=>call('SystemTimeToFileTime',edge,b));
  assert.equal(call('SystemTimeToFileTime',a,a),1);assert.equal(m.u32(a),0);assert.equal(m.u32(a+4),0);
  assert.equal(call('FileTimeToSystemTime',a,a),1);assert.deepEqual(get(a),[1601,1,1,1,0,0,0,0]);
});
