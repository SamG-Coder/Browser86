import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
const vectors=JSON.parse(fs.readFileSync(new URL('./frame-region-vectors.json',import.meta.url),'utf8'));
test('FrameRgn matches 196 native rectangle border masks and thickness return values',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),brush=call('GetStockObject',4);
 for(const v of vectors){const region=call('CreateRectRgn',...v.bounds),start=events.length;p.setError(1234);assert.equal(call('FrameRgn',dc,region,brush,v.width,v.height),v.result);assert.equal(p.lastError,v.error);
  const draws=events.slice(start).filter(e=>e.type==='draw'),pixels=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(draws.some(d=>d.op==='fill'&&d.color===0&&x>=d.x&&x<d.x+d.width&&y>=d.y&&y<d.y+d.height))pixels.push(y*8+x);assert.deepEqual(pixels,v.pixels,JSON.stringify(v));call('DeleteObject',region);
 }
});
test('FrameRgn handles invalid, hollow and empty inputs and resolves DC brush colors',()=>{
 const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(0),r=call('CreateRectRgn',1,1,7,7),empty=call('CreateRectRgn',0,0,0,0),black=call('GetStockObject',4);
 for(const brush of [0,123,call('GetStockObject',5),call('GetStockObject',17)]){p.setError(1234);assert.equal(call('FrameRgn',dc,r,brush,1,1),0);assert.equal(p.lastError,1234);assert.equal(call('FrameRgn',dc,empty,brush,1,1),brush?1:0);}
 for(const width of [0,-2147483648])assert.equal(call('FrameRgn',dc,empty,black,width,1),0);
 assert.equal(call('FrameRgn',dc,0,black,1,1),0);assert.equal(call('FrameRgn',0,r,black,1,1),0);assert.equal(p.lastError,6);
 call('SetDCBrushColor',dc,0x123456);assert.equal(call('FrameRgn',dc,r,call('GetStockObject',18),-1,2),1);assert.ok(events.filter(e=>e.type==='draw').every(d=>d.color===0x123456));
});
