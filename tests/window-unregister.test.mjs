import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(wide,extended=false,instance=0){const {p}=guest('HelloConsole.exe'),m=p.memory,call=(name,...a)=>p.apis.lookup('user32.dll',name).fn(...a),str=(s,w=wide)=>{const a=p.heap.alloc((s.length+1)*2);m.string(a,s,w,s.length+1);return a;},cls=p.heap.alloc(extended?48:40,true),offset=extended?4:0;if(extended)m.w32(cls,48);m.w32(cls+offset+16,instance);m.w32(cls+offset+36,str('CaféClass'));const atom=call('RegisterClass'+(extended?'Ex':'')+(wide?'W':'A'),cls);return {p,m,call,str,atom,cls};}
test('UnregisterClass accepts registration atoms across all A/W and extended variants',()=>{
 for(const wide of [false,true])for(const extended of [false,true])for(const unregisterWide of [false,true]){const {p,call,atom}=setup(wide,extended);p.setError(1234);assert.equal(call('UnregisterClass'+(unregisterWide?'W':'A'),atom,0),1);assert.equal(p.lastError,1234);assert.equal(call('UnregisterClassA',atom,0),0);assert.equal(p.lastError,6);}
});
test('Class atoms remain registered while windows exist, and can be removed after destruction',()=>{
 const {p,call,atom,cls}=setup(false),h=call('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0);assert.ok(h);assert.equal(call('UnregisterClassW',atom,0),0);assert.equal(p.lastError,1412);call('DestroyWindow',h);assert.equal(call('UnregisterClassW',atom,0),1);assert.equal(call('CreateWindowExA',0,atom,0,0,0,0,20,20,0,0,0,0),0);assert.equal(p.lastError,1407);assert.ok(call('RegisterClassA',cls));
});
test('UnregisterClass validates module instance before live-window state and accepts main-module aliases',()=>{
 const {p,call,atom}=setup(true),h=call('CreateWindowExW',0,atom,0,0,0,0,20,20,0,0,0,0);assert.equal(call('UnregisterClassA',atom,123),0);assert.equal(p.lastError,1411);call('DestroyWindow',h);assert.equal(call('UnregisterClassA',atom,p.main.base),1);
 const other=setup(false,false,456);assert.equal(other.call('UnregisterClassW',other.atom,123),0);assert.equal(other.p.lastError,1411);assert.equal(other.call('UnregisterClassW',other.atom,0),1);
});
test('UnregisterClass distinguishes null, integer, missing atom and string names without reading atoms',()=>{
 for(const wide of [false,true]){const {p,call,str,atom}=setup(wide),api='UnregisterClass'+(wide?'W':'A');for(const [key,error]of [[0,87],[1,1411],[0xbfff,1411],[0xffff,6],[str('Missing'),1411]]){assert.equal(call(api,key,0),0);assert.equal(p.lastError,error);}assert.throws(()=>call(api,0x60000000,0));assert.equal(call(api,str('cAFÉcLASS'),0),1);assert.equal(call(api,atom,0),0);}
});
