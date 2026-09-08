import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){
 const {p}=guest('HelloConsole.exe'),m=p.memory,call=(n,...args)=>p.apis.lookup('user32.dll',n).fn(...args);
 const str=(text,w)=>{const out=p.heap.alloc((text.length+1)*2);m.string(out,text,w,text.length+1);return out;};
 const cls=p.heap.alloc(40,true);m.w32(cls+4,12345);m.w32(cls+36,str('CaféClass',wide));
 const atom=call('RegisterClass'+(wide?'W':'A'),cls);
 return {p,m,call,str,atom,create:(name,title)=>call('CreateWindowEx'+(wide?'A':'W'),0,name,title,0x80000000,0,0,20,20,0,0,0,0)};
}
test('Cross-encoding CREATESTRUCT strings match the procedure encoding in both creation callbacks',()=>{
 for(const wide of [false,true]){
  const {p,m,str,create}=setup(wide),name=str('CaféClass',!wide),title=str(wide?'Café':'Café Ā',!wide),before=new Set(p.heap.blocks.keys());
  let result=create(name,title),saved;
  for(const msg of [129,1]){
   assert.equal(result.call.args[1],msg);const cs=result.call.args[3];
   assert.equal(p.apis.str(m.u32(cs+36),wide),wide?'Café':'Café A');assert.equal(p.apis.str(m.u32(cs+40),wide),'CaféClass');
   assert.notEqual(m.u32(cs+36),title);assert.notEqual(m.u32(cs+40),name);
   if(saved)assert.deepEqual([cs,m.u32(cs+36),m.u32(cs+40)],saved);else saved=[cs,m.u32(cs+36),m.u32(cs+40)];
   for(const pointer of saved)assert.ok(p.heap.blocks.has(pointer));result=result.then(msg===129?1:0);
  }
  assert.ok(result);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
  assert.equal(p.apis.str(title,!wide),wide?'Café':'Café Ā');
 }
});
test('Cross-encoding creation preserves class atoms and null title pointers',()=>{
 for(const wide of [false,true]){const {m,atom,create}=setup(wide);let result=create(atom,0);for(const msg of [129,1]){const cs=result.call.args[3];assert.equal(m.u32(cs+36),0);assert.equal(m.u32(cs+40),atom);result=result.then(msg===129?1:0);}assert.ok(result);}
});
test('Converted creation buffers are freed after rejection and callback self-destruction',()=>{
 for(const wide of [false,true])for(const stage of [129,1])for(const selfDestroy of [false,true]){
  const {p,m,str,create,call}=setup(wide),name=str('CaféClass',!wide),title=str('Café',!wide),before=new Set(p.heap.blocks.keys());let result=create(name,title);
  if(stage===1)result=result.then(1);const hwnd=result.call.args[0],cs=result.call.args[3],buffers=[cs,m.u32(cs+36),m.u32(cs+40)];
  if(selfDestroy){let destroyed=call('DestroyWindow',hwnd);while(destroyed?.call)destroyed=destroyed.then(0);}
  result=result.then(stage===129?0:0xffffffff);
  while(result?.call){for(const ptr of buffers)assert.ok(p.heap.blocks.has(ptr));result=result.then(0);}
  assert.equal(result,0);assert.equal(call('IsWindow',hwnd),0);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('Invalid cross-encoding class or parent fails before allocating creation buffers',()=>{
 const {p,str,create,call}=setup(true),name=str('Missing',false);const before=new Set(p.heap.blocks.keys());assert.equal(create(name,0),0);assert.equal(p.lastError,1407);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 const valid=str('CaféClass',false),allocated=new Set(p.heap.blocks.keys());assert.equal(call('CreateWindowExA',0,valid,0,0,0,0,20,20,123,0,0,0),0);assert.equal(p.lastError,1400);assert.deepEqual(new Set(p.heap.blocks.keys()),allocated);
});
