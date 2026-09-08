import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,dc:p.apis.gui.newDC(0),g:(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a),u:(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a)};}
test('FillRect and FrameRect match 72 native offscreen pixel-coverage cases',()=>{
  const {p,m,events,dc,g,u}=setup(),rect=p.heap.alloc(16),brush=g('CreateSolidBrush',255);
  const vectors=JSON.parse(fs.readFileSync(new URL('./gdi-rect-vectors.json',import.meta.url)));
  for(const v of vectors){events.length=0;v.rect.forEach((n,i)=>m.w32(rect+i*4,n));p.setError(1234);assert.equal(u(v.name,dc,rect,brush),v.result,JSON.stringify(v));assert.equal(p.lastError,v.error);
    const pixels=new Set();for(const e of events.filter(e=>e.type==='draw')){assert.equal(e.op,'fill');assert.equal(e.color,255);for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(x>=e.x&&x<e.x+e.width&&y>=e.y&&y<e.y+e.height)pixels.add(y*8+x);}
    assert.deepEqual([...pixels].sort((a,b)=>a-b),v.pixels,JSON.stringify(v));
  }
});
test('Rectangle brush drawing respects hollow brushes, selected fallback and DC colors',()=>{
  const {p,m,events,dc,g,u}=setup(),rect=p.heap.alloc(16),brush=g('CreateSolidBrush',0x123456),stock=g('GetStockObject',18);
  [1,1,4,4].forEach((n,i)=>m.w32(rect+i*4,n));g('SelectObject',dc,brush);
  for(const name of ['FillRect','FrameRect']){
    events.length=0;assert.equal(u(name,dc,rect,g('GetStockObject',5)),1);assert.equal(events.length,0);
    for(const h of [0,0xdeadbeef,g('GetStockObject',7)]){events.length=0;assert.equal(u(name,dc,rect,h),1);assert.ok(events.filter(e=>e.type==='draw').every(e=>e.color===0x123456));assert.equal(g('GetCurrentObject',dc,2),brush);}
    g('SetDCBrushColor',dc,0xabcdef);events.length=0;u(name,dc,rect,stock);assert.ok(events.filter(e=>e.type==='draw').every(e=>e.color===0xabcdef));
  }
  events.length=0;u('FillRect',dc,rect,6);assert.equal(events.at(-1).color,u('GetSysColor',5));
});
test('Rectangle brush drawing validates inputs before emitting and preserves native DC errors',()=>{
  const {p,m,events,dc,g,u}=setup(),rect=p.heap.alloc(16),brush=g('GetStockObject',0);[1,1,4,4].forEach((n,i)=>m.w32(rect+i*4,n));
  m.map(0x60000000,4096);
  for(const name of ['FillRect','FrameRect'])for(const ptr of [0,0x60000ffc]){events.length=0;assert.throws(()=>u(name,dc,ptr,brush));assert.equal(events.length,0);}
  p.setError(1234);assert.equal(u('FrameRect',0,rect,brush),0);assert.equal(p.lastError,1234);assert.equal(u('FillRect',0,rect,brush),0);assert.equal(p.lastError,6);
});
