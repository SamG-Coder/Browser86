import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(brushKind='solid',wide=false){const {p,events}=guest('HelloConsole.exe'),m=p.memory,u=(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a),g=(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a),name=p.heap.alloc(24),cls=p.heap.alloc(40,true);m.string(name,'EraseClass',wide,11);const brush=brushKind==='solid'?g('CreateSolidBrush',0x123456):brushKind==='null'?0:brushKind==='hollow'?g('GetStockObject',5):16;m.w32(cls+28,brush);m.w32(cls+36,name);const atom=u('RegisterClass'+(wide?'W':'A'),cls),h=u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);return {p,m,u,g,h,events};}
test('Default background erasing uses the class brush and supplied DC clipping bounds',()=>{
 for(const wide of [false,true]){const {p,u,g,h,events}=setup('solid',wide),dc=u('GetDC',0),r=g('CreateRectRgn',3,4,30,35);g('SelectClipRgn',dc,r);const before=new Set(p.heap.blocks.keys());p.setError(1234);assert.equal(u('DefWindowProc'+(wide?'W':'A'),h,20,dc,0),1);assert.equal(p.lastError,1234);const draw=events.filter(e=>e.type==='draw').at(-1);assert.equal(draw.hwnd,0);assert.equal(draw.color,0x123456);assert.deepEqual([draw.x,draw.y,draw.width,draw.height],[3,4,27,31]);assert.deepEqual(draw.clip,[[3,4,30,35]]);assert.deepEqual(new Set(p.heap.blocks.keys()),before);}
});
test('Null class brushes skip erasing and DC validation while hollow brushes report success without drawing',()=>{
 for(const kind of ['null','hollow']){const {p,u,h,events}=setup(kind),dc=u('GetDC',h);p.setError(1234);assert.equal(u('DefWindowProcA',h,20,dc,0),kind==='null'?0:1);assert.equal(events.filter(e=>e.type==='draw').length,0);assert.equal(p.lastError,1234);if(kind==='null'){assert.equal(u('DefWindowProcW',h,20,123,0),0);assert.equal(p.lastError,1234);}}
});
test('Class background system color values resolve through the runtime color profile',()=>{
 const {u,h,events}=setup('color'),dc=u('GetDC',h);assert.equal(u('DefWindowProcA',h,20,dc,0),1);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,u('GetSysColor',15));
});
test('Invalid and empty DC paths preserve native erase results without drawing or leaking buffers',()=>{
 const {p,u,g,h,events}=setup(),before=new Set(p.heap.blocks.keys());for(const dc of [0,123]){p.setError(1234);assert.equal(u('DefWindowProcA',h,20,dc,0),1);assert.equal(p.lastError,6);}assert.deepEqual(new Set(p.heap.blocks.keys()),before);const dc=u('GetDC',h),r=g('CreateRectRgn',0,0,0,0);g('SelectClipRgn',dc,r);assert.equal(u('DefWindowProcW',h,20,dc,0),1);assert.equal(events.filter(e=>e.type==='draw').length,0);
});
