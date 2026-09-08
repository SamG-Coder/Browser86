import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,call:(n,...a)=>p.apis.lookup('kernel32.dll',n).fn(...a),str:(s,wide=false)=>{const a=p.heap.alloc((s.length+1)*2);p.memory.string(a,s,wide,s.length+1);return a;}};}
test('InitAtomTable succeeds before and after implicit initialization without clearing names or references',()=>{
 const {p,call,str}=setup();p.setError(1234);assert.equal(call('InitAtomTable',0),1);assert.equal(p.lastError,1234);const name=str('Initialized'),atom=call('AddAtomA',name);call('AddAtomA',name);
 for(const size of [1,37,65535,0xffffffff]){assert.equal(call('InitAtomTable',size),1);assert.equal(p.lastError,1234);assert.equal(call('FindAtomA',name),atom);}
 call('DeleteAtom',atom);assert.equal(call('FindAtomA',name),atom);call('DeleteAtom',atom);assert.equal(call('FindAtomA',name),0);
 const other=setup(),otherName=other.str('Implicit'),otherAtom=other.call('AddAtomA',otherName);assert.equal(other.call('InitAtomTable',37),1);assert.equal(other.call('FindAtomA',otherName),otherAtom);
});
test('Local atom reference overflow pins on addition 65536, while count 65535 remains deletable',()=>{
 for(const count of [65535,65536]){
  const {p,call,str}=setup(),name=str('PinnedBoundary'),wide=str('PINNEDBOUNDARY',true);p.setError(1234);const atom=call('AddAtomA',name);
  for(let i=1;i<count;i++)assert.equal(call('AddAtomW',wide),atom);assert.equal(p.lastError,1234);
  for(let i=0;i<count;i++)assert.equal(call('DeleteAtom',atom),0);assert.equal(p.lastError,1234);
  assert.equal(call('FindAtomA',name),count===65535?0:atom);assert.equal(p.lastError,count===65535?2:1234);
  if(count===65536){assert.equal(call('InitAtomTable',0),1);for(let i=0;i<3;i++){assert.equal(call('AddAtomA',name),atom);assert.equal(call('DeleteAtom',atom),0);}assert.equal(call('FindAtomW',wide),atom);}
 }
});
test('Local atoms share A/W names, preserve spelling and release only after matching deletes',()=>{
 const {p,m,call,str}=setup(),name=str('MiXéd'),wide=str('MIXÉD',true),out=p.heap.alloc(32);p.setError(1234);
 const atom=call('AddAtomA',name);assert.ok(atom>=0xc000&&atom<=0xffff);assert.equal(call('AddAtomW',wide),atom);assert.equal(call('FindAtomA',name),atom);assert.equal(call('FindAtomW',wide),atom);assert.equal(p.lastError,1234);
 assert.equal(call('GetAtomNameW',atom,out,16),5);assert.equal(m.wstr(out),'MiXéd');assert.equal(call('DeleteAtom',atom),0);assert.equal(call('FindAtomA',name),atom);assert.equal(call('DeleteAtom',atom),0);assert.equal(call('FindAtomA',name),0);assert.equal(p.lastError,2);assert.equal(call('DeleteAtom',atom),0);assert.equal(p.lastError,6);
});
test('Integer atoms accept pointer and decimal forms without table references',()=>{
 const {p,m,call,str}=setup(),out=p.heap.alloc(32);
 for(const n of [0,1,0xbfff]){p.setError(1234);assert.equal(call('AddAtomA',n),n);assert.equal(call('FindAtomW',n),n);assert.equal(call('DeleteAtom',n),0);assert.equal(p.lastError,1234);}
 assert.equal(call('AddAtomW',str('#0001',true)),1);assert.equal(call('GetAtomNameA',1,out,16),2);assert.equal(m.cstr(out),'#1');
 for(const name of [0xc000,str('#0'),str('#49152')]){assert.equal(call('AddAtomA',name),0);assert.equal(p.lastError,87);}
});
test('Atom names enforce native lengths and missing-name errors while isolating guest processes',()=>{
 const a=setup(),b=setup();assert.ok(a.call('AddAtomA',a.str('LocalOnly')));assert.equal(b.call('FindAtomA',b.str('LocalOnly')),0);assert.equal(b.p.lastError,2);
 for(const wide of [false,true]){const suffix=wide?'W':'A';assert.ok(a.call('AddAtom'+suffix,a.str('x'.repeat(255),wide)));assert.equal(a.call('AddAtom'+suffix,a.str('y'.repeat(256),wide)),0);assert.equal(a.p.lastError,87);assert.equal(a.call('FindAtom'+suffix,a.str('y'.repeat(256),wide)),0);assert.equal(a.p.lastError,2);assert.equal(a.call('AddAtom'+suffix,a.str('',wide)),0);assert.equal(a.p.lastError,123);}
});
test('GetAtomName returns bounded null-terminated output with native failure precedence',()=>{
 const {p,m,call,str}=setup(),atom=call('AddAtomW',str('MiXeD',true)),out=p.heap.alloc(32);
 for(const suffix of ['A','W']){const wide=suffix==='W';for(const [size,result,error]of [[0,0,234],[1,0,122],[3,2,1234],[6,5,1234],[-1,5,1234]]){m.fill(out,32,0x5a);p.setError(1234);assert.equal(call('GetAtomName'+suffix,atom,out,size),result);assert.equal(p.lastError,error);if(result)assert.equal(wide?m.wstr(out):m.cstr(out),'MiXeD'.slice(0,result));else assert.equal(m.u8(out),0x5a);}
  assert.equal(call('GetAtomName'+suffix,0,out,0),0);assert.equal(p.lastError,234);assert.equal(call('GetAtomName'+suffix,0,out,3),0);assert.equal(p.lastError,87);assert.equal(call('GetAtomName'+suffix,0xffff,out,1),0);assert.equal(p.lastError,6);
 }
});
test('Atom buffers validate full writes and ANSI output uses the Windows best-fit table',()=>{
 const {p,m,call,str}=setup(),atom=call('AddAtomW',str('Ābc',true)),out=p.heap.alloc(8);assert.equal(call('GetAtomNameA',atom,out,8),3);assert.equal(m.cstr(out),'Abc');
 m.map(0x60000000,4096);m.w16(0x60000ffe,0x1234);assert.throws(()=>call('GetAtomNameW',atom,0x60000ffe,8));assert.equal(m.u16(0x60000ffe),0x1234);assert.throws(()=>call('AddAtomW',0x60000ffe));assert.equal(call('FindAtomW',str('Ābc',true)),atom);
});
