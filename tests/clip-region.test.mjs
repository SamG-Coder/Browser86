import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,dc:p.apis.gui.newDC(0),call:(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a)};}
test('Clip regions are copied independently of source, destination and emitted commands',()=>{
 const {p,events,dc,call}=setup(),r=call('CreateRectRgn',1,2,7,8),out=call('CreateRectRgn',9,9,10,10);
 assert.equal(call('GetClipRgn',dc,out),0);assert.deepEqual(p.object(out,'gdi').rect,[9,9,10,10]);p.setError(1234);assert.equal(call('SelectClipRgn',dc,r),2);assert.equal(p.lastError,1234);
 call('SetRectRgn',r,2,3,9,10);call('DeleteObject',r);assert.equal(call('GetClipRgn',dc,out),1);assert.deepEqual(p.object(out,'gdi').rect,[1,2,7,8]);call('SetRectRgn',out,0,0,1,1);
 call('LineTo',dc,20,20);const command=events.at(-1);assert.deepEqual(command.clip,[[1,2,7,8]]);call('SelectClipRgn',dc,out);assert.deepEqual(command.clip,[[1,2,7,8]]);
});
test('Clip regions preserve none versus empty across nested saved states and independent DCs',()=>{
 const {p,events,dc,call}=setup(),r=call('CreateRectRgn',1,1,7,7),empty=call('CreateRectRgn',0,0,0,0),out=call('CreateRectRgn',0,0,0,0),other=p.apis.gui.newDC(0);
 call('SaveDC',dc);call('SelectObject',dc,r);call('SaveDC',dc);assert.equal(call('SelectClipRgn',dc,empty),1);call('LineTo',dc,8,8);assert.deepEqual(events.at(-1).clip,[]);assert.equal(call('GetClipRgn',dc,out),1);assert.equal(p.object(out,'gdi').rect,null);
 call('RestoreDC',dc,-1);call('GetClipRgn',dc,out);assert.deepEqual(p.object(out,'gdi').rect,[1,1,7,7]);call('RestoreDC',dc,-1);assert.equal(call('GetClipRgn',dc,out),0);assert.equal(call('GetClipRgn',other,out),0);
 call('SelectClipRgn',dc,r);assert.equal(call('SelectClipRgn',dc,0),2);call('LineTo',dc,9,9);assert.equal(events.at(-1).clip,undefined);
});
test('Clip API errors preserve selection and native output error distinctions',()=>{
 const {p,dc,call}=setup(),r=call('CreateRectRgn',1,1,7,7),wrong=call('GetStockObject',4);call('SelectClipRgn',dc,r);
 for(const bad of [123,wrong]){p.setError(1234);assert.equal(call('SelectClipRgn',dc,bad),0);assert.equal(p.lastError,1234);assert.equal(call('GetClipRgn',dc,bad),-1);assert.equal(p.lastError,1234);}assert.deepEqual(p.apis.gui.dc(dc).clipRegion.rect,[1,1,7,7]);
 assert.equal(call('GetClipRgn',dc,0),-1);assert.equal(call('SelectClipRgn',0,r),0);assert.equal(p.lastError,6);assert.equal(call('GetClipRgn',0,r),-1);assert.equal(p.lastError,87);assert.equal(call('GetClipRgn',0,0),-1);assert.equal(p.lastError,6);
 const off=call('CreateRectRgn',-9,-9,-1,-1);assert.equal(call('SelectClipRgn',dc,off),1);assert.equal(call('GetClipRgn',dc,r),1);assert.deepEqual(p.object(r,'gdi').rect,[-9,-9,-1,-1]);
});
