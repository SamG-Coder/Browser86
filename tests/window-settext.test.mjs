import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide){
 const {p,events}=guest('HelloConsole.exe'),m=p.memory,call=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args);
 const str=(text,w=false)=>{const out=p.heap.alloc((text.length+1)*2);m.string(out,text,w,text.length+1);return out;};
 const h=call('CreateWindowExA',0,str('STATIC'),str('Original'),0,0,0,20,20,0,0,0,0);
 call('SetWindowLong'+(wide?'W':'A'),h,-4,12345);
 return {p,m,events,call,str,h};
}
test('WM_SETTEXT converts both encoding directions and preserves SendMessage results and wParam',()=>{
 for(const wide of [false,true])for(const callerWide of [false,true]){
  const {p,call,str,h}=setup(wide),text=str(callerWide?'Café Ā':'Café',callerWide),before=new Set(p.heap.blocks.keys());
  const result=call('SendMessage'+(callerWide?'W':'A'),h,12,99,text),converted=result.call.args[3];
  assert.equal(result.call.args[2],99);assert.equal(p.apis.str(converted,wide),callerWide?(wide?'Café Ā':'Café A'):'Café');
  assert.equal(converted===text,wide===callerWide);assert.equal(result.then(7),7);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('SetWindowText calls the procedure, normalizes its result and leaves rejected text unchanged',()=>{
 for(const wide of [false,true])for(const accepted of [0,7,0xffffffff]){
  const {p,call,str,h,events}=setup(wide),text=str('Café',!wide),before=new Set(p.heap.blocks.keys()),count=events.length;
  const result=call('SetWindowText'+(wide?'A':'W'),h,text);assert.deepEqual(result.call.args.slice(0,3),[h,12,0]);
  assert.equal(result.then(accepted),accepted?1:0);assert.equal(p.apis.gui.window(h).title,'Original');assert.equal(events.length,count);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
 }
});
test('Default processing applies converted text and null WM_SETTEXT pointers remain null',()=>{
 for(const wide of [false,true]){
  const {p,call,str,h}=setup(wide),result=call('SetWindowText'+(wide?'A':'W'),h,str('Café',!wide));
  const value=call('DefWindowProc'+(wide?'W':'A'),...result.call.args);assert.equal(result.then(value),1);assert.equal(p.apis.gui.window(h).title,'Café');
  const empty=call('SetWindowText'+(wide?'A':'W'),h,0);assert.equal(empty.call.args[3],0);assert.equal(empty.then(call('DefWindowProc'+(wide?'W':'A'),...empty.call.args)),1);assert.equal(p.apis.gui.window(h).title,'');
 }
});
test('Nested text callbacks and callback destruction retain and release independent conversion buffers',()=>{
 const {p,call,str,h}=setup(true),first=str('First'),second=str('Second'),before=new Set(p.heap.blocks.keys());
 const outer=call('SetWindowTextA',h,first),inner=call('SetWindowTextA',h,second),a=outer.call.args[3],b=inner.call.args[3];assert.notEqual(a,b);
 assert.equal(inner.then(1),1);assert.ok(p.heap.blocks.has(a));assert.ok(!p.heap.blocks.has(b));
 let destroy=call('DestroyWindow',h);while(destroy?.call)destroy=destroy.then(0);assert.ok(p.heap.blocks.has(a));assert.equal(outer.then(1),1);assert.deepEqual(new Set(p.heap.blocks.keys()),before);
});
test('Invalid SetWindowText handles and malformed conversion input do not allocate buffers',()=>{
 const {p,call,h}=setup(true),before=new Set(p.heap.blocks.keys());assert.equal(call('SetWindowTextA',123,0),0);assert.equal(p.lastError,1400);
 assert.throws(()=>call('SetWindowTextA',h,0x60000000));assert.deepEqual(new Set(p.heap.blocks.keys()),before);
});
