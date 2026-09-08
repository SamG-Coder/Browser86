import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('ExtCreatePen null style returns shared NULL_PEN and ignores width and brush properties',()=>{
 const {p,m,events,call}=setup(),brush=p.heap.alloc(12),out=p.heap.alloc(16),stock=call('GetStockObject',8);[99,123,456].forEach((v,i)=>m.w32(brush+4*i,v));
 for(const style of [5,0x10005,0x12205,0x13005,0x10305]){p.setError(1234);assert.equal(call('ExtCreatePen',style,99,brush,0,0),stock);assert.equal(p.lastError,1234);}
 assert.equal(call('GetObjectType',stock),1);assert.equal(call('GetObjectW',stock,16,out),16);assert.deepEqual([0,4,8,12].map(i=>m.u32(out+i)),[5,1,0,0]);
 const dc=p.apis.gui.newDC(0);call('SelectObject',dc,stock);call('LineTo',dc,10,20);assert.equal(events.filter(e=>e.type==='draw').at(-1).pen.null,true);assert.deepEqual([p.apis.gui.dc(dc).x,p.apis.gui.dc(dc).y],[10,20]);
});
test('ExtCreatePen null style validates style-array arguments and brush storage',()=>{
 const {p,call}=setup(),brush=p.heap.alloc(12);for(const [count,styles] of [[1,0],[0,123]]){assert.equal(call('ExtCreatePen',0x10005,4,brush,count,styles),0);assert.equal(p.lastError,87);}
 assert.throws(()=>call('ExtCreatePen',0x10005,4,0,0,0));
});
test('User-style geometric pens copy dash arrays into variable-sized descriptions',()=>{
 const {p,m,call}=setup(),brush=p.heap.alloc(12),styles=p.heap.alloc(64),out=p.heap.alloc(88);
 for(const entries of [[1],[0,3],[3,0],[3,2,1],Array(16).fill(1)]){entries.forEach((v,i)=>m.w32(styles+4*i,v));const pen=call('ExtCreatePen',0x12207,4,brush,entries.length,styles),size=24+entries.length*4;assert.ok(pen);m.w32(styles,99);
  for(const name of ['GetObjectA','GetObjectW']){assert.equal(call(name,pen,0,0),size);assert.equal(call(name,pen,size-1,out),0);assert.equal(call(name,pen,size,out),size);assert.equal(m.u32(out+20),entries.length);assert.deepEqual(entries.map((_,i)=>m.u32(out+24+4*i)),entries);}
  assert.deepEqual(p.object(pen,'gdi').dash,entries);call('DeleteObject',pen);
 }
});
test('User-style geometric pens reject invalid arrays before allocating',()=>{
 const {p,m,call}=setup(),brush=p.heap.alloc(12),styles=p.heap.alloc(8);p.setError(123);assert.equal(call('ExtCreatePen',0x12207,4,brush,0,styles),0);assert.equal(p.lastError,123);
 for(const [n,ptr,first] of [[1,styles,0],[2,styles,0],[1,styles,0xffffffff],[17,styles,1],[2,0,1]]){m.w32(styles,first);assert.equal(call('ExtCreatePen',0x12207,4,brush,n,ptr),0);assert.equal(p.lastError,87);}
 m.map(0x60000000,4096);const size=p.handles.size;assert.throws(()=>call('ExtCreatePen',0x12207,4,brush,2,0x60000ffc));assert.equal(p.handles.size,size);
});
test('Extended solid pens expose x86 descriptions and all geometric caps and joins',()=>{
 const {p,m,call}=setup(),brush=p.heap.alloc(12),out=p.heap.alloc(32);m.w32(brush+4,0x123456);m.w32(brush+8,99);
 for(let cap=0;cap<3;cap++)for(let join=0;join<3;join++){
  const style=0x10000|(cap<<8)|(join<<12),pen=call('ExtCreatePen',style,4,brush,0,0);assert.ok(pen);assert.equal(call('GetObjectType',pen),11);
  for(const name of ['GetObjectA','GetObjectW']){assert.equal(call(name,pen,0,0),24);m.write(out,new Uint8Array(32).fill(204));assert.equal(call(name,pen,32,out),24);assert.deepEqual([0,4,8,12,16,20].map(i=>m.u32(out+i)),[style,4,0,0x123456,99,0]);assert.equal(m.u32(out+24),0xcccccccc);assert.equal(call(name,pen,23,out),0);}
  assert.equal(p.object(pen,'gdi').lineCap,['round','square','butt'][cap]);assert.equal(p.object(pen,'gdi').lineJoin,['round','bevel','miter'][join]);assert.equal(call('DeleteObject',pen),1);
 }
});
test('Extended pen selections resolve saved miter state without altering the object',()=>{
 const {p,m,events,call}=setup(),brush=p.heap.alloc(12),h=p.apis.gui.newDC(0),points=p.heap.alloc(24),pen=call('ExtCreatePen',0x12200,8,brush,0,0);call('SelectObject',h,pen);call('SetMiterLimit',h,0x3f800000,0);call('SaveDC',h);call('SetMiterLimit',h,0x41200000,0);call('Polyline',h,points,3);
 assert.equal(events.filter(e=>e.type==='draw').at(-1).pen.miterLimit,10);call('RestoreDC',h,-1);call('Polyline',h,points,3);assert.equal(events.filter(e=>e.type==='draw').at(-1).pen.miterLimit,1);assert.equal(p.object(pen,'gdi').miterLimit,undefined);assert.equal(call('DeleteObject',pen),0);
 call('SetMiterLimit',h,0x7f800000,0);assert.throws(()=>call('Polyline',h,points,3),e=>e.code==='UNSUPPORTED_GDI');
});
test('Extended pen validation rejects invalid combinations and validates all guest memory',()=>{
 const {p,m,call}=setup(),brush=p.heap.alloc(12);for(const [style,width,count,styles] of [[0,2,0,0],[0x13000,4,0,0],[0x10300,4,0,0],[0x10000,4,1,0],[0x10000,4,0,123]]){assert.equal(call('ExtCreatePen',style,width,brush,count,styles),0);assert.equal(p.lastError,87);}
 assert.throws(()=>call('ExtCreatePen',0x10001,4,brush,0,0),e=>e.code==='UNSUPPORTED_GDI');m.w32(brush,2);assert.throws(()=>call('ExtCreatePen',0x10000,4,brush,0,0),e=>e.code==='UNSUPPORTED_GDI');m.map(0x60000000,4096);const before=p.handles.size;assert.throws(()=>call('ExtCreatePen',0x10000,4,0x60000ffc,0,0));assert.equal(p.handles.size,before);
});
