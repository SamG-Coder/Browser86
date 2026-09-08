import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
import {VirtualFileSystem,fileMetadata,fileTimeFromMs} from '../src/runtime/vfs.js';
import {exportPackage,decodePackage} from '../src/backup.js';
import {readZip} from '../src/runtime/zip.js';

const INVALID=0xFFFFFFFF;
function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args);
  const str=(s,w=false)=>p.heap.string(s,w),name=str('meta.bin'),out=p.heap.alloc(1024,true);
  const h=call('CreateFileA',name,0xC0000000,7,0,2,0,0);
  const put=(ptr,n)=>{m.w32(ptr,Number(n&0xFFFFFFFFn));m.w32(ptr+4,Number(n>>32n));};
  const get=ptr=>BigInt(m.u32(ptr))|(BigInt(m.u32(ptr+4))<<32n);
  const times=[132537600000000001n,132537600000000123n,132537600000009999n];
  times.forEach((n,i)=>put(out+i*8,n));
  assert.equal(call('SetFileTime',h,out,out+8,out+16),1);
  return {p,m,call,str,name,out,h,put,get,times};
}

test('Win32 metadata: exact independent FILETIMEs, write updates and zero/no-change sentinels',t=>{
  const {p,m,call,h,out,get,times}=setup(),originalId=p.vfs.get('meta.bin').id;
  assert.equal(call('GetFileTime',h,out+32,out+40,out+48),1);
  assert.deepEqual([32,40,48].map(i=>get(out+i)),times);
  m.fill(out+64,8);assert.equal(call('SetFileTime',h,out+64,0,out+64),1);
  assert.deepEqual(p.vfs.get('meta.bin').times,{creation:String(times[0]),access:String(times[1]),write:String(times[2])});
  t.mock.method(Date,'now',()=>1700000000000);
  m.w8(out+64,42);assert.equal(call('WriteFile',h,out+64,1,out+72,0),1);
  assert.equal(p.vfs.get('meta.bin').id,originalId);
  assert.equal(p.vfs.get('meta.bin').times.creation,String(times[0]));
  assert.equal(p.vfs.get('meta.bin').times.write,fileTimeFromMs(1700000000000));
  assert.equal(p.vfs.get('meta.bin').times.access,fileTimeFromMs(1700000000000));
});

test('Win32 metadata: BY_HANDLE_FILE_INFORMATION and A/W attributes/find data agree on layout and times',()=>{
  const {p,m,call,h,out,get,times,name,str}=setup();
  assert.equal(call('SetFileAttributesA',name,0x26),1);
  m.fill(out+32,56,0xCC);assert.equal(call('GetFileInformationByHandle',h,out+32),1);
  assert.equal(m.u32(out+32),0x26);assert.deepEqual([36,44,52].map(i=>get(out+i)),times);
  assert.equal(m.u32(out+60),0xB8600001);assert.equal(m.u32(out+64),0);assert.equal(m.u32(out+68),0);
  assert.equal(m.u32(out+72),1);assert.equal(m.u32(out+76),0);assert.equal(m.u32(out+80),p.vfs.get('meta.bin').id);
  assert.equal(m.u32(out+84),0xCCCCCCCC);
  for(const wide of [false,true]){
    const suffix=wide?'W':'A',path=str('META.BIN',wide);
    assert.equal(call('GetFileAttributes'+suffix,path),0x26);
    assert.equal(call('GetFileAttributesEx'+suffix,path,0,out+96),1);
    assert.deepEqual([100,108,116].map(i=>get(out+i)),times);
    const search=call('FindFirstFile'+suffix,path,out+160);assert.notEqual(search,INVALID);
    assert.equal(m.u32(out+160),0x26);assert.deepEqual([164,172,180].map(i=>get(out+i)),times);call('FindClose',search);
  }
});

