import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){
 const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args);
 const name=p.heap.alloc(16);m.string(name,'STATIC',false,16);const h=call('CreateWindowExA',0,name,0,0,0,0,20,20,0,0,0,0);call('SetWindowLong'+(wide?'W':'A'),h,-4,12345);
 return {p,m,call,h};
}
test('Cross-encoding WM_GETTEXT matches native capacities, counts and truncated bytes',()=>{
 for(const wide of [false,true])for(const capacity of [0,1,2,4,16]){
  const {p,m,call,h}=setup(wide),out=p.heap.alloc(64);m.fill(out,64,0x58);const before=new Set(p.heap.blocks.keys());
  const result=call('SendMessage'+(wide?'A':'W'),h,13,capacity,out),procCapacity=capacity*(wide?1:2),buffer=result.call.args[3];assert.equal(result.call.args[2],procCapacity);assert.notEqual(buffer,out);
  const text=wide?'Café Ā':'Café',count=Math.min(text.length,Math.max(0,procCapacity-1));if(procCapacity)m.string(buffer,text,wide,procCapacity);
  assert.equal(result.then(count),count);const converted=wide?'Café A':'Café',units=Math.min(capacity,count+1),unitSize=wide?1:2;
  for(let i=0;i<units;i++){const expected=i<count?converted.charCodeAt(i):0;assert.equal(wide?m.u8(out+i):m.u16(out+i*2),expected);}
  for(let i=units*unitSize;i<64;i++)assert.equal(m.u8(out+i),0x58);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('Same-encoding WM_GETTEXT preserves direct callback arguments and result',()=>{
 for(const wide of [false,true]){const {p,call,h}=setup(wide),out=p.heap.alloc(32),before=new Set(p.heap.blocks.keys()),result=call('SendMessage'+(wide?'W':'A'),h,13,8,out);assert.deepEqual(result.call.args,[h,13,8,out]);assert.equal(result.then(7),7);assert.deepEqual(new Set(p.heap.blocks.keys()),before);}
});
test('WM_GETTEXT validates output and bounded callback counts without leaking temporary buffers',()=>{
 const {p,m,call,h}=setup(true);m.map(0x60000000,4096);m.w8(0x60000fff,0x58);const before=new Set(p.heap.blocks.keys());
 assert.throws(()=>call('SendMessageA',h,13,2,0x60000fff));assert.equal(m.u8(0x60000fff),0x58);assert.throws(()=>call('SendMessageA',h,13,1048577,0x60000000));assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 const out=p.heap.alloc(16);m.fill(out,16,0x58);const allocated=new Set(p.heap.blocks.keys()),result=call('SendMessageA',h,13,16,out);assert.throws(()=>result.then(16),/count outside/);assert.equal(m.u8(out),0x58);assert.deepEqual(new Set(p.heap.blocks.keys()),allocated);
});
test('Nested WM_GETTEXT callbacks keep independent buffers through window destruction',()=>{
 const {p,m,call,h}=setup(false),out=p.heap.alloc(32),out2=p.heap.alloc(32),before=new Set(p.heap.blocks.keys());
 const outer=call('SendMessageW',h,13,16,out),inner=call('SendMessageW',h,13,16,out2);m.string(outer.call.args[3],'Outer',false,32);m.string(inner.call.args[3],'Inner',false,32);assert.equal(inner.then(5),5);
 let destroy=call('DestroyWindow',h);while(destroy?.call)destroy=destroy.then(0);assert.equal(outer.then(5),5);assert.equal(p.apis.str(out,true),'Outer');assert.equal(p.apis.str(out2,true),'Inner');assert.deepEqual(new Set(p.heap.blocks.keys()),before);
});
