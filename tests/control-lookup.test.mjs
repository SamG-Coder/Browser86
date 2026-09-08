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

test('Dialog text APIs set, truncate, terminate and clear text through control messages',()=>{
 const {p,u,create,parent}=setup(),m=p.memory;create(parent,7);const input=p.heap.alloc(32),out=p.heap.alloc(32);m.string(input,'Caf\u00e9',true,16);
 for(const suffix of ['A','W']){assert.equal(u('SetDlgItemTextW',parent,7,input),1);m.fill(out,32,88);p.setError(1234);assert.equal(u('GetDlgItemText'+suffix,parent,7,out,3),2);assert.equal(p.apis.str(out,suffix==='W'),'Ca');assert.equal(m.u8(out+3*(suffix==='W'?2:1)),88);assert.equal(p.lastError,1234);assert.equal(u('SetDlgItemText'+suffix,parent,7,0),1);assert.equal(u('GetDlgItemText'+suffix,parent,7,out,8),0);assert.equal(p.apis.str(out,suffix==='W'),'');}
});
test('Dialog text queries initialize output on lookup failure but leave zero capacity untouched',()=>{
 const {p,u,parent}=setup(),m=p.memory,out=p.heap.alloc(16);for(const suffix of ['A','W'])for(const cap of [0,1,8])for(const h of [parent,0]){m.fill(out,16,88);assert.equal(u('GetDlgItemText'+suffix,h,99,out,cap),0);assert.equal(p.lastError,h?1421:1400);assert.equal(m.u8(out),cap?0:88);assert.equal(m.u8(out+1),cap&&suffix==='W'?0:88);assert.equal(m.u8(out+2),88);}
});
test('Dialog text callbacks see initialized buffers and setters normalize callback results',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7),m=p.memory,out=p.heap.alloc(16);u('SetWindowLongA',child,-4,12345);m.fill(out,16,88);assert.equal(u('GetDlgItemTextA',parent,7,out,0),0);assert.equal(m.u8(out),88);const get=u('GetDlgItemTextA',parent,7,out,8);assert.deepEqual(get.call.args,[child,13,8,out]);assert.equal(m.u8(out),0);m.string(out,'abc',false,8);assert.equal(get.then(3),3);for(const result of [0,7,-1])assert.equal(u('SetDlgItemTextA',parent,7,0).then(result),result?1:0);
});
test('Dialog text rejects invalid guest output ranges and leaves unsupported negative capacity explicit',()=>{
 const {u,parent}=setup();assert.throws(()=>u('GetDlgItemTextW',parent,99,0xffffffff,1));assert.throws(()=>u('GetDlgItemTextA',parent,99,0,-1),/Negative dialog-text/);assert.equal(u('SetDlgItemTextW',parent,99,0xffffffff),0);
});

test('SetDlgItemInt formats unsigned and signed values including the native minimum-value quirk',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7);for(const [value,signed,expected] of [[0,0,'0'],[2147483647,1,'2147483647'],[2147483648,0,'2147483648'],[2147483648,1,'-0'],[0xffffffff,0,'4294967295'],[0xffffffff,2,'-1']]){p.setError(1234);assert.equal(u('SetDlgItemInt',parent,7,value,signed),1);assert.equal(p.apis.gui.window(child).title,expected);assert.equal(p.lastError,1234);}
});
test('SetDlgItemInt supplies correctly encoded callback text and normalizes results',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7);for(const suffix of ['A','W']){u('SetWindowLong'+suffix,child,-4,12345);for(const result of [0,7,-1]){const call=u('SetDlgItemInt',parent,7,0xffffffff,0);assert.deepEqual(call.call.args.slice(0,3),[child,12,0]);assert.equal(p.apis.str(call.call.args[3],suffix==='W'),'4294967295');assert.ok(p.heap.blocks.has(call.call.args[3]));assert.equal(call.then(result),result?1:0);assert.equal(p.heap.blocks.has(call.call.args[3]),false);}}
});
test('SetDlgItemInt rejects missing controls and invalid or destroyed parents',()=>{
 const {p,u,parent}=setup();assert.equal(u('SetDlgItemInt',parent,99,1,1),0);assert.equal(p.lastError,1421);u('DestroyWindow',parent);for(const h of [0,123,parent]){assert.equal(u('SetDlgItemInt',h,99,1,1),0);assert.equal(p.lastError,1400);}
});

test('GetDlgItemInt separates parsed prefixes from complete translation and checks numeric bounds',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7),flag=p.heap.alloc(4);for(const [text,signed,value,ok] of [['',0,0,0],['0',0,0,1],[' 12x',1,12,0],['12 ',0,12,0],['+12',1,0,0],['\t12',1,0,0],['-1',0,0,0],[' -1',2,0xffffffff,1],['2147483648',1,0,0],['-2147483648',1,0x80000000,0],['-2147483649',1,0,0],['4294967295',0,0xffffffff,1],['4294967296',0,0,0],['0'.repeat(100)+'7',0,0,1]]){p.apis.gui.window(child).title=text;p.setError(1234);p.memory.w32(flag,123);assert.equal(u('GetDlgItemInt',parent,7,flag,signed),value,text);assert.equal(p.memory.u32(flag),ok,text);assert.equal(p.lastError,1234);assert.equal(u('GetDlgItemInt',parent,7,0,signed),value);}
});
test('GetDlgItemInt queries callbacks synchronously with native capacity and releases temporary buffers',()=>{
 const {p,u,create,parent}=setup(),child=create(parent,7),flag=p.heap.alloc(4),m=p.memory;u('SetWindowLongW',child,-4,12345);m.w32(flag,123);const result=u('GetDlgItemInt',parent,7,flag,1),buffer=result.call.args[3];assert.deepEqual(result.call.args.slice(0,3),[child,13,47]);assert.equal(m.u32(flag),0);m.string(buffer,'-42',true,47);assert.equal(result.then(3),0xffffffd6);assert.equal(m.u32(flag),1);assert.equal(p.heap.blocks.has(buffer),false);
});
test('GetDlgItemInt clears translation status for invalid targets and checks status output',()=>{
 const {p,u,parent}=setup(),flag=p.heap.alloc(4);for(const h of [parent,0,123]){p.memory.w32(flag,123);assert.equal(u('GetDlgItemInt',h,99,flag,1),0);assert.equal(p.memory.u32(flag),0);assert.equal(p.lastError,h===parent?1421:1400);}assert.throws(()=>u('GetDlgItemInt',parent,99,0xffffffff,1));
});
