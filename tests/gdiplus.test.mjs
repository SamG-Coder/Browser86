import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('GDI+ startup validates its version and owns a shutdown token',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,g=(n,...a)=>p.apis.lookup('gdiplus.dll',n).fn(...a),input=p.heap.alloc(16,true),out=p.heap.alloc(4,true);
  assert.equal(g('GdiplusStartup',0,input,0),2);assert.equal(g('GdiplusStartup',out,input,0),17);assert.equal(m.u32(out),0);
  m.w32(input,1);assert.equal(g('GdiplusStartup',out,input,0),0);const token=m.u32(out);assert.ok(p.object(token,'gdiplus-token'));g('GdiplusShutdown',token);assert.equal(p.object(token),null);
  m.w32(input+8,1);assert.throws(()=>g('GdiplusStartup',out,input,0),{code:'GDIPLUS_STARTUP'});
});
