import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe'),h=p.apis.gui.newDC(0),input=p.heap.alloc(48),types=p.heap.alloc(6);[1,2,3,4,5,6,7,8,9,10,11,12].forEach((v,i)=>p.memory.w32(input+4*i,v));return {p,events,h,input,types,call:(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a)};}
test('PolyDraw native point types and final positions include closure endpoint behavior',()=>{
 const {p,events,h,input,types,call}=setup();
 for(const [flags,ok,end] of [[[],1,[77,88]],[[6],1,[1,2]],[[2],1,[1,2]],[[3],1,[1,2]],[[6,2,3],1,[5,6]],[[4,4,4],1,[5,6]],[[4,4,5],1,[5,6]],[[6,4,4,5],1,[7,8]],[[4],0,[77,88]],[[4,2,4],0,[77,88]],[[7],0,[77,88]],[[0],0,[77,88]],[[2,0],0,[77,88]]]){
  events.length=0;p.memory.write(types,Uint8Array.from(flags));call('MoveToEx',h,77,88,0);p.setError(123);assert.equal(call('PolyDraw',h,input,types,flags.length),ok);assert.equal(p.lastError,ok?123:87);assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],end);if(!ok)assert.equal(events.filter(e=>e.type==='draw').length,0);
 }
});
test('PolyDraw combines moves, lines, curves and closure into an unfilled path',()=>{
 const {p,events,h,input,types,call}=setup();p.memory.write(types,Uint8Array.from([6,2,4,4,5,2]));call('SelectObject',h,call('GetStockObject',19));call('SetDCPenColor',h,0x123456);assert.equal(call('PolyDraw',h,input,types,6),1);
 const draw=events.filter(e=>e.type==='draw').at(-1);assert.equal(draw.op,'polydraw');assert.equal(draw.pen.color,0x123456);assert.equal(draw.brush,undefined);assert.deepEqual(draw.ops.map(x=>x.kind),['move','move','line','bezier','close','move','line']);assert.deepEqual(draw.ops[3].points,[[5,6],[7,8],[9,10]]);assert.deepEqual(draw.ops[5].points,[[9,10]]);
 p.memory.w32(input+16,999);assert.equal(draw.ops[3].points[0][0],5);
});
test('PolyDraw validates both arrays before emitting or changing state',()=>{
 const {p,events,h,input,types,call}=setup();p.memory.write(types,Uint8Array.from([2,2]));p.memory.map(0x60000000,4096);call('MoveToEx',h,77,88,0);p.setError(123);
 for(const args of [[h,0,types,1],[h,input,0,1],[h,input,types,-1],[h,0,0,0]])assert.equal(call('PolyDraw',...args),0);assert.equal(p.lastError,123);
 assert.throws(()=>call('PolyDraw',h,0x60000ffc,types,2));assert.throws(()=>call('PolyDraw',h,input,0x60000fff,2));assert.deepEqual([p.apis.gui.dc(h).x,p.apis.gui.dc(h).y],[77,88]);assert.equal(events.filter(e=>e.type==='draw').length,0);assert.equal(call('PolyDraw',0,input,types,1),0);assert.equal(p.lastError,6);
});
