import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,dc:p.apis.gui.newDC(0),call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('Region fills use explicit and selected brushes without changing selections or current position',()=>{
 const {p,events,dc,call}=setup(),r=call('CreateRectRgn',10,20,1,2),red=call('CreateSolidBrush',255),black=call('GetStockObject',4);
 call('SelectObject',dc,red);call('MoveToEx',dc,7,8,0);p.setError(1234);assert.equal(call('FillRgn',dc,r,black),1);assert.equal(p.lastError,1234);
 let d=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual([d.op,d.x,d.y,d.width,d.height,d.color],['fill',1,2,9,18,0]);assert.equal(call('GetCurrentObject',dc,2),red);
 assert.equal(call('PaintRgn',dc,r),1);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,255);assert.deepEqual([p.apis.gui.dc(dc).x,p.apis.gui.dc(dc).y],[7,8]);
 call('OffsetRgn',r,2,-1);call('PaintRgn',dc,r);d=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual([d.x,d.y],[3,1]);
 call('SelectObject',dc,call('GetStockObject',18));call('SetDCBrushColor',dc,0x123456);call('PaintRgn',dc,r);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,0x123456);
 call('SetDCPenColor',dc,0xabcdef);assert.equal(call('FillRgn',dc,r,call('GetStockObject',19)),1);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,0xabcdef);
});
test('Region painting preserves native invalid, hollow and empty-region return behavior',()=>{
 const {p,events,dc,call}=setup(),r=call('CreateRectRgn',1,1,7,7),empty=call('CreateRectRgn',0,0,0,0),black=call('GetStockObject',4),hollow=call('GetStockObject',5);
 for(const brush of [0,123,hollow,call('GetStockObject',8),call('GetStockObject',17)]){p.setError(1234);assert.equal(call('FillRgn',dc,r,brush),0);assert.equal(p.lastError,1234);assert.equal(call('FillRgn',dc,empty,brush),brush?1:0);}
 call('SelectObject',dc,hollow);assert.equal(call('PaintRgn',dc,r),0);assert.equal(call('PaintRgn',dc,empty),1);
 for(const region of [0,black]){p.setError(1234);assert.equal(call('FillRgn',dc,region,black),0);assert.equal(call('PaintRgn',dc,region),0);assert.equal(p.lastError,1234);}
 p.setError(1234);assert.equal(call('FillRgn',0,r,0),0);assert.equal(p.lastError,1234);assert.equal(call('FillRgn',0,r,black),0);assert.equal(p.lastError,6);assert.equal(call('PaintRgn',0,0),0);assert.equal(p.lastError,6);assert.equal(events.filter(e=>e.type==='draw').length,0);
});
