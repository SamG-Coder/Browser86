import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'CursorMessages',false,16);m.w32(cls+36,name);const atom=u('RegisterClassA',cls),create=(parent=0,style=0)=>u('CreateWindowExA',0,atom,0,style,0,0,20,20,parent,0,0,0);return {p,u,create};}
test('Default cursor messages select current class cursor, preserve null-class selection and honor hidden counts',()=>{
 const {p,u,create}=setup(),h=create(),text=u('LoadCursorW',0,32513),arrow=u('LoadCursorA',0,32512);u('SetCursor',arrow);
 for(const suffix of ['A','W']){u('SetClassLongA',h,-12,text);p.setError(1234);assert.equal(u('DefWindowProc'+suffix,h,0x20,h,0x2000001),0);assert.equal(u('GetCursor'),text);assert.equal(p.lastError,1234);u('SetClassLongW',h,-12,0);assert.equal(u('DefWindowProc'+suffix,h,0x20,0,0x2000001),0);assert.equal(u('GetCursor'),text);}
 u('ShowCursor',0);u('SetClassLongA',h,-12,arrow);u('DefWindowProcA',h,0x20,h,1);assert.equal(u('GetCursor'),arrow);assert.equal(p.apis.gui.cursorDisplayCount,-1);
});
test('Nonclient cursor messages select resize shapes and return the native handled result',()=>{
 const {p,u,create}=setup(),h=create();for(const [hit,id]of [[10,32644],[11,32644],[12,32645],[13,32642],[14,32643],[15,32645],[16,32643],[17,32642],[0,32512],[2,32512],[-1,32512],[-2,32512],[99,32512]]){p.setError(1234);assert.equal(u('DefWindowProcW',h,0x20,h,(0x2000000|(hit&65535))>>>0),hit>=10&&hit<=17?1:0);assert.equal(u('GetCursor'),u('LoadCursorA',0,id));assert.equal(p.lastError,1234);}
});
test('Child cursor messages forward original parameters to the parent and stop on a nonzero reply',()=>{
 const {u,create}=setup(),parent=create(),child=create(parent,0x40000000),cursor=u('LoadCursorA',0,32513);u('SetClassLongA',child,-12,cursor);u('SetWindowLongW',parent,-4,12345);
 const result=u('DefWindowProcA',child,0x20,child,0x2000001);assert.deepEqual(result.call,{address:12345,args:[parent,0x20,child,0x2000001]});assert.equal(result.then(7),1);assert.equal(u('GetCursor'),0);
 const fallback=u('DefWindowProcW',child,0x20,0,0x2000001);assert.equal(fallback.call.args[2],0);assert.equal(fallback.then(0),0);assert.equal(u('GetCursor'),cursor);
});
test('Owned popups do not forward cursor messages and destroyed children skip callback fallback',()=>{
 const {u,create}=setup(),parent=create(),popup=create(parent,0x80000000),child=create(parent,0x40000000);u('SetWindowLongA',parent,-4,12345);assert.equal(u('DefWindowProcA',popup,0x20,popup,1),0);
 const result=u('DefWindowProcA',child,0x20,child,2);u('DestroyWindow',child);assert.equal(result.then(0),0);assert.equal(u('GetCursor'),0);
});
test('Forwarding through default parent procedures waits for the grandparent callback before fallback',()=>{
 const {u,create}=setup(),root=create(),parent=create(root,0x40000000),child=create(parent,0x40000000),cursor=u('LoadCursorA',0,32513);u('SetClassLongA',child,-12,cursor);u('SetWindowLongA',root,-4,24680);
 const result=u('SendMessageW',child,0x20,child,1);assert.equal(result.call.address,24680);assert.deepEqual(result.call.args,[root,0x20,child,1]);assert.equal(u('GetCursor'),0);assert.equal(result.then(0),0);assert.equal(u('GetCursor'),cursor);
 u('SetCursor',0);const handled=u('SendMessageA',child,0x20,child,1);assert.equal(handled.then(3),1);assert.equal(u('GetCursor'),0);
});
test('Unsupported error-hit beeps remain explicit and invalid windows do not change cursor state',()=>{
 const {u,create}=setup(),h=create();assert.throws(()=>u('DefWindowProcA',h,0x20,h,0x201fffe),/beeps/);assert.equal(u('GetCursor'),0);assert.equal(u('DefWindowProcW',123,0x20,123,2),0);assert.equal(u('GetCursor'),0);
});
