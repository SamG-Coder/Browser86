import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide=false,extended=false,identifier){
 const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args);
 const name=p.heap.alloc(64),menu=p.heap.alloc(64),cls=p.heap.alloc(48,true),o=extended?4:0;
 m.string(name,'MenuClass',wide,32);m.string(menu,wide?'Café Ā':'Café',wide,32);
 if(extended)m.w32(cls,48);m.w32(cls+o+32,identifier??menu);m.w32(cls+o+36,name);
 const register=()=>call('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls);
 const create=atom=>call('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);
 return {p,m,call,menu,cls,o,register,create};
}
test('Class menu strings are copied at registration and converted for both query encodings',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){
  const {p,m,call,menu,register,create}=setup(wide,extended),atom=register();m.fill(menu,64,0);p.heap.free(menu);const h=create(atom);
  for(const suffix of ['A','W']){p.setError(1234);const ptr=call('GetClassLong'+suffix,h,-8);assert.equal(p.apis.str(ptr,suffix==='W'),wide?(suffix==='W'?'Café Ā':'Café A'):'Café');assert.equal(p.lastError,1234);}
 }
});
test('Menu buffers are stable and shared across windows, retained after failed unregistration and freed on success',()=>{
 const {p,call,register,create}=setup(true,true),atom=register(),h=create(atom),second=create(atom);
 const a=call('GetClassLongA',h,-8),w=call('GetClassLongW',h,-8);assert.notEqual(a,w);
 const blocks=p.heap.blocks.size;
 for(let i=0;i<10;i++){assert.equal(call('GetClassLongA',second,-8),a);assert.equal(call('GetClassLongW',second,-8),w);}assert.equal(p.heap.blocks.size,blocks);
 assert.equal(call('UnregisterClassA',atom,0),0);assert.equal(p.lastError,1412);assert.ok(p.heap.blocks.has(a));assert.ok(p.heap.blocks.has(w));
 call('DestroyWindow',h);call('DestroyWindow',second);assert.ok(p.heap.blocks.has(a));
 p.setError(1234);assert.equal(call('UnregisterClassW',atom,0),1);assert.equal(p.lastError,1234);assert.ok(!p.heap.blocks.has(a));assert.ok(!p.heap.blocks.has(w));
});
test('Null and integer class menus do not allocate string buffers',()=>{
 for(const id of [0,1,65535]){const {p,call,register,create}=setup(false,false,id),h=create(register()),blocks=p.heap.blocks.size;for(const suffix of ['A','W'])assert.equal(call('GetClassLong'+suffix,h,-8),id);assert.equal(p.heap.blocks.size,blocks);}
});
test('Unreadable registration menu strings fault without consuming a class atom',()=>{
 const {p,m,cls,o,register}=setup();m.w32(cls+o+32,0x60000000);const atom=p.apis.gui.nextAtom;
 assert.throws(register);assert.equal(p.apis.gui.nextAtom,atom);assert.equal(p.apis.gui.classes.size,0);
});
