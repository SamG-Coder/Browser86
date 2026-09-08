import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
const vectors=JSON.parse(fs.readFileSync(new URL('./wide-pen-vectors.json',import.meta.url),'utf8'));
test('Wide built-in dash pens preserve native LOGPEN styles and realize solid strokes',()=>{
 const {p,events}=guest('HelloConsole.exe'),m=p.memory,call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),input=p.heap.alloc(16),out=p.heap.alloc(20),dc=p.apis.gui.newDC(0);
 for(const v of vectors)for(const indirect of [false,true]){
  [v.style,v.width,99,0x123456].forEach((n,i)=>m.w32(input+4*i,n));p.setError(1234);
  const pen=indirect?call('CreatePenIndirect',input):call('CreatePen',v.style,v.width,0x123456);assert.ok(pen);assert.equal(p.lastError,v.error);m.w32(input,99);
  assert.equal(call('GetObjectType',pen),1);
  for(const name of ['GetObjectA','GetObjectW']){m.write(out,new Uint8Array(20).fill(204));assert.equal(call(name,pen,15,out),0);assert.equal(call(name,pen,20,out),v.size);assert.deepEqual([0,4,8,12].map(i=>m.u32(out+i)),v.description);assert.equal(m.u32(out+16),0xcccccccc);}
  const previous=call('SelectObject',dc,pen);call('MoveToEx',dc,3,8,0);call('LineTo',dc,29,8);
  const draw=events.filter(e=>e.type==='draw').at(-1);assert.equal(draw.pen.width,Math.abs(v.width));assert.equal(draw.pen.style,v.style);assert.equal(draw.pen.dash,undefined);assert.ok(v.pixels.every(n=>n===draw.pen.color));
  call('SelectObject',dc,previous);assert.equal(call('DeleteObject',pen),1);
 }
});
test('Thin built-in dash and inside-frame styles remain explicit unsupported operations',()=>{
 const {p}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a);
 for(const style of [1,2,3,4])for(const width of [-1,0,1]){const before=p.handles.size;assert.throws(()=>call('CreatePen',style,width,0),e=>e.code==='UNSUPPORTED_GDI');assert.equal(p.handles.size,before);}
 assert.throws(()=>call('CreatePen',6,3,0),e=>e.code==='UNSUPPORTED_GDI');
});
