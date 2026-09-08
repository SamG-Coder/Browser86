import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,a=p.heap.alloc(8,true),b=p.heap.alloc(8,true);return {m,a,b,call:(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),put:n=>{m.w32(a,Number(n&0xffffffffn));m.w32(a+4,Number(n>>32n));}};}
test('Win32 DOS times: native rounding vectors include sub-millisecond and calendar rollover',()=>{
  const {m,a,b,call,put}=setup();call('SetLastError',123);
  for(const [base,date,time,nextDate,nextTime] of [[119600064000000000n,0x21,0,0x21,1],[133537247980000000n,0x585d,0xbf7d,0x5861,0]]){
    for(const delta of [-1n,0n,1n,9999999n,10000000n,19999999n,20000000n]){
      put(base+delta);assert.equal(call('FileTimeToDosDateTime',a,b,b+2),1);
      assert.equal(m.u16(b),delta<=0n?date:nextDate);assert.equal(m.u16(b+2),delta<=0n?time:nextTime);
    }
  }
  assert.equal(call('GetLastError'),123);
});
test('Win32 DOS times: every packed calendar date is validated and valid dates round trip',()=>{
  const {m,a,b,call}=setup();let valid=0;
  for(let packed=0;packed<65536;packed++){
    const year=1980+(packed>>>9),month=(packed>>>5)&15,day=packed&31;
    const leap=year%4===0&&(year%100!==0||year%400===0),days=[0,31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    const expected=month>=1&&month<=12&&day>=1&&day<=days[month];
    assert.equal(call('DosDateTimeToFileTime',packed,0,a),expected?1:0);
    if(expected){valid++;assert.equal(call('FileTimeToDosDateTime',a,b,b+2),1);assert.equal(m.u16(b),packed);assert.equal(m.u16(b+2),0);}
  }
  assert.equal(valid,46751);
});
test('Win32 DOS times: invalid time fields and rounded range failures preserve output',()=>{
  const {m,a,b,call,put}=setup();
  for(const time of [30,31,60<<5,63<<5,24<<11,31<<11]){
    m.fill(a,8,0xcc);assert.equal(call('DosDateTimeToFileTime',0x21,time,a),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(a),0xcccccccc);
  }
  for(const n of [0n,119600064000000000n-20000000n,159992927980000001n,0xffffffffffffffffn]){
    put(n);m.fill(b,4,0xcc);assert.equal(call('FileTimeToDosDateTime',a,b,b+2),0);assert.equal(call('GetLastError'),87);assert.equal(m.u32(b),0xcccccccc);
  }
  put(159992927980000000n);assert.equal(call('FileTimeToDosDateTime',a,b,b+2),1);assert.equal(m.u16(b),0xff9f);assert.equal(m.u16(b+2),0xbf7d);
});
test('Win32 DOS times: WORD argument truncation, overlapping buffers and atomic output checks',()=>{
  const {m,a,b,call}=setup();assert.equal(call('DosDateTimeToFileTime',0xffff0021,0xffff0000,a),1);
  m.w16(b,0xcccc);assert.throws(()=>call('FileTimeToDosDateTime',a,b,0));assert.equal(m.u16(b),0xcccc);
  m.map(0x60000000,4096);m.w32(0x60000ffc,0xcccccccc);assert.throws(()=>call('DosDateTimeToFileTime',0x21,0,0x60000ffc));assert.equal(m.u32(0x60000ffc),0xcccccccc);
  assert.equal(call('FileTimeToDosDateTime',a,a,a+2),1);assert.equal(m.u16(a),0x21);assert.equal(m.u16(a+2),0);
});