test('Win32 metadata: timestamp suppression follows the shared file object but not independent opens',t=>{
  const {p,m,call,h,out,put,times,name}=setup();put(out+32,0xFFFFFFFFFFFFFFFFn);
  assert.equal(call('SetFileTime',h,0,out+32,out+32),1);
  assert.equal(call('DuplicateHandle',INVALID,h,INVALID,out+48,0,0,2),1);const alias=m.u32(out+48);
  t.mock.method(Date,'now',()=>1800000000000);
  assert.equal(call('WriteFile',alias,out,1,out+56,0),1);
  assert.equal(call('SetFilePointer',h,0,0,0),0);assert.equal(call('ReadFile',h,out+64,1,out+56,0),1);
  assert.equal(p.vfs.get('meta.bin').times.write,String(times[2]));assert.equal(p.vfs.get('meta.bin').times.access,String(times[1]));
  const other=call('CreateFileA',name,0xC0000000,7,0,3,0,0);assert.notEqual(other,INVALID);
  assert.equal(call('WriteFile',other,out,1,out+56,0),1);
  assert.equal(p.vfs.get('meta.bin').times.write,fileTimeFromMs(1800000000000));
});

test('Win32 metadata: readonly attributes deny new writes/deletes, normalize NORMAL and preserve directory type',()=>{
  const {p,call,str,name,out,get,times}=setup();
  assert.equal(call('SetFileAttributesW',str('meta.bin',true),0x83),1);assert.equal(call('GetFileAttributesA',name),3);
  assert.equal(call('CreateFileA',name,0x40000000,7,0,3,0,0),INVALID);assert.equal(call('GetLastError'),5);
  assert.equal(call('DeleteFileA',name),0);assert.equal(call('GetLastError'),5);
  assert.equal(call('SetFileAttributesA',name,128),1);assert.equal(call('GetFileAttributesA',name),128);
  p.vfs.mkdir('folder');const directory=str('folder');
  assert.equal(call('CreateFileA',directory,0x80000000,7,0,3,0,0),INVALID);
  const h=call('CreateFileA',directory,0x80000100,7,0,3,0x02000000,0);assert.notEqual(h,INVALID);
  assert.equal(call('SetFileTime',h,out,0,out+16),1);
  assert.equal(call('GetFileInformationByHandle',h,out+64),1);assert.equal(get(out+68),times[0]);assert.equal(get(out+84),times[2]);
  assert.equal(call('SetFileAttributesA',directory,128),1);assert.equal(call('GetFileAttributesA',directory),16);
});

test('Win32 metadata: IDs survive writes and shared-handle rename, copies and recreated files get new IDs',()=>{
  const {p,m,call,str,name,h,out}=setup(),id=p.vfs.get('meta.bin').id;
  assert.equal(call('WriteFile',h,out,1,out+64,0),1);assert.equal(p.vfs.get('meta.bin').id,id);
  assert.equal(call('MoveFileA',name,str('renamed.bin')),1);
  assert.equal(call('GetFileInformationByHandle',h,out+64),1);assert.equal(m.u32(out+112),id);
  assert.equal(call('CopyFileA',str('renamed.bin'),name,1),1);assert.notEqual(p.vfs.get('meta.bin').id,id);
  assert.equal(p.vfs.get('meta.bin').times.write,p.vfs.get('renamed.bin').times.write);
  const copyId=p.vfs.get('meta.bin').id;assert.equal(call('DeleteFileA',name),1);
  assert.notEqual(call('CreateFileA',name,0x40000000,7,0,1,0,0),INVALID);assert.notEqual(p.vfs.get('meta.bin').id,copyId);
});

