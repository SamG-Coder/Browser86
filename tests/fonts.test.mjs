import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,call:(name,...args)=>p.apis.lookup('gdi32.dll',name).fn(...args)};}
test('ANSI font inspection matches native conversion for every nonzero UTF-16 unit',()=>{
  const {p,m,call}=setup(),source=p.heap.alloc(92),out=p.heap.alloc(60),reference=fs.readFileSync(new URL('./font-ansi-vectors.bin',import.meta.url));assert.equal(reference.length,65536);
  for(let start=1;start<65536;start+=31){m.write(source,new Uint8Array(92));const count=Math.min(31,65536-start);for(let i=0;i<count;i++)m.w16(source+28+2*i,start+i);
    const font=call('CreateFontIndirectW',source);m.write(out,new Uint8Array(60).fill(204));p.setError(1234);assert.equal(call('GetObjectA',font,60,out),60);assert.equal(p.lastError,1234);
    for(let i=0;i<count;i++)assert.equal(m.u8(out+28+i),reference[start+i],'UTF-16 '+(start+i).toString(16));assert.equal(m.u8(out+28+count),0);assert.equal(call('DeleteObject',font),1);
  }
});
test('ANSI font names retain surrogate replacement count and query prefix boundaries',()=>{
  const {p,m,call}=setup(),source=p.heap.alloc(92),out=p.heap.alloc(64),units=[0xff21,0x100,0x2212,0x4e00,0xd83d,0xde00];units.forEach((u,i)=>m.w16(source+28+2*i,u));const font=call('CreateFontIndirectW',source);
  for(const count of [31,34,59,60]){m.write(out,new Uint8Array(64).fill(204));assert.equal(call('GetObjectA',font,count,out),count);assert.deepEqual(Array.from(m.read(out+28,Math.min(count-28,6))),[65,65,45,63,63,63].slice(0,count-28));assert.equal(m.u8(out+(count===60?35:count)),204);}
  assert.equal(call('GetObjectW',font,0,0),92);assert.equal(call('DeleteObject',font),1);
});
test('Logical fonts preserve all fields and independent Unicode face-name storage',()=>{
  const {p,m,call}=setup(),input=p.heap.alloc(92),out=p.heap.alloc(92);
  const ints=[-17,-3,901,-45,1200],flags=[2,3,4,255,254,253,252,251];ints.forEach((n,i)=>m.w32(input+i*4,n));flags.forEach((n,i)=>m.w8(input+20+i,n));
  const name='Abc\0TAIL';for(let i=0;i<name.length;i++)m.w16(input+28+i*2,name.charCodeAt(i));
  const font=call('CreateFontIndirectW',input);m.write(input,new Uint8Array(92));p.setError(1234);assert.equal(call('GetObjectW',font,92,out),92);assert.equal(p.lastError,1234);
  assert.deepEqual(ints.map((_,i)=>m.i32(out+4*i)),ints);assert.deepEqual(flags.map((_,i)=>m.u8(out+20+i)),flags);assert.equal(m.u16(out+36),84);
  const dc=p.apis.gui.newDC(0),stock=call('SelectObject',dc,font);call('SaveDC',dc);call('SelectObject',dc,stock);assert.equal(call('DeleteObject',font),0);call('RestoreDC',dc,-1);assert.equal(call('GetCurrentObject',dc,6),font);call('SelectObject',dc,stock);assert.equal(call('DeleteObject',font),1);
});
test('CreateFont A/W and indirect ANSI preserve logical fields and truncate bounded names',()=>{
  const {p,m,events,call}=setup(),input=p.heap.alloc(60),out=p.heap.alloc(92);
  for(let i=0;i<32;i++)m.w8(input+28+i,88);const indirect=call('CreateFontIndirectA',input);call('GetObjectW',indirect,92,out);assert.equal(m.u16(out+88),88);assert.equal(m.u16(out+90),0);
  for(const wide of [false,true]){
    const ptr=p.heap.string('Arial',wide),font=call('CreateFont'+(wide?'W':'A'),-22,7,900,450,700,2,3,4,1,2,3,4,5,ptr);
    call('GetObjectW',font,92,out);assert.deepEqual([0,4,8,12,16].map(i=>m.i32(out+i)),[-22,7,900,450,700]);assert.deepEqual(Array.from({length:8},(_,i)=>m.u8(out+20+i)),[2,3,4,1,2,3,4,5]);
    const dc=p.apis.gui.newDC(0);call('SelectObject',dc,font);call('TextOutA',dc,0,0,p.heap.string('x'),1);const drawing=events.filter(e=>e.type==='draw').at(-1);assert.equal(drawing.font.face,'Arial');assert.equal(drawing.font.height,22);
  }
});
test('Font queries implement partial copies, A/W alignment and ANSI tail preservation',()=>{
  const {p,m,call}=setup(),input=p.heap.alloc(92),out=p.heap.alloc(128);m.w32(input,-17);m.w16(input+28,65);const font=call('CreateFontIndirectW',input);
  for(const wide of [false,true]){const name=wide?'GetObjectW':'GetObjectA',size=wide?92:60;assert.equal(call(name,font,0,0),size);
    for(const count of [0,1,20,28,size-1,size]){m.write(out,new Uint8Array(128).fill(204));assert.equal(call(name,font,count,out),count);assert.equal(m.u8(out+count),204);}
    assert.throws(()=>call(name,font,size+1,out),e=>e.code==='UNSUPPORTED_GDI');
  }
  m.write(out,new Uint8Array(128).fill(204));assert.equal(call('GetObjectA',font,60,out+1),60);assert.equal(m.u8(out+31),204);
  assert.equal(call('GetObjectW',font,92,out+1),0);assert.equal(call('GetObjectW',font,92,out+2),92);
  assert.equal(call('CreateFontIndirectA',0),0);assert.equal(call('CreateFontIndirectW',0),0);
  m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);const handles=p.handles.size;assert.throws(()=>call('CreateFontIndirectW',edge));assert.equal(p.handles.size,handles);assert.throws(()=>call('GetObjectW',font,92,edge));assert.equal(m.u32(edge),0xcccccccc);
});
