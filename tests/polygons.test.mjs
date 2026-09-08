import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,h:p.apis.gui.newDC(0),call:(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a)};}
test('PolyPolyline keeps groups disconnected and leaves current position unchanged',()=>{
  const {p,m,events,h,call}=setup(),input=p.heap.alloc(40),counts=p.heap.alloc(8),points=[[-2,3],[4,5],[20,21],[22,23],[24,25]];
  points.flat().forEach((v,i)=>m.w32(input+4*i,v));m.w32(counts,2);m.w32(counts+4,3);call('MoveToEx',h,77,88,0);call('SelectObject',h,call('GetStockObject',19));call('SetDCPenColor',h,0x123456);p.setError(1234);
  assert.equal(call('PolyPolyline',h,input,counts,2),1);assert.equal(p.lastError,1234);const draws=events.filter(e=>e.type==='draw');assert.deepEqual(draws.map(e=>e.points),[points.slice(0,2),points.slice(2)]);assert.ok(draws.every(e=>e.op==='polyline'&&e.brush===null&&e.pen.color===0x123456));
  m.w32(input,999);m.w32(counts,99);assert.equal(draws[0].points[0][0],-2);assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],[77,88]);
});
test('PolyPolyline validates every count and full point range before drawing',()=>{
  const {p,m,events,h,call}=setup(),input=p.heap.alloc(32),counts=p.heap.alloc(8);m.map(0x60000000,4096);m.w32(counts,2);
  for(const n of [0,1]){m.w32(counts+4,n);assert.equal(call('PolyPolyline',h,input,counts,2),0);assert.equal(p.lastError,87);}
  m.w32(counts+4,2);assert.throws(()=>call('PolyPolyline',h,0x60000ff0,counts,2));assert.throws(()=>call('PolyPolyline',h,input,0x60000ffc,2));
  m.w32(counts,0xffffffff);assert.throws(()=>call('PolyPolyline',h,input,counts,2),e=>e.code==='GDI_LIMIT');
  p.setError(1234);for(const args of [[h,0,0,0],[h,0,counts,1],[h,input,0,1]])assert.equal(call('PolyPolyline',...args),0);assert.equal(p.lastError,1234);assert.equal(events.filter(e=>e.type==='draw').length,0);
  assert.equal(call('PolyPolyline',0,input,counts,1),0);assert.equal(p.lastError,6);
});
test('PolylineTo connects and updates current position across drawing and saved state',()=>{
  const {p,m,events,h,call}=setup(),input=p.heap.alloc(16);[2,3,-4,5].forEach((n,i)=>m.w32(input+4*i,n));
  call('MoveToEx',h,7,8,0);call('SaveDC',h);call('SelectObject',h,call('GetStockObject',19));call('SetDCPenColor',h,0x123456);p.setError(1234);
  assert.equal(call('PolylineTo',h,input,2),1);const draw=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual(draw.points,[[7,8],[2,3],[-4,5]]);assert.equal(draw.pen.color,0x123456);assert.equal(draw.brush,null);assert.equal(p.lastError,1234);
  call('LineTo',h,10,11);const line=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual([line.x,line.y],[-4,5]);
  call('RestoreDC',h,-1);assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],[7,8]);call('SelectObject',h,call('GetStockObject',8));assert.equal(call('PolylineTo',h,input,1),1);assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],[2,3]);
});
test('PolylineTo zero count succeeds and failed inputs leave position and output intact',()=>{
  const {p,m,events,h,call}=setup();call('MoveToEx',h,7,8,0);m.map(0x60000000,4096);p.setError(1234);
  assert.equal(call('PolylineTo',h,0,0),1);assert.equal(call('PolylineTo',h,0,1),0);assert.equal(p.lastError,1234);
  assert.throws(()=>call('PolylineTo',h,0x60000ffc,1));assert.throws(()=>call('PolylineTo',h,0x60000000,0xffffffff),e=>e.code==='GDI_LIMIT');
  assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],[7,8]);assert.equal(events.filter(e=>e.type==='draw').length,0);assert.equal(call('PolylineTo',0,0,0),0);assert.equal(p.lastError,6);
});
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
