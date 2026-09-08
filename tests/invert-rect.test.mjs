import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('InvertRect normalizes reversed bounds, skips zero area and snapshots input without DC mutation',()=>{
 const {p,events}=guest('HelloConsole.exe'),m=p.memory,dc=p.apis.gui.newDC(0),out=p.heap.alloc(16),call=(...a)=>p.apis.lookup('user32.dll','InvertRect').fn(...a),before={...p.apis.gui.dc(dc)};
 for(const bounds of [[1,2,7,8],[7,8,1,2],[7,2,1,8],[1,8,7,2]]){bounds.forEach((n,i)=>m.w32(out+4*i,n));p.setError(1234);assert.equal(call(dc,out),1);assert.equal(p.lastError,1234);const d=events.at(-1);assert.deepEqual([d.op,d.x,d.y,d.width,d.height],['invert',1,2,6,6]);m.w32(out,99);assert.equal(d.x,1);}
 const length=events.length;for(const bounds of [[1,2,1,8],[1,2,7,2]]){bounds.forEach((n,i)=>m.w32(out+4*i,n));assert.equal(call(dc,out),1);}assert.equal(events.length,length);assert.deepEqual(p.apis.gui.dc(dc),before);
});
test('InvertRect validates its complete rectangle before checking the DC',()=>{
 const {p,events}=guest('HelloConsole.exe'),m=p.memory,dc=p.apis.gui.newDC(0),out=p.heap.alloc(16),call=(...a)=>p.apis.lookup('user32.dll','InvertRect').fn(...a);m.map(0x60000000,4096);const edge=0x60000ffc;
 for(const h of [0,123,dc])for(const ptr of [0,edge])assert.throws(()=>call(h,ptr));
 for(const h of [0,123,p.apis.lookup('gdi32.dll','GetStockObject').fn(4)]){assert.equal(call(h,out),0);assert.equal(p.lastError,6);}assert.equal(events.filter(e=>e.type==='draw').length,0);
});
