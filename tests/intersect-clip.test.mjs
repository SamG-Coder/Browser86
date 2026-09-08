import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('IntersectClipRect creates, narrows and restores copied application clips',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),out=call('CreateRectRgn',0,0,0,0);
 assert.equal(call('IntersectClipRect',dc,8,9,-2,-3),2);call('GetClipRgn',dc,out);assert.deepEqual(p.object(out,'gdi').rect,[-2,-3,8,9]);call('SaveDC',dc);
 assert.equal(call('IntersectClipRect',dc,2,3,12,13),2);call('LineTo',dc,20,20);assert.deepEqual(events.at(-1).clip,[[2,3,8,9]]);
 assert.equal(call('IntersectClipRect',dc,8,9,20,20),1);assert.equal(call('PtVisible',dc,5,5),0);assert.equal(call('IntersectClipRect',dc,0,0,20,20),1);
 call('RestoreDC',dc,-1);call('GetClipRgn',dc,out);assert.deepEqual(p.object(out,'gdi').rect,[-2,-3,8,9]);
});
test('IntersectClipRect rejects invalid inputs atomically and preserves success last error',()=>{
 const {p}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0);p.setError(1234);assert.equal(call('IntersectClipRect',dc,1,2,7,8),2);assert.equal(p.lastError,1234);
 for(const x of [-134217729,134217728,-2147483648,2147483647]){assert.equal(call('IntersectClipRect',dc,x,0,5,5),0);assert.equal(p.lastError,87);assert.deepEqual(p.apis.gui.dc(dc).clipRegion.rect,[1,2,7,8]);}
 assert.equal(call('IntersectClipRect',0,1,2,3,4),0);assert.equal(p.lastError,6);assert.equal(call('IntersectClipRect',dc,1,2,1,8),1);
});
