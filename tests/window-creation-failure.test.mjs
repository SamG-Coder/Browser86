import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
for(const wide of [false,true])test(`CreateWindowEx${wide?'W':'A'} rejection sends stage-appropriate destruction callbacks and releases resources`,()=>{
 for(const rejected of [129,1]){
  const {p,events}=guest('HelloConsole.exe'),gui=p.apis.gui,m=p.memory,name=p.heap.alloc(64);m.string(name,'RejectFixture',wide,32);
  gui.classes.set('rejectfixture',{name:'RejectFixture',proc:123,wide});
  const before=new Set(p.handles.keys()),messages=[];let hwnd,dc,cs;
  let result=p.apis.lookup('user32.dll','CreateWindowEx'+(wide?'W':'A')).fn(0,name,0,0x90000000,0,0,20,20,0,0,0,0);
  while(result?.call){const [h,msg,,lp]=result.call.args;hwnd=h;messages.push(msg);assert.ok(gui.window(h));
   if(msg===129){dc=gui.window(h).dc;cs=lp;p.timers.set(h+':1',{hwnd:h});gui.focus=h;}
   result=result.then(msg===129?(rejected===129?0:1):msg===1?0xffffffff:0);
  }
  assert.equal(result,0);assert.deepEqual(messages,rejected===129?[129,130]:[129,1,2,130]);
  assert.equal(gui.windows.size,0);assert.equal(p.handles.has(hwnd),false);assert.equal(p.handles.has(dc),false);assert.equal(p.timers.size,0);assert.equal(gui.focus,0);
  assert.equal(p.messageQueue.some(msg=>msg.hwnd===hwnd),false);assert.equal(events.filter(e=>e.type==='window'&&e.op==='destroy').length,1);
  // Stock objects are process-owned; rejected creation must leave no window/DC allocations.
  for(const [h,obj]of p.handles)if(!before.has(h))assert.equal(obj.stock,true);
  assert.ok(cs);assert.equal(p.heap.blocks.has(cs),false);
 }
});
test('WM_CREATE rejection destroys callback-created descendants through their procedures',()=>{
 const {p}=guest('HelloConsole.exe'),gui=p.apis.gui,name=p.heap.alloc(32);p.memory.string(name,'Reject',false,32);gui.classes.set('reject',{name:'Reject',proc:123});
 let result=p.apis.lookup('user32.dll','CreateWindowExA').fn(0,name,0,0x80000000,0,0,20,20,0,0,0,0),child,log=[];
 while(result?.call){const [h,msg]=result.call.args;log.push([h,msg]);if(msg===1){child=p.handle('window',{});gui.windows.set(child,{hwnd:child,parent:h,style:0x40000000,proc:456,dc:gui.newDC(child)});}
  result=result.then(msg===129?1:msg===1?0xffffffff:0);
 }
 assert.equal(result,0);assert.deepEqual(log.map(x=>x[1]),[129,1,2,2,130,130]);assert.equal(log[3][0],child);assert.equal(gui.windows.size,0);
});
test('A window destroyed during creation is not returned or queued for painting',()=>{
 for(const stage of [129,1]){
  const {p}=guest('HelloConsole.exe'),gui=p.apis.gui,name=p.heap.alloc(32);p.memory.string(name,'Reject',false,32);gui.classes.set('reject',{name:'Reject',proc:123});
  let result=p.apis.lookup('user32.dll','CreateWindowExA').fn(0,name,0,0x90000000,0,0,20,20,0,0,0,0),log=[];
  while(result?.call){const [h,msg]=result.call.args;log.push(msg);if(msg===stage){let destroy=gui.destroy(h);while(destroy?.call)destroy=destroy.then(0);assert.equal(destroy,1);}result=result.then(msg===129?1:0);}
  assert.equal(result,0);assert.deepEqual(log,stage===129?[129]:[129,1]);assert.equal(gui.windows.size,0);assert.equal(p.messageQueue.length,0);
 }
});
