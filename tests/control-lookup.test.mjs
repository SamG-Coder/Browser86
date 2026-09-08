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
