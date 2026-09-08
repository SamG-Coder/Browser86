import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('InvertRgn snapshots normalized bounds without changing DC state or consulting the brush',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),r=call('CreateRectRgn',7,7,1,1);
 call('SelectObject',dc,call('GetStockObject',5));call('MoveToEx',dc,11,12,0);const before={...p.apis.gui.dc(dc)};p.setError(1234);assert.equal(call('InvertRgn',dc,r),1);assert.equal(p.lastError,1234);
 const d=events.filter(e=>e.type==='draw').at(-1);assert.deepEqual([d.op,d.x,d.y,d.width,d.height],['invert',1,1,6,6]);assert.deepEqual(p.apis.gui.dc(dc),before);
 call('OffsetRgn',r,2,3);assert.deepEqual([d.x,d.y],[1,1]);call('InvertRgn',dc,r);assert.deepEqual([events.at(-1).x,events.at(-1).y],[3,4]);
});
test('InvertRgn validates region before DC and skips empty regions without emitting draws',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),empty=call('CreateRectRgn',0,0,0,0);
 for(const bad of [0,123,call('GetStockObject',4)])for(const h of [0,dc]){p.setError(1234);assert.equal(call('InvertRgn',h,bad),0);assert.equal(p.lastError,1234);}
 assert.equal(call('InvertRgn',0,empty),0);assert.equal(p.lastError,6);assert.equal(call('InvertRgn',dc,empty),1);assert.equal(events.filter(e=>e.type==='draw').length,0);
});
