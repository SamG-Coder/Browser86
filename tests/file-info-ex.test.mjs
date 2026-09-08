import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const str=(s,wide=false)=>p.heap.string(s,wide),out=p.heap.alloc(1024,true),name=str('query.bin');
  const h=call('CreateFileA',name,0xC0000000,7,0,2,0,0);
  const query=(cls,ptr=out,size=256,handle=h)=>call('GetFileInformationByHandleEx',handle,cls,ptr,size);
  const u64=ptr=>BigInt(m.u32(ptr))|(BigInt(m.u32(ptr+4))<<32n);
  return {p,m,call,str,out,name,h,query,u64};
}

test('Win32 extended info: standard layout follows size changes and pending deletion without moving the cursor',()=>{
  const {p,m,call,out,name,h,query,u64}=setup();m.w32(out,0x04030201);
  assert.equal(call('WriteFile',h,out,4,out+64,0),1);
  m.fill(out,32,0xcc);assert.equal(query(1,out,32),1);
  assert.equal(u64(out),4n);assert.equal(u64(out+8),4n);assert.equal(m.u32(out+16),1);
  assert.equal(m.u32(out+20),0);assert.equal(m.u32(out+24),0xcccccccc);
  call('SetFilePointer',h,2,0,0);call('SetEndOfFile',h);
  assert.equal(query(1),1);assert.equal(u64(out+8),2n);assert.equal(p.object(h).position,2n);
  call('DeleteFileA',name);assert.equal(query(1),1);assert.equal(m.u8(out+20),1);
  assert.equal(m.u32(out+16),0);
  assert.equal(m.u8(out+21),0);assert.equal(u64(out+8),2n);
  assert.equal(call('GetFileInformationByHandle',h,out),1);assert.equal(m.u32(out+40),0);
});

test('Win32 extended info: file IDs and attributes agree across independent opens, duplication and rename',()=>{
  const {p,m,call,str,out,name,h,query,u64}=setup();
  const other=call('CreateFileA',name,0,7,0,3,0,0);
  assert.equal(query(18,out,24,other),1);assert.equal(u64(out),0xB8600001n);
  assert.equal(m.u32(out+8),p.object(h).node.id);assert.deepEqual([...m.read(out+12,12)],Array(12).fill(0));
  const id=m.read(out,24);call('DuplicateHandle',0xffffffff,h,0xffffffff,out+64,0,0,2);
  const alias=m.u32(out+64);call('MoveFileW',str('query.bin',true),str('renamed.bin',true));
  assert.equal(query(18,out,24,alias),1);assert.deepEqual(m.read(out,24),id);
  call('SetFileAttributesA',str('renamed.bin'),6);
  assert.equal(query(9,out,8,other),1);assert.equal(m.u32(out),6);assert.equal(m.u32(out+4),0);
});

test('Win32 extended info: UTF-16 names have byte lengths, partial output and no added terminator',()=>{
  const {m,call,str,out,name,h,query}=setup();
  const expected='\\app\\😀-renamed.bin';call('MoveFileW',str('query.bin',true),str('😀-renamed.bin',true));
  m.fill(out,256,0xcc);assert.equal(query(2,out,9),0);assert.equal(call('GetLastError'),234);
  assert.equal(m.u32(out),expected.length*2);assert.equal(m.u16(out+4),92);assert.equal(m.u16(out+6),97);
  assert.equal(m.u8(out+8),0xcc);
  const size=4+expected.length*2;assert.equal(query(2,out,size),1);
  assert.equal(String.fromCharCode(...Array.from({length:expected.length},(_,i)=>m.u16(out+4+i*2))),expected);
  assert.equal(m.u16(out+size),0xcccc);
  call('DeleteFileW',str('😀-renamed.bin',true));assert.equal(query(2,out,size),1);
});

test('Win32 extended info: metadata-only directory handles return directory flag and stable root names',()=>{
  const {p,m,call,str,out,query,u64}=setup();p.vfs.mkdir('folder');
  const directory=call('CreateFileA',str('folder'),0,7,0,3,0x02000000,0);
  assert.equal(query(1,out,24,directory),1);assert.equal(u64(out+8),0n);assert.equal(m.u8(out+21),1);
  assert.equal(query(9,out,8,directory),1);assert.equal(m.u32(out),16);
  const root=call('CreateFileA',str('C:/'),0,7,0,3,0x02000000,0);
  assert.equal(query(2,out,8,root),1);assert.equal(m.u32(out),2);assert.equal(m.u16(out+4),92);
});

test('Win32 extended info: invalid handles/classes and short buffers return precise errors without output mutation',()=>{
  const {m,call,out,query}=setup();m.fill(out,64,0xcc);
  for(const [cls,size] of [[1,23],[2,7],[9,7],[18,23]]){
    assert.equal(query(cls,out,size),0);assert.equal(call('GetLastError'),24);
    assert.deepEqual([...m.read(out,64)],Array(64).fill(0xcc));
  }
  assert.equal(query(1,out,24,11),0);assert.equal(call('GetLastError'),6);
  assert.equal(query(1,0,24),0);assert.equal(call('GetLastError'),87);
  for(const cls of [3,4,5,6,12,21,22,25,0xffffffff]){assert.equal(query(cls),0);assert.equal(call('GetLastError'),87);}
  for(const cls of [0,7,10,16,24])assert.throws(()=>query(cls),e=>e.code==='UNSUPPORTED_FILE_INFO'&&e.detail.infoClass===cls);
});

test('Win32 extended info: cross-page output validation is atomic and oversized buffers do not require unused pages',()=>{
  const {m,out,query}=setup();const page=0x60000000;m.map(page,4096,'rw','query test');m.fill(page,4096,0xcc);
  for(const cls of [1,2,9,18]){
    assert.throws(()=>query(cls,page+4092,256),e=>e.code==='ACCESS_VIOLATION');
    assert.equal(m.u32(page+4092),0xcccccccc);
  }
  assert.equal(query(9,page+4088,0xffffffff),1);
  m.protect(page,4096,'r');assert.throws(()=>query(9,page,8),e=>e.code==='ACCESS_VIOLATION');
});
