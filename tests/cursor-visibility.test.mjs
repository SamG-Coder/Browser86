import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p,events}=guest('HelloConsole.exe');return {p,events,u:(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args),styles:()=>events.filter(e=>e.type==='cursor').map(e=>e.css)};}
test('ShowCursor returns the cumulative signed display count and preserves last error',()=>{
 const {p,u}=setup();for(const [show,count]of [[0,-1],[0,-2],[2,-1],[-1,0],[1,1],[0,0]]){p.setError(1234);assert.equal(u('ShowCursor',show),count);assert.equal(p.lastError,1234);}
});
test('ShowCursor changes visibility only when crossing zero and retains cursor selection',()=>{
 const {u,styles}=setup(),h=u('LoadCursorA',0,32512);u('SetCursor',h);assert.equal(u('ShowCursor',0),-1);assert.equal(u('ShowCursor',0),-2);assert.equal(u('GetCursor'),h);
 assert.equal(u('ShowCursor',1),-1);assert.deepEqual(styles(),['default','none']);assert.equal(u('ShowCursor',1),0);assert.equal(u('GetCursor'),h);assert.deepEqual(styles(),['default','none','default']);
 u('ShowCursor',1);u('ShowCursor',0);assert.deepEqual(styles(),['default','none','default']);
});
test('Cursor changes while hidden remain hidden and the newest selection appears when shown',()=>{
 const {p,u,styles}=setup(),arrow=u('LoadCursorA',0,32512),text=u('LoadCursorW',0,32513);u('SetCursor',arrow);u('ShowCursor',0);
 assert.equal(u('SetCursor',text),arrow);assert.equal(u('GetCursor'),text);assert.equal(styles().at(-1),'none');assert.equal(u('SetCursor',123),0);assert.equal(p.lastError,1402);
 u('ShowCursor',1);assert.equal(styles().at(-1),'text');assert.equal(u('SetCursor',0),text);u('ShowCursor',0);u('ShowCursor',1);assert.equal(styles().at(-1),'none');assert.equal(u('GetCursor'),0);
});
test('Display counts are isolated to each guest and do not change shared cursor lifetime',()=>{
 const first=setup(),second=setup(),h=first.u('LoadCursorA',0,32512);first.u('SetCursor',h);first.u('ShowCursor',0);assert.equal(second.u('ShowCursor',1),1);assert.equal(first.u('ShowCursor',1),0);
 first.u('ShowCursor',0);assert.equal(first.u('DestroyCursor',h),1);assert.equal(first.u('ShowCursor',1),0);assert.equal(first.u('GetCursor'),h);assert.equal(first.styles().at(-1),'default');
});
