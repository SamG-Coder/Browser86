import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,u:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),g:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('System brushes cache handles by index and expose matching solid brush descriptions',()=>{
 const {p,m,u,g}=setup(),out=p.heap.alloc(16),handles=new Set();
 for(let index=0;index<=30;index++){p.setError(1234);const brush=u('GetSysColorBrush',index);assert.ok(brush);assert.equal(p.lastError,1234);assert.equal(u('GetSysColorBrush',index),brush);assert.equal(g('GetObjectType',brush),2);handles.add(brush);
  for(const name of ['GetObjectA','GetObjectW']){m.write(out,new Uint8Array(16).fill(204));assert.equal(g(name,brush,16,out),12);assert.deepEqual([0,4,8].map(i=>m.u32(out+i)),[0,u('GetSysColor',index),0]);assert.equal(m.u32(out+12),0xcccccccc);}
  assert.equal(g('DeleteObject',brush),1);assert.equal(u('GetSysColorBrush',index),brush);assert.equal(g('GetObjectType',brush),2);
 }assert.equal(handles.size,31);
});
test('Unsupported system color indices return zero without allocating or changing last error',()=>{
 const {p,u}=setup();for(const index of [-1,31,32,65536,0x7fffffff,0x80000000,0xffffffff]){const count=p.handles.size;p.setError(1234);assert.equal(u('GetSysColor',index),0);assert.equal(u('GetSysColorBrush',index),0);assert.equal(p.lastError,1234);assert.equal(p.handles.size,count);}
});
test('System brushes remain usable while selected and saved and paint the system color',()=>{
 const {p,m,events,u,g}=setup(),dc=p.apis.gui.newDC(0),rect=p.heap.alloc(16),brush=u('GetSysColorBrush',8);[1,2,20,21].forEach((n,i)=>m.w32(rect+4*i,n));
 const old=g('SelectObject',dc,brush);g('SaveDC',dc);assert.equal(g('DeleteObject',brush),1);g('SelectObject',dc,old);g('RestoreDC',dc,-1);assert.equal(g('GetCurrentObject',dc,2),brush);
 for(const name of ['FillRect','FrameRect']){assert.equal(u(name,dc,rect,brush),1);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,u('GetSysColor',8));}
 g('SelectObject',dc,g('GetStockObject',8));g('Rectangle',dc,1,2,20,21);assert.equal(events.filter(e=>e.type==='draw').at(-1).brush.color,0);
});
