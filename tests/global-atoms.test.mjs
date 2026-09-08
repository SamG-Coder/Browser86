import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');p.apis.gui.windows.set(1,{hwnd:1});return {p,m:p.memory,k:(n,...a)=>p.apis.lookup('kernel32.dll',n).fn(...a),u:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),str:(s,wide=false)=>{const a=p.heap.alloc((s.length+1)*2);p.memory.string(a,s,wide,s.length+1);return a;}};}
test('GlobalAddAtomEx accepts zero and ATOM_FLAG_GLOBAL with ordinary shared reference lifetime',()=>{
 const {p,k,u,str}=setup(),name=str('Extended'),wide=str('EXTENDED',true);p.setError(1234);const atom=k('GlobalAddAtomExA',name,0);assert.ok(atom);assert.equal(k('GlobalAddAtomExW',wide,2),atom);assert.equal(k('GlobalFindAtomA',name),atom);assert.equal(p.lastError,1234);
 u('SetPropA',1,atom,321);assert.equal(u('GetPropW',1,wide),321);assert.equal(u('RemovePropW',1,atom),321);k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomA',name),atom);k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomA',name),0);assert.equal(p.lastError,2);
});
test('GlobalAddAtomEx integer atoms bypass flags and string failures do not add a reference',()=>{
 const {p,m,k,str}=setup(),name=str('Flags'),atom=k('GlobalAddAtomA',name);
 for(const suffix of ['A','W']){
  const text=str('Flags',suffix==='W');for(const flags of [4,0x80000000,0xffffffff]){assert.equal(k('GlobalAddAtomEx'+suffix,text,flags),0);assert.equal(p.lastError,87);}
  for(const flags of [0,1,2,0xffffffff])for(const key of [0,1,0xbfff]){p.setError(1234);assert.equal(k('GlobalAddAtomEx'+suffix,key,flags),key);assert.equal(p.lastError,1234);}
  assert.throws(()=>k('GlobalAddAtomEx'+suffix,text,1),e=>e.code==='UNSUPPORTED_ATOM');
 }
 m.map(0x60000000,4096);m.w8(0x60000fff,65);assert.throws(()=>k('GlobalAddAtomExA',0x60000fff,0));k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomA',name),0);
});
test('Global atoms share A/W identity and references while remaining separate from local atoms',()=>{
 const {p,k,str}=setup(),name=str('MiXeD'),wide=str('MIXED',true);p.setError(1234);const atom=k('GlobalAddAtomA',name);assert.equal(k('GlobalAddAtomW',wide),atom);assert.equal(k('GlobalFindAtomA',name),atom);assert.equal(k('GlobalFindAtomW',wide),atom);assert.equal(p.lastError,1234);assert.equal(k('FindAtomA',name),0);assert.equal(p.lastError,2);
 k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomW',wide),atom);k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomW',wide),0);assert.equal(p.lastError,2);assert.equal(k('GlobalDeleteAtom',atom),0);assert.equal(p.lastError,6);
});
test('Global name retrieval distinguishes unterminated wide truncation from ANSI more-data errors',()=>{
 const {p,m,k,str}=setup(),atom=k('GlobalAddAtomW',str('MiXeD',true)),out=p.heap.alloc(32);
 for(const size of [0,1,3,6]){m.fill(out,32,0x5a);p.setError(1234);assert.equal(k('GlobalGetAtomNameW',atom,out,size),Math.min(5,size));assert.equal(p.lastError,size?1234:234);if(size>0&&size<=5)assert.equal(m.u16(out+size*2),0x5a5a);if(size===6)assert.equal(m.wstr(out),'MiXeD');
  m.fill(out,32,0x5a);p.setError(1234);assert.equal(k('GlobalGetAtomNameA',atom,out,size),size<6?0:5);assert.equal(p.lastError,size<6?234:1234);if(size)assert.equal(m.cstr(out),'MiXeD'.slice(0,size-1));else assert.equal(m.u8(out),0x5a);
 }
 m.map(0x60000000,4096);m.w16(0x60000ffe,0x1234);assert.throws(()=>k('GlobalGetAtomNameW',atom,0x60000ffe,3));assert.equal(m.u16(0x60000ffe),0x1234);
 assert.equal(k('GlobalFindAtomW',str('x'.repeat(256),true)),0);assert.equal(p.lastError,87);
});
test('Property string and global atom keys alias, and numeric setters do not acquire references',()=>{
 const {p,k,u,str}=setup(),name=str('Context'),atom=k('GlobalAddAtomA',name);assert.equal(u('SetPropW',1,atom,123),1);assert.equal(u('GetPropA',1,name),123);
 k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomA',name),0);assert.equal(u('GetPropW',1,atom),123);assert.equal(u('GetPropA',1,name),0);assert.equal(p.lastError,2);assert.equal(u('RemovePropA',1,atom),123);
});
test('String property replacement acquires references and removal releases one property reference',()=>{
 const {p,k,u,str}=setup(),name=str('Context');u('SetPropA',1,name,1);const atom=k('GlobalFindAtomA',name);assert.ok(atom);u('SetPropA',1,name,2);assert.equal(u('GetPropW',1,atom),2);assert.equal(u('RemovePropW',1,atom),2);assert.equal(k('GlobalFindAtomA',name),atom);k('GlobalDeleteAtom',atom);assert.equal(k('GlobalFindAtomA',name),0);assert.equal(p.lastError,2);
 u('SetPropA',1,name,3);p.apis.gui.destroy(1);assert.equal(k('GlobalFindAtomA',name),0);
});
test('Enumeration resolves atom-keyed property names using the global table original spelling',()=>{
 const {m,k,u,str}=setup(),name=str('Spelling'),atom=k('GlobalAddAtomA',name);u('SetPropA',1,atom,99);const result=u('EnumPropsW',1,123);assert.equal(m.wstr(result.call.args[1]),'Spelling');assert.equal(result.call.args[2],99);assert.equal(result.then(7),7);
});
