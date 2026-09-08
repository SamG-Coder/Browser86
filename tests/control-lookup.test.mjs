import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
function setup(){const {p}=guest('HelloConsole.exe'),m=p.memory,u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),cls=p.heap.alloc(40,true),name=p.heap.alloc(32);m.string(name,'ControlLookup',false,32);m.w32(cls+36,name);const atom=u('RegisterClassA',cls),create=(parent=0,id=0,style=0x40000000)=>u('CreateWindowExA',0,atom,0,style,0,0,20,20,parent,id,0,0),parent=create(0,0,0);return {p,u,create,parent};}
test('Control lookup preserves signed 32-bit IDs and successful last-error state',()=>{
 const {p,u,create,parent}=setup();for(const id of [0,123,0xffffffff,0x80000000]){const child=create(parent,id);p.setError(1234);assert.equal(u('GetDlgCtrlID',child),id|0);assert.equal(u('GetDlgItem',parent,id),child);assert.equal(u('GetDlgItem',parent,id|0),child);assert.equal(p.lastError,1234);u('DestroyWindow',child);}
});
test('Control lookup searches immediate children and excludes owned popup windows',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,1),grandchild=create(child,2),popup=create(parent,0,0x80000000);u('SetWindowLongA',popup,-12,3);assert.equal(u('GetDlgItem',child,2),grandchild);for(const id of [2,3,99]){p.setError(1234);assert.equal(u('GetDlgItem',parent,id),0);assert.equal(p.lastError,1421);}
});
test('Control lookup follows ID replacement and removes destroyed controls',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,1);assert.equal(u('SetWindowLongA',child,-12,2),1);assert.equal(u('GetDlgCtrlID',child),2);assert.equal(u('GetDlgItem',parent,2),child);assert.equal(u('GetDlgItem',parent,1),0);assert.equal(p.lastError,1421);u('DestroyWindow',child);assert.equal(u('GetDlgItem',parent,2),0);assert.equal(p.lastError,1421);assert.equal(u('GetDlgCtrlID',child),0);assert.equal(p.lastError,1400);
});
test('Control lookup rejects null, invalid and destroyed parent handles',()=>{
 const {p,u,parent}=setup();u('DestroyWindow',parent);for(const h of [0,123,parent])for(const name of ['GetDlgItem','GetDlgCtrlID']){p.setError(1234);assert.equal(u(name,h,0),0);assert.equal(p.lastError,1400);}
});

test('SendDlgItemMessage dispatches synchronously and preserves callback arguments/results',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,0xffffffff);u('SetWindowLongA',child,-4,12345);for(const suffix of ['A','W']){p.setError(1234);const result=u('SendDlgItemMessage'+suffix,parent,-1,0x401,0xabcdef01,0x87654321);assert.equal(result.call.address,12345);assert.deepEqual(result.call.args,[child,0x401,0xabcdef01,0x87654321]);assert.equal(result.then(77),77);assert.equal(p.lastError,1234);assert.equal(p.messageQueue.length,0);}
});
test('SendDlgItemMessage validates parent/control before interpreting message pointers',()=>{
 const {p,u,parent}=setup();for(const suffix of ['A','W'])for(const h of [parent,0,123]){p.setError(1234);assert.equal(u('SendDlgItemMessage'+suffix,h,999,12,0,0xffffffff),0);assert.equal(p.lastError,h===parent?1421:1400);}
});
test('SendDlgItemMessage shares ANSI/Unicode text conversion with SendMessage',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7),m=p.memory,input=p.heap.alloc(32),output=p.heap.alloc(32);m.string(input,'Caf\u00e9',true,16);assert.equal(u('SendDlgItemMessageW',parent,7,12,0,input),1);assert.equal(u('SendDlgItemMessageA',parent,7,13,16,output),4);assert.equal(p.apis.str(output,false),'Caf\u00e9');u('SetWindowLongA',child,-4,12345);const result=u('SendDlgItemMessageW',parent,7,12,0,input);assert.equal(result.call.args[0],child);assert.equal(p.apis.str(result.call.args[3],false),'Caf\u00e9');assert.equal(result.then(19),19);
});
