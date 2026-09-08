import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide=false,extended=false){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(name,...args)=>p.apis.lookup('user32.dll',name).fn(...args),g=(name,...args)=>p.apis.lookup('gdi32.dll',name).fn(...args);
 const register=(brush,name='BrushClass')=>{const text=p.heap.alloc((name.length+1)*2);m.string(text,name,wide,name.length+1);const cls=p.heap.alloc(48,true),offset=extended?4:0;if(extended)m.w32(cls,48);m.w32(cls+offset+28,brush);m.w32(cls+offset+36,text);return u('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls);};return {p,m,u,g,register};}
test('Class unregistration releases owned background brushes for all registration variants',()=>{
 for(const wide of [false,true])for(const extended of [false,true]){const {p,u,g,register}=setup(wide,extended),brush=g('CreateSolidBrush',0x123456),atom=register(brush);assert.equal(g('GetObjectType',brush),2);p.setError(1234);assert.equal(u('UnregisterClassW',atom,0),1);assert.equal(p.lastError,1234);assert.equal(g('GetObjectType',brush),0);assert.equal(g('DeleteObject',brush),0);}
});
test('Failed registration and unregistration retain application brushes',()=>{
 const {p,u,g,register}=setup(),brush=g('CreateSolidBrush',123),other=g('CreateSolidBrush',456),atom=register(brush);assert.equal(register(other),0);assert.equal(g('GetObjectType',other),2);
 const h=u('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);assert.equal(u('UnregisterClassA',atom,0),0);assert.equal(p.lastError,1412);assert.equal(g('GetObjectType',brush),2);assert.equal(u('UnregisterClassA',atom,123),0);assert.equal(p.lastError,1411);assert.equal(g('GetObjectType',brush),2);u('DestroyWindow',h);u('UnregisterClassA',atom,0);assert.equal(g('GetObjectType',brush),0);assert.equal(g('GetObjectType',other),2);
});
test('Class cleanup preserves stock/system brushes and color pseudo-handles',()=>{
 const {u,g,register}=setup();for(const brush of [0,6,g('GetStockObject',0),u('GetSysColorBrush',5)]){const atom=register(brush);assert.ok(atom);assert.equal(u('UnregisterClassA',atom,0),1);if(brush>6)assert.equal(g('GetObjectType',brush),2);}
});
test('Unregistration invalidates the class brush even when selected into a DC',()=>{
 const {u,g,register}=setup(),brush=g('CreateSolidBrush',123),dc=u('GetDC',0),old=g('SelectObject',dc,brush),atom=register(brush);assert.equal(u('UnregisterClassW',atom,0),1);assert.equal(g('GetObjectType',brush),0);assert.equal(g('SelectObject',dc,old),brush);assert.equal(u('ReleaseDC',0,dc),1);
});
