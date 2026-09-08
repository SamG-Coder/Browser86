import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,h:p.apis.gui.newDC(0),call:(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a)};}
test('Polygon fill mode retains native raw values, per-DC isolation and saved state',()=>{
  const {p,h,call}=setup(),other=p.apis.gui.newDC(0);assert.equal(call('GetPolyFillMode',h),1);let previous=1;
  for(const mode of [0,1,2,3,255,-1]){p.setError(1234);assert.equal(call('SetPolyFillMode',h,mode),previous);assert.equal(call('GetPolyFillMode',h),mode);assert.equal(p.lastError,1234);previous=mode;}
  call('SaveDC',h);call('SetPolyFillMode',h,2);call('RestoreDC',h,-1);assert.equal(call('GetPolyFillMode',h),-1);assert.equal(call('GetPolyFillMode',other),1);
  p.setError(1234);assert.equal(call('GetPolyFillMode',0),0);assert.equal(p.lastError,1234);assert.equal(call('SetPolyFillMode',0,1),0);assert.equal(p.lastError,6);
});
test('Polygon and polyline copy signed points and selected colors without changing current position',()=>{
  const {p,m,events,h,call}=setup(),input=p.heap.alloc(24),points=[[-2,3],[9,-4],[20,21]];points.flat().forEach((n,i)=>m.w32(input+4*i,n));call('MoveToEx',h,77,88,0);
  call('SelectObject',h,call('GetStockObject',19));call('SelectObject',h,call('GetStockObject',18));call('SetDCPenColor',h,0x123456);call('SetDCBrushColor',h,0xabcdef);call('SetPolyFillMode',h,2);
  for(const name of ['Polygon','Polyline']){assert.equal(call(name,h,input,3),1);const draw=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual(draw.points,points);assert.equal(draw.op,name.toLowerCase());assert.equal(draw.pen.color,0x123456);assert.equal(draw.fillMode,2);assert.equal(draw.brush?.color,name==='Polygon'?0xabcdef:undefined);}
  m.w32(input,999);assert.equal(events.filter(e=>e.type==='draw').at(-1).points[0][0],-2);const dc=p.apis.gui.dc(h);assert.deepEqual([dc.x,dc.y],[77,88]);
});
test('Polygon inputs fail atomically with native count and handle results',()=>{
  const {p,m,events,h,call}=setup(),input=p.heap.alloc(24);m.map(0x60000000,4096);
  for(const name of ['Polygon','Polyline']){
    for(const n of [0,1]){assert.equal(call(name,h,input,n),0);assert.equal(p.lastError,87);}
    p.setError(1234);assert.equal(call(name,h,0,3),0);assert.equal(call(name,h,input,-1),0);assert.equal(p.lastError,1234);
    assert.equal(call(name,0,input,3),0);assert.equal(p.lastError,6);assert.throws(()=>call(name,h,0x60000ffc,3));assert.throws(()=>call(name,h,input,1048577),e=>e.code==='GDI_LIMIT');assert.equal(events.filter(e=>e.type==='draw').length,0);
    assert.equal(call(name,h,input,2),1);events.length=0;
  }
});
