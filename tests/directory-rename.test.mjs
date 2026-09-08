import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=(s,w=false)=>p.heap.string(s,w),out=p.heap.alloc(512,true);
  p.vfs.writeFile('tree/nested/file.bin',Uint8Array.of(1,2,3));
  const h=call('CreateFileA',str('tree'),0x10000,7,0,3,0x02000000,0);
  const rename=(text,replace=false)=>{
    m.fill(out,512);m.w8(out,replace?1:0);m.w32(out+8,text.length*2);
    for(let i=0;i<text.length;i++)m.w16(out+12+i*2,text.charCodeAt(i));
    return call('SetFileInformationByHandle',h,3,out,Math.max(16,12+text.length*2));
  };
  return {p,m,call,str,out,h,rename};
}
test('Win32 directory rename: subtree identities, timestamps, bytes and root handles survive both APIs',()=>{
  const {p,call,str,h,rename}=setup(),node=p.object(h).node,child=p.vfs.get('tree/nested/file.bin'),times={...child.times},bytes=p.vfs.bytes;
  assert.equal(rename('C:/Temp/🌳'),1);assert.equal(node.path,'C:/Temp/🌳');
  assert.equal(p.vfs.get('C:/Temp/🌳/nested/file.bin'),child);assert.equal(p.vfs.exists('tree'),false);
  assert.deepEqual(child.times,times);assert.equal(p.vfs.bytes,bytes);
  assert.equal(call('MoveFileW',str('C:/Temp/🌳',true),str('C:/app/TREE',true)),1);
  assert.equal(p.object(h).path,'C:/app/TREE');assert.equal(p.vfs.get('TREE/nested/file.bin'),child);
  assert.equal(rename('Tree'),1);assert.equal(child.path,'C:/app/Tree/nested/file.bin');
});
test('Win32 directory rename: open descendants block moves until final duplicated handle closes',()=>{
  const {p,m,call,str,out,rename}=setup();
  const child=call('CreateFileA',str('tree/nested/file.bin'),0x80000000,7,0,3,0,0);
  call('DuplicateHandle',0xffffffff,child,0xffffffff,out+300,0,0,2);const alias=m.u32(out+300);
  const revision=p.vfs.revision;assert.equal(rename('moved'),0);assert.equal(call('GetLastError'),5);
  call('CloseHandle',child);assert.equal(call('MoveFileA',str('tree'),str('moved')),0);assert.equal(call('GetLastError'),5);
  assert.equal(p.vfs.revision,revision);call('CloseHandle',alias);assert.equal(rename('moved'),1);
});
test('Win32 directory rename: self-descendant, current-directory ancestors and missing parents fail atomically',()=>{
  const {p,call,str,rename}=setup(),before=p.vfs.snapshot();
  assert.equal(rename('tree/nested/new'),0);assert.equal(call('GetLastError'),87);
  assert.equal(rename('missing/tree'),0);assert.equal(call('GetLastError'),3);
  call('SetCurrentDirectoryA',str('tree/nested'));
  assert.equal(rename('C:/Temp/moved'),0);assert.equal(call('GetLastError'),5);
  assert.deepEqual(p.vfs.snapshot(),before);assert.equal(p.vfs.exists('C:/app/missing'),false);
});
test('Win32 directory rename: explicit replacement permits a closed file but never another directory',()=>{
  const {p,call,rename}=setup();p.vfs.mkdir('target');
  assert.equal(rename('target',true),0);assert.equal(call('GetLastError'),5);
  p.vfs.remove('target');p.vfs.writeFile('target',Uint8Array.of(9,8));const bytes=p.vfs.bytes;
  assert.equal(rename('target'),0);assert.equal(call('GetLastError'),183);
  assert.equal(rename('target',true),1);assert.equal(p.vfs.get('target').directory,true);
  assert.deepEqual([...p.vfs.readFile('target/nested/file.bin')],[1,2,3]);assert.equal(p.vfs.bytes,bytes-2);
});
