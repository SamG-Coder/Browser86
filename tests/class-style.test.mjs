import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide=false,extended=false){
 const {p,events}=guest('HelloConsole.exe'),m=p.memory,call=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args),cls=p.heap.alloc(48,true),name=p.heap.alloc(32),o=extended?4:0;
 m.string(name,'StyleClass',wide,16);if(extended)m.w32(cls,48);m.w32(cls+o+36,name);
 const register=style=>{m.w32(cls+o,style);return call('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls);};
 const create=atom=>call('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);
 return {p,events,call,register,create};
}
test('Class style setters retain raw prior bits while queries expose the native public mask',()=>{
 for(const wide of [false,true]){const {p,call,register,create}=setup(wide),h=create(register(3));let previous=3;
  for(const value of [...Array.from({length:32},(_,i)=>(2**i)>>>0),0xfffeffff,0]){
   p.setError(1234);const result=call('SetClassLong'+(wide?'A':'W'),h,-26,value);
   if(value&0x10000){assert.equal(result,0);assert.equal(p.lastError,13);}else{assert.equal(result,previous);assert.equal(p.lastError,1234);previous=value;}
   for(const suffix of ['A','W'])assert.equal(call('GetClassLong'+suffix,h,-26),previous&0x37bff);
  }
 }
});
test('Class style changes are shared by existing and future windows without changing window styles',()=>{
 const {call,register,create,events}=setup(),atom=register(3),first=create(atom),second=create(atom),eventCount=events.length;
 assert.equal(call('SetClassLongW',first,-26,8),3);assert.equal(call('GetClassLongA',second,-26),8);assert.equal(events.length,eventCount);
 const third=create(atom);assert.equal(call('GetClassLongW',third,-26),8);assert.equal(call('GetWindowLongA',first,-16),0);
 call('DestroyWindow',first);assert.equal(call('SetClassLongA',second,-26,0),8);assert.equal(call('GetClassLongW',third,-26),0);
});
test('Class registration rejects invalid style bits before consuming atoms in all A/W/Ex variants',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){
  const {p,call,register}=setup(wide,extended);
  for(let i=0;i<32;i++){const value=(2**i)>>>0,before=p.apis.gui.nextAtom;p.setError(1234);const atom=register(value);
   if(value&~0x0803feeb){assert.equal(atom,0);assert.equal(p.lastError,87);assert.equal(p.apis.gui.nextAtom,before);}else{assert.ok(atom);assert.equal(p.lastError,1234);assert.equal(call('UnregisterClassA',atom,0),1);}
  }
 }
});
test('Registration retains hidden styles and the registration-only bit for later setter returns',()=>{
 for(const style of [0x08008400,0x10000]){const {call,register,create}=setup(),h=create(register(style));assert.equal(call('GetClassLongA',h,-26),style&0x37bff);assert.equal(call('SetClassLongW',h,-26,0),style);}
});
test('Class style mutation rejects invalid and destroyed HWNDs before style validation',()=>{
 const {p,call,register,create}=setup(),h=create(register(3));for(const handle of [123,h]){if(handle===h)call('DestroyWindow',h);assert.equal(call('SetClassLongA',handle,-26,0x10000),0);assert.equal(p.lastError,1400);}
});
