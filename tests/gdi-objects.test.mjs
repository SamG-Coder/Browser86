import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe');return {p,m:p.memory,call:(name,...args)=>p.apis.lookup('gdi32.dll',name).fn(...args)};}
test('Indirect GDI creation copies structures and supports selection, drawing and inspection',()=>{
  const {p,m,call}=setup(),input=p.heap.alloc(16),out=p.heap.alloc(16),dc=p.apis.gui.newDC(0),draws=[];p.emit=(type,data)=>{if(type==='draw')draws.push(data);};
  [0,-3,99,0x123456].forEach((v,i)=>m.w32(input+4*i,v));const pen=call('CreatePenIndirect',input);
  [0,0xabcdef,99].forEach((v,i)=>m.w32(input+4*i,v));const brush=call('CreateBrushIndirect',input);m.write(input,new Uint8Array(16));
  call('SelectObject',dc,pen);call('SelectObject',dc,brush);call('Rectangle',dc,1,2,20,30);
  assert.equal(draws.at(-1).pen.color,0x123456);assert.equal(draws.at(-1).pen.width,3);assert.equal(draws.at(-1).brush.color,0xabcdef);
  assert.equal(call('GetObjectW',pen,16,out),16);assert.deepEqual([0,4,8,12].map(i=>m.u32(out+i)),[0,3,0,0x123456]);
  assert.equal(call('GetObjectA',brush,12,out),12);assert.deepEqual([0,4,8].map(i=>m.u32(out+i)),[0,0xabcdef,0]);
  m.w32(input,1);m.w32(input+4,123);const hollow=call('CreateBrushIndirect',input);call('SelectObject',dc,hollow);call('Rectangle',dc,1,2,20,30);assert.equal(draws.at(-1).brush.null,true);
  assert.equal(call('DeleteObject',brush),1);
});
test('Indirect GDI creation validates complete readable structures before allocating',()=>{
  const {p,m,call}=setup();m.map(0x60000000,4096);const edge=0x60000ffc,input=p.heap.alloc(16);
  for(const name of ['CreatePenIndirect','CreateBrushIndirect'])for(const ptr of [0,edge]){const before=p.handles.size;assert.throws(()=>call(name,ptr));assert.equal(p.handles.size,before);}
  p.setError(123);m.w32(input,99);assert.equal(call('CreateBrushIndirect',input),0);assert.equal(p.lastError,123);
  m.w32(input,2);assert.throws(()=>call('CreateBrushIndirect',input),e=>e.code==='UNSUPPORTED_GDI');
  m.w32(input,1);assert.throws(()=>call('CreatePenIndirect',input),e=>e.code==='UNSUPPORTED_GDI');
  m.w32(input,5);m.w32(input+4,8);m.w32(input+12,123);const pen=call('CreatePenIndirect',input);call('GetObjectW',pen,16,input);assert.deepEqual([0,4,8,12].map(i=>m.u32(input+i)),[5,1,0,0]);
  for(const style of [7,99,256,65536,0xffffffff]){const pen=call('CreatePen',style,1,0);call('GetObjectW',pen,16,input);assert.equal(m.u32(input),0);}
});
test('GetObject A/W reports logical pen widths, null pens and x86 brush layouts',()=>{
  const {p,m,call}=setup(),out=p.heap.alloc(32);
  for(const name of ['GetObjectA','GetObjectW']){
    for(const [style,width,expected] of [[0,0,0],[0,-5,5],[0,7,7],[5,8,1]]){
      const pen=call('CreatePen',style,width,0x123456);assert.equal(call(name,pen,0,0),16);p.setError(123);
      assert.equal(call(name,pen,-1,out),16);assert.deepEqual([0,4,8,12].map(i=>m.u32(out+i)),[style,expected,0,style===5?0:0x123456]);assert.equal(p.lastError,123);
      assert.equal(call('DeleteObject',pen),1);
    }
    for(const [brush,style,color] of [[call('CreateSolidBrush',0xabcdef),0,0xabcdef],[call('GetStockObject',5),1,0]]){
      assert.equal(call(name,brush,0,0),12);assert.equal(call(name,brush,32,out),12);assert.deepEqual([0,4,8].map(i=>m.u32(out+i)),[style,color,0]);
    }
  }
});
test('GetObject enforces alignment and pen capacity, and bounds short brush writes',()=>{
  const {p,m,call}=setup(),out=p.heap.alloc(32),pen=call('CreatePen',0,1,1),brush=call('CreateSolidBrush',0x123456);
  for(const name of ['GetObjectA','GetObjectW']){
    for(const count of [0,1,8,15]){m.write(out,new Uint8Array(32).fill(204));assert.equal(call(name,pen,count,out),0);assert.equal(m.u32(out),0xcccccccc);}
    for(const h of [pen,brush])assert.equal(call(name,h,32,out+1),0);
    for(const count of [1,3,8,11,12,20]){m.write(out,new Uint8Array(32).fill(204));assert.equal(call(name,brush,count,out),12);assert.equal(m.u8(out+Math.min(count,12)),204);}
    assert.equal(call(name,0,32,out),0);assert.equal(call(name,p.apis.gui.newDC(0),32,out),0);
    assert.throws(()=>call(name,call('GetStockObject',17),0,0),e=>e.code==='UNSUPPORTED_GDI');
  }
});
test('GetObject validates the actual write range before changing guest memory',()=>{
  const {p,m,call}=setup(),brush=call('CreateSolidBrush',0x123456),pen=call('CreatePen',0,1,0);
  m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);
  assert.throws(()=>call('GetObjectW',pen,16,edge));assert.equal(m.u32(edge),0xcccccccc);
  assert.throws(()=>call('GetObjectA',brush,12,edge));assert.equal(m.u32(edge),0xcccccccc);
  assert.equal(call('GetObjectA',brush,4,edge),12);assert.equal(m.u32(edge),0);
});
