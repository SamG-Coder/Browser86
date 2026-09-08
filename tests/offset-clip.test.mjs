import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('OffsetClipRgn moves copied clips while preserving saved states, sources and draw snapshots',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),r=call('CreateRectRgn',1,2,7,8),out=call('CreateRectRgn',0,0,0,0);
 call('SelectClipRgn',dc,r);call('SaveDC',dc);call('LineTo',dc,8,8);const prior=events.at(-1);p.setError(1234);assert.equal(call('OffsetClipRgn',dc,2,-1),2);assert.equal(p.lastError,1234);call('GetClipRgn',dc,out);assert.deepEqual(p.object(out,'gdi').rect,[3,1,9,7]);assert.deepEqual(p.object(r,'gdi').rect,[1,2,7,8]);assert.deepEqual(prior.clip,[[1,2,7,8]]);
 call('LineTo',dc,9,9);assert.deepEqual(events.at(-1).clip,[[3,1,9,7]]);call('RestoreDC',dc,-1);call('GetClipRgn',dc,out);assert.deepEqual(p.object(out,'gdi').rect,[1,2,7,8]);
});
test('OffsetClipRgn preserves absent and empty clips and rejects range failures atomically',()=>{
 const {p}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),empty=call('CreateRectRgn',0,0,0,0),r=call('CreateRectRgn',1,2,7,8);
 for(const x of [0,2,134217727,2147483647,-2147483648]){call('SelectClipRgn',dc,0);p.setError(1234);assert.equal(call('OffsetClipRgn',dc,x,1),2);assert.equal(call('GetClipRgn',dc,empty),0);assert.equal(p.lastError,1234);call('SelectClipRgn',dc,empty);assert.equal(call('OffsetClipRgn',dc,x,1),1);assert.equal(p.lastError,1234);}
 call('SelectClipRgn',dc,r);for(const [x,y] of [[134217727,1],[2147483647,0],[-2147483648,0],[0,134217727]]){assert.equal(call('OffsetClipRgn',dc,x,y),0);assert.equal(p.lastError,1003);assert.deepEqual(p.apis.gui.dc(dc).clipRegion.rect,[1,2,7,8]);}
 assert.equal(call('OffsetClipRgn',0,1,2),0);assert.equal(p.lastError,6);
});
