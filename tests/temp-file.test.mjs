import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';

function setup(){
  const {p}=guest('HelloConsole.exe'),m=p.memory;
  const call=(name,...args)=>p.apis.lookup('kernel32.dll',name).fn(...args),str=(s,w=false)=>p.heap.string(s,w),out=p.heap.alloc(1024,true);
  p.tempFileCounter=0x20;
  const temp=(path='C:\\Temp',pre='prefix',unique=0,wide=false,ptr=out)=>call('GetTempFileName'+(wide?'W':'A'),str(path,wide),str(pre,wide),unique,ptr);
  return {p,m,call,str,out,temp};
}
test('Win32 temporary names: automatic names reserve empty files, skip collisions and wrap the numeric range',()=>{
  const {p,m,out,temp}=setup();p.vfs.writeFile('C:/Temp/pre20.tmp',Uint8Array.of(7));p.vfs.mkdir('C:/Temp/pre21.tmp');
  assert.equal(temp(),0x22);assert.equal(m.cstr(out),'C:\\Temp\\pre22.tmp');assert.equal(p.vfs.readFile(m.cstr(out)).length,0);
  assert.deepEqual([...p.vfs.readFile('C:/Temp/pre20.tmp')],[7]);assert.equal(temp(),0x23);
  p.tempFileCounter=65535;assert.equal(temp(),65535);assert.equal(temp(),1);
  assert.equal(p.vfs.snapshot().some(e=>e.path==='C:/Temp/pre22.tmp'),true);
});
test('Win32 temporary names: explicit low-word values generate only names; a zero low word reserves a file',()=>{
  const {p,m,out,temp}=setup(),revision=p.vfs.revision;
  assert.equal(temp('.', 'abcdef',0x12345,true),0x2345);assert.equal(m.wstr(out),'.\\abc2345.tmp');assert.equal(p.vfs.revision,revision);
  p.vfs.writeFile('abc2345.tmp',Uint8Array.of(9));assert.equal(temp('.','abcdef',0x12345,true),0x2345);assert.deepEqual([...p.vfs.readFile('abc2345.tmp')],[9]);
  assert.equal(temp('C:\\Temp','',0x10000),0x20);assert.equal(m.cstr(out),'C:\\Temp\\20.tmp');assert.equal(p.vfs.exists(m.cstr(out)),true);
});
test('Win32 temporary names: A/W prefixes, relative directories and returned paths reopen within the guest',()=>{
  const {p,m,call,str,out,temp}=setup();p.vfs.mkdir('folder');
  assert.equal(temp('folder','ΩxyZ',0,true),0x20);assert.equal(m.wstr(out),'folder\\Ωxy20.tmp');
  const file=call('CreateFileW',out,0x80000000,7,0,3,0,0);assert.notEqual(file,0xffffffff);call('CloseHandle',file);
  assert.equal(call('DeleteFileW',out),1);assert.equal(p.vfs.exists('folder/Ωxy20.tmp'),false);
  temp('C:\\Temp\\','€xyZ',7);assert.equal(m.cstr(out),'C:\\Temp\\€xy7.tmp');
});
test('Win32 temporary names: missing or pending directories, length and inaccessible output leave the disk unchanged',()=>{
  const {p,m,call,str,out,temp}=setup();p.vfs.writeFile('plain',Uint8Array.of(1));
  for(const path of ['absent','plain']){assert.equal(temp(path),0);assert.equal(call('GetLastError'),267);}
  const long='C:/'+('x'.repeat(244));p.vfs.mkdir(long);assert.equal(temp(long),0);assert.equal(call('GetLastError'),111);
  p.vfs.mkdir('pending');const directory=call('CreateFileA',str('pending'),0x10000,7,0,3,0x02000000,0);m.w8(out,1);call('SetFileInformationByHandle',directory,4,out,1);
  assert.equal(temp('pending'),0);assert.equal(call('GetLastError'),5);
  const before=p.vfs.snapshot();assert.throws(()=>temp('C:\\Temp','pre',0,false,0x60000000),e=>e.code==='ACCESS_VIOLATION');assert.deepEqual(p.vfs.snapshot(),before);
  assert.equal(temp('C:\\Temp','pre',0,false,0),0);assert.equal(call('GetLastError'),87);
});
