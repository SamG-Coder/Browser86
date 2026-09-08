import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,m:p.memory,h:p.apis.gui.newDC(0),call:(name,...args)=>p.apis.lookup('gdi32.dll',name).fn(...args)};}
test('DC pen and brush colors preserve full COLORREFs, saved state and native errors',()=>{
  const {p,h,call}=setup(),other=p.apis.gui.newDC(0);
  for(const [kind,initial] of [['Pen',0],['Brush',0xffffff]]){
    const get='GetDC'+kind+'Color',set='SetDC'+kind+'Color';assert.equal(call(get,h),initial);p.setError(1234);
    assert.equal(call(set,h,0xff123456),initial);assert.equal(call(get,h),0xff123456);assert.equal(call(get,other),initial);assert.equal(p.lastError,1234);
    call('SaveDC',h);assert.equal(call(set,h,0xffffffff),0xff123456);assert.equal(call(get,h),0xffffffff);call('RestoreDC',h,-1);assert.equal(call(get,h),0xff123456);
    for(const invalid of [0,123,call('GetStockObject',7)]){assert.equal(call(get,invalid),0xffffffff);assert.equal(p.lastError,87);p.setError(1234);assert.equal(call(set,invalid,0),0xffffffff);assert.equal(p.lastError,87);}
  }
});
test('DC stock colors affect selected drawing objects without mutating shared handles',()=>{
  const {p,events,m,h,call}=setup(),other=p.apis.gui.newDC(0),pen=call('GetStockObject',19),brush=call('GetStockObject',18);
  call('SetDCPenColor',h,0x123456);call('SetDCBrushColor',h,0xabcdef);call('Rectangle',h,0,0,10,10);
  let drawing=events.filter(e=>e.type==='draw').at(-1);assert.equal(drawing.pen.color,0);assert.equal(drawing.brush.color,0xffffff);
  for(const dc of [h,other]){call('SelectObject',dc,pen);call('SelectObject',dc,brush);}
  for(const op of ['Rectangle','Ellipse','RoundRect']){call(op,h,0,0,10,10,2,2);drawing=events.filter(e=>e.type==='draw').at(-1);assert.equal(drawing.pen.color,0x123456);assert.equal(drawing.brush.color,0xabcdef);}
  call('LineTo',h,20,20);assert.equal(events.filter(e=>e.type==='draw').at(-1).pen.color,0x123456);
  const rect=p.heap.alloc(16);[0,0,10,10].forEach((v,i)=>m.w32(rect+4*i,v));p.apis.lookup('user32.dll','FillRect').fn(h,rect,brush);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,0xabcdef);
  call('Rectangle',other,0,0,10,10);drawing=events.filter(e=>e.type==='draw').at(-1);assert.equal(drawing.pen.color,0);assert.equal(drawing.brush.color,0xffffff);
  call('SaveDC',h);call('SetDCPenColor',h,7);call('SetDCBrushColor',h,8);call('RestoreDC',h,-1);call('Rectangle',h,0,0,10,10);
  const saved=events.filter(e=>e.type==='draw').at(-1);call('SetDCPenColor',h,9);assert.equal(saved.pen.color,0x123456);assert.equal(saved.brush.color,0xabcdef);
  assert.equal(p.object(pen,'gdi').color,0);assert.equal(p.object(brush,'gdi').color,0xffffff);
});
test('Win32 DC queries: defaults, mutations and restored values are observable independently',()=>{
  const {p,h,call}=setup(),other=p.apis.gui.newDC(0);
  const names=['GetTextColor','GetBkColor','GetBkMode','GetTextAlign'];
  const read=dc=>names.map(name=>call(name,dc));
  assert.deepEqual(read(h),[0,0xffffff,2,0]);
  call('SetTextColor',h,0x123456);call('SetBkColor',h,0xabcdef);call('SetBkMode',h,1);call('SetTextAlign',h,6);call('SaveDC',h);
  call('SetTextColor',h,7);call('SetBkColor',h,8);call('SetBkMode',h,2);call('SetTextAlign',h,0);
  assert.deepEqual(read(h),[7,8,2,0]);call('RestoreDC',h,-1);p.setError(1234);
  assert.deepEqual(read(h),[0x123456,0xabcdef,1,6]);assert.deepEqual(read(other),[0,0xffffff,2,0]);assert.equal(p.lastError,1234);
  for(const invalid of [0,123,call('GetStockObject',7)]){assert.deepEqual(read(invalid),[0xffffffff,0xffffffff,0,0xffffffff]);assert.equal(p.lastError,1234);}
});
test('Win32 GDI object queries: selected handles, restored identity and deleted objects',()=>{
  const {p,h,call}=setup();assert.equal(call('GetObjectType',h),3);
  for(const [type,index] of [[1,7],[2,0],[6,17]]){const selected=call('GetCurrentObject',h,type);assert.equal(selected,call('GetStockObject',index));assert.equal(call('GetObjectType',selected),type);}
  const pen=call('CreatePen',0,2,123),stock=call('SelectObject',h,pen);call('SaveDC',h);call('SelectObject',h,stock);
  assert.equal(call('GetCurrentObject',h,1),stock);call('RestoreDC',h,-1);assert.equal(call('GetCurrentObject',h,1),pen);
  call('SelectObject',h,stock);assert.equal(call('DeleteObject',pen),1);p.setError(1234);assert.equal(call('GetObjectType',pen),0);assert.equal(p.lastError,1234);
  assert.equal(call('GetObjectType',0),0);assert.equal(p.lastError,6);
});
test('Win32 GDI object queries: invalid types and unsupported selections are explicit',()=>{
  const {p,h,call}=setup();
  for(const type of [0,3,99]){assert.equal(call('GetCurrentObject',h,type),0);assert.equal(p.lastError,87);}
  for(const type of [1,2,5,6,7,14]){p.setError(1234);assert.equal(call('GetCurrentObject',0,type),0);assert.equal(p.lastError,1234);}
  for(const type of [5,7,14])assert.throws(()=>call('GetCurrentObject',h,type),e=>e.code==='UNSUPPORTED_GDI');
});
test('Win32 DC state: nested restores pop newer saves and reuse levels',()=>{
  const {p,h,call}=setup();call('SetTextColor',h,1);assert.equal(call('SaveDC',h),1);call('SetTextColor',h,2);assert.equal(call('SaveDC',h),2);call('SetTextColor',h,3);assert.equal(call('SaveDC',h),3);
  for(const invalid of [0,4,-4]){assert.equal(call('RestoreDC',h,invalid),0);assert.equal(p.lastError,87);}
  p.setError(123);assert.equal(call('RestoreDC',h,-2),1);assert.equal(call('SetTextColor',h,9),2);assert.equal(p.lastError,123);
  assert.equal(call('RestoreDC',h,2),0);assert.equal(call('RestoreDC',h,1),1);assert.equal(call('SetTextColor',h,9),1);assert.equal(call('SaveDC',h),1);
});
test('Win32 DC state: restored position, selections and colors reach drawing commands',()=>{
  const {p,events,m,h,call}=setup(),pen=call('CreatePen',0,2,0x123456),brush=call('CreateSolidBrush',0xabcdef);
  call('SelectObject',h,pen);call('SelectObject',h,brush);call('SetTextColor',h,0x55);call('SetBkColor',h,0x66);call('SetBkMode',h,1);call('SetTextAlign',h,6);call('MoveToEx',h,7,8,0);call('SaveDC',h);
  call('SetTextColor',h,0);call('SetBkColor',h,0);call('SetBkMode',h,2);call('SetTextAlign',h,0);call('MoveToEx',h,70,80,0);call('SelectObject',h,call('GetStockObject',7));call('RestoreDC',h,-1);
  const out=p.heap.alloc(8);assert.equal(call('GetCurrentPositionEx',h,out),1);assert.deepEqual([m.i32(out),m.i32(out+4)],[7,8]);call('LineTo',h,9,10);
  const line=events.filter(e=>e.type==='draw').at(-1);assert.equal(line.x,7);assert.equal(line.y,8);assert.equal(line.pen.color,0x123456);
  call('TextOutA',h,0,0,p.heap.string('x'),1);const text=events.filter(e=>e.type==='draw').at(-1);assert.equal(text.color,0x55);assert.equal(text.background,0x66);assert.equal(text.opaque,false);assert.equal(text.align,6);
});
test('Win32 DC state: stacks are independent and saved selections remain valid',()=>{
  const {p,h,call}=setup(),other=p.apis.gui.newDC(0),pen=call('CreatePen',0,1,123),stock=call('GetStockObject',7);
  call('SelectObject',h,pen);call('SaveDC',h);call('SelectObject',h,stock);assert.equal(call('DeleteObject',pen),0);
  assert.equal(call('RestoreDC',other,-1),0);assert.equal(call('RestoreDC',h,-1),1);assert.equal(call('SelectObject',h,stock),pen);assert.equal(call('DeleteObject',pen),1);
});
test('Win32 DC state: invalid handles, levels and output ranges preserve state',()=>{
  const {p,m,h,call}=setup();assert.equal(call('SaveDC',0),0);assert.equal(p.lastError,6);assert.equal(call('RestoreDC',0,-1),0);
  call('MoveToEx',h,10,20,0);call('SaveDC',h);assert.equal(call('GetCurrentPositionEx',h,0),0);assert.equal(p.lastError,87);
  m.map(0x60000000,4096);const edge=0x60000ffc;m.w32(edge,0xcccccccc);assert.throws(()=>call('GetCurrentPositionEx',h,edge));assert.equal(m.u32(edge),0xcccccccc);
  assert.equal(call('RestoreDC',h,-1),1);assert.equal(p.apis.gui.dc(h).x,10);
});
