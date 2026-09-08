import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Shell app-data PIDL resolves inside the virtual disk and can be freed through IMalloc',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,s=(n,...a)=>p.apis.lookup('shell32.dll',n).fn(...a),out=p.heap.alloc(4),text=p.heap.alloc(520);
  assert.equal(s('SHGetSpecialFolderLocation',0,0x1a,out),0);const pidl=m.u32(out);assert.equal(s('SHGetPathFromIDListW',pidl,text),1);assert.equal(m.wstr(text),'C:\\Users\\Browser\\AppData\\Roaming');assert.ok(p.vfs.exists('C:/Users/Browser/AppData/Roaming'));
  assert.equal(s('SHGetMalloc',out),0);const obj=m.u32(out),vt=m.u32(obj),invoke=(slot,...args)=>p.apis.traps.get(m.u32(vt+slot*4)).fn(obj,...args);
  assert.equal(invoke(7,pidl),1);invoke(5,pidl);assert.equal(invoke(7,pidl),0);assert.equal(s('SHGetPathFromIDListW',pidl,text),0);
  const a=invoke(3,24);m.w32(a,123);const b=invoke(4,a,100);assert.equal(m.u32(b),123);assert.ok(invoke(6,b)>=100);invoke(5,b);
  assert.equal(s('SHGetSpecialFolderLocation',0,0xfe,out),0x80070057);assert.equal(m.u32(out),0);
});
