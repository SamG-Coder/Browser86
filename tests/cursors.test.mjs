import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
import {GuestDisplay} from '../src/ui/display.js';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,u:(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),str:(text,wide)=>{const pointer=p.heap.alloc((text.length+1)*2);p.memory.string(pointer,text,wide,text.length+1);return pointer;}};}
test('System cursors are typed shared handles across A/W and ordinal-string loads',()=>{
 const {p,u,str}=setup();for(const id of [32512,32513,32514,32515,32516,32642,32643,32644,32645,32646,32648,32649,32650,32651,32671,32672]){
  p.setError(1234);const h=u('LoadCursorA',0,id);assert.ok(h);assert.notEqual(h,id);assert.equal(p.object(h,'cursor').id,id);
  assert.equal(u('LoadCursorW',0,id),h);for(const wide of [false,true])assert.equal(u('LoadCursor'+(wide?'W':'A'),0,str('#'+id,wide)),h);assert.equal(p.lastError,1234);
 }
});
test('Missing system cursors report resource errors and module cursors remain explicit',()=>{
 const {p,u,str}=setup();for(const suffix of ['A','W']){
  for(const name of [0,123,str('IDC_ARROW',suffix==='W')]){assert.equal(u('LoadCursor'+suffix,0,name),0);assert.equal(p.lastError,1814);}
  for(const name of [32640,32641]){p.setError(1234);assert.equal(u('LoadCursor'+suffix,0,name),0);assert.equal(p.lastError,1234);}
  assert.throws(()=>u('LoadCursor'+suffix,p.main.base,32512),/Module cursor resources/);
 }
});
test('SetCursor returns prior state, validates handles, and emits only actual changes',()=>{
 const {p,u,events}=setup(),arrow=u('LoadCursorA',0,32512),text=u('LoadCursorW',0,32513);assert.equal(u('GetCursor'),0);
 p.setError(1234);assert.equal(u('SetCursor',arrow),0);assert.equal(u('SetCursor',arrow),arrow);assert.equal(p.lastError,1234);
 assert.equal(u('SetCursor',text),arrow);assert.equal(u('GetCursor'),text);
 for(const bad of [123,32512,p.handle('event',{})]){assert.equal(u('SetCursor',bad),0);assert.equal(p.lastError,1402);assert.equal(u('GetCursor'),text);}
 assert.equal(u('SetCursor',0),text);assert.equal(u('GetCursor'),0);assert.deepEqual(events.filter(e=>e.type==='cursor').map(e=>e.css),['default','text','none']);
});
test('DestroyCursor preserves shared system handles and kernel CloseHandle rejects them',()=>{
 const {p,u}=setup(),h=u('LoadCursorA',0,32512);u('SetCursor',h);p.setError(1234);
 assert.equal(u('DestroyCursor',h),1);assert.equal(p.lastError,1234);assert.equal(u('GetCursor'),h);assert.equal(u('LoadCursorW',0,32512),h);
 assert.equal(p.apis.lookup('kernel32.dll','CloseHandle').fn(h),0);assert.equal(p.lastError,6);assert.ok(p.object(h,'cursor'));
 for(const bad of [0,123]){assert.equal(u('DestroyCursor',bad),0);assert.equal(p.lastError,1402);}
});
test('Class cursor replacement shares metadata, returns prior handles, and clears invalid replacements',()=>{
 const {p,u,str}=setup(),m=p.memory,cls=p.heap.alloc(40,true);m.w32(cls+36,str('CursorClass',false));const atom=u('RegisterClassA',cls),create=()=>u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0),a=create(),b=create(),cursor=u('LoadCursorW',0,32513);
 p.setError(1234);assert.equal(u('SetClassLongW',a,-12,cursor),0);assert.equal(p.lastError,1234);assert.equal(u('GetClassLongA',b,-12),cursor);assert.equal(u('GetCursor'),0);
 assert.equal(u('SetClassLongA',b,-12,123),cursor);assert.equal(p.lastError,1402);assert.equal(u('GetClassLongW',a,-12),0);
 assert.equal(u('SetClassLongA',a,-12,cursor),0);assert.equal(u('SetClassLongW',a,-12,0),cursor);assert.ok(p.object(cursor,'cursor'));
});
test('Display cursor updates existing surfaces and reset discards cursor state',()=>{
 const display=new GuestDisplay({querySelectorAll:()=>[]},()=>{}),canvas={style:{}},control={style:{},remove(){}};
 display.windows.set(1,{canvas,element:{remove(){}}});display.windows.set(2,{element:control});display.cursor('text');assert.equal(canvas.style.cursor,'text');assert.equal(control.style.cursor,'text');display.cursor('none');assert.equal(canvas.style.cursor,'none');display.reset();assert.equal(display.cursorCSS,undefined);
});