test('Win32 metadata: access checks and invalid input/output buffers are atomic',()=>{
  const {p,m,call,name,out,h,put}=setup();
  const reader=call('CreateFileA',name,0x80000000,7,0,3,0,0);
  assert.equal(call('SetFileTime',reader,out,0,0),0);assert.equal(call('GetLastError'),5);
  const setter=call('CreateFileA',name,0x100,7,0,3,0,0);assert.equal(call('SetFileTime',setter,out,0,0),1);
  assert.equal(call('GetFileTime',setter,out,0,0),0);assert.equal(call('GetLastError'),5);
  const saved=fileMetadata(p.vfs.get('meta.bin'));put(out,99n);
  assert.throws(()=>call('SetFileTime',h,out,1,0),e=>e.code==='ACCESS_VIOLATION');assert.deepEqual(fileMetadata(p.vfs.get('meta.bin')),saved);
  m.w32(out+64,0x12345678);
  assert.throws(()=>call('GetFileTime',h,out+64,1,0),e=>e.code==='ACCESS_VIOLATION');assert.equal(m.u32(out+64),0x12345678);
  assert.equal(call('GetFileInformationByHandle',0,out),0);assert.equal(call('GetLastError'),6);
  assert.equal(call('GetFileInformationByHandle',h,0),0);assert.equal(call('GetLastError'),87);
  assert.equal(call('SetFileAttributesA',name,0x800),0);assert.equal(call('GetLastError'),87);
  assert.deepEqual(fileMetadata(p.vfs.get('meta.bin')),saved);
});

test('VFS metadata: snapshot and backup ZIP preserve IDs, exact FILETIMEs and attributes without aliasing',async()=>{
  const {p,call,name}=setup();call('SetFileAttributesA',name,3);
  const expected=fileMetadata(p.vfs.get('meta.bin')),snapshot=p.vfs.snapshot();
  const copy=new VirtualFileSystem(snapshot);assert.deepEqual(fileMetadata(copy.get('meta.bin')),expected);
  const zip=exportPackage({name:'metadata',entries:snapshot});
  const decoded=decodePackage(await readZip(zip)),restored=new VirtualFileSystem(decoded.entries);
  assert.deepEqual(fileMetadata(restored.get('meta.bin')),expected);
  copy.setMetadata('meta.bin',{times:{creation:'1'},attributes:128});
  assert.deepEqual(fileMetadata(p.vfs.get('meta.bin')),expected);
  assert.deepEqual(fileMetadata(new VirtualFileSystem(snapshot).get('meta.bin')),expected);
  restored.writeFile('new.bin',new Uint8Array());assert.ok(restored.get('new.bin').id>expected.id);
});

test('VFS metadata: old backups remain readable and malformed/duplicate metadata is rejected',async()=>{
  const v=new VirtualFileSystem([{path:'legacy.bin',data:Uint8Array.of(5),mtime:1234567890000}]);
  assert.equal(v.get('legacy.bin').times.write,fileTimeFromMs(1234567890000));
  const entries=await readZip(exportPackage({entries:v.snapshot()}));
  const marker=entries.find(e=>e.path==='browser86-backup.json'),original=JSON.parse(new TextDecoder().decode(marker.data));
  const replace=manifest=>{marker.data=new TextEncoder().encode(JSON.stringify(manifest));return decodePackage(entries);};
  const old={...original};delete old.fileMetadata;
  assert.deepEqual(new VirtualFileSystem(replace(old).entries).readFile('legacy.bin'),Uint8Array.of(5));
  const bad=structuredClone(original);bad.fileMetadata[0].times.write='18446744073709551616';
  assert.throws(()=>replace(bad),e=>e.code==='VFS_METADATA');
  const attrs=structuredClone(original);attrs.fileMetadata[0].attributes=0x100000010;
  assert.throws(()=>replace(attrs),e=>e.code==='VFS_METADATA');
  const duplicate=structuredClone(original);duplicate.fileMetadata.push(duplicate.fileMetadata[0]);
  assert.throws(()=>replace(duplicate),e=>e.code==='BACKUP_METADATA');
  const snapshot=v.snapshot();snapshot[1].id=snapshot[0].id;
  assert.throws(()=>new VirtualFileSystem(snapshot),e=>e.code==='VFS_METADATA');
  const large=new VirtualFileSystem([{...v.snapshot().find(e=>e.path.endsWith('legacy.bin')),id:0xFFFFFFFF}]);
  large.writeFile('new.bin',new Uint8Array());assert.notEqual(large.get('new.bin').id,0xFFFFFFFF);
  assert.ok(exportPackage({entries:large.snapshot()}).length);
});
