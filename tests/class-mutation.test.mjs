import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),g=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),name=p.heap.alloc(16),cls=p.heap.alloc(40,true);m.string(name,'Mutation',false,9);m.w32(cls+8,8);m.w32(cls+36,name);const brush=g('CreateSolidBrush',123);m.w32(cls+28,brush);const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0),h=create();return {p,events,u,g,h,atom,brush,create};}
test('Class extra bytes share overlapping DWORD writes across windows and A/W APIs',()=>{
 const {p,u,h,create}=setup(),other=create();p.setError(1234);assert.equal(u('SetClassLongA',h,0,0x12345678),0);assert.equal(u('GetClassLongW',other,1),0x123456);assert.equal(u('SetClassLongW',other,1,0xaabbccdd),0x123456);assert.equal(u('GetClassLongA',h,0),0xbbccdd78);assert.equal(p.lastError,1234);u('DestroyWindow',h);assert.equal(u('GetClassLongW',other,1),0xaabbccdd);
});
test('Out-of-range class writes and invalid handles fail without changing shared bytes',()=>{
 const {p,u,h}=setup();u('SetClassLongA',h,4,0xabcdef12);for(const index of [5,8,0x7fffffff]){assert.equal(u('SetClassLongW',h,index,0),0);assert.equal(p.lastError,1413);assert.equal(u('GetClassLongA',h,4),0xabcdef12);}assert.equal(u('SetClassLongA',123,0,1),0);assert.equal(p.lastError,1400);assert.throws(()=>u('SetClassLongW',h,-24,123),/not implemented/);
});
test('Replacing a class brush affects erasing for all windows and transfers cleanup to the current brush',()=>{
 const {p,events,u,g,h,atom,brush,create}=setup(),other=create(),replacement=g('CreateSolidBrush',0xabcdef);p.setError(1234);assert.equal(u('SetClassLongW',h,-10,replacement),brush);assert.equal(p.lastError,1234);assert.equal(g('GetObjectType',brush),2);assert.equal(u('GetClassLongA',other,-10),replacement);u('DefWindowProcA',other,20,u('GetDC',other),0);assert.equal(events.filter(e=>e.type==='draw').at(-1).color,0xabcdef);u('DestroyWindow',h);u('DestroyWindow',other);assert.equal(u('UnregisterClassA',atom,0),1);assert.equal(g('GetObjectType',replacement),0);assert.equal(g('GetObjectType',brush),2);assert.equal(g('DeleteObject',brush),1);
});
test('Null class brush replacement disables erasing without deleting the previous brush',()=>{
 const {events,u,g,h,brush}=setup();assert.equal(u('SetClassLongA',h,-10,0),brush);assert.equal(u('DefWindowProcW',h,20,u('GetDC',h),0),0);assert.equal(events.filter(e=>e.type==='draw').length,0);assert.equal(g('GetObjectType',brush),2);assert.equal(u('SetClassLongW',h,-10,brush),0);
});
