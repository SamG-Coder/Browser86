import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('Wide CRT paths support mkdir, fopen and binary round trips',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a),w=x=>p.heap.string(x,true),dir=w('C:/Temp/\u03a9');
  assert.equal(c('_wmkdir',dir),0);assert.equal(c('_wmkdir',dir),-1);assert.equal(m.u32(c('_errno')),17);
  const name=w('C:/Temp/\u03a9/file.bin'),h=c('_wfopen',name,w('wb')),bytes=p.heap.string('abc');assert.ok(h);assert.equal(c('fwrite',bytes,1,3,h),3);c('fclose',h);
  const r=c('_wfopen',name,w('rb')),out=p.heap.alloc(4,true);assert.equal(c('fread',out,1,4,r),3);assert.equal(m.cstr(out),'abc');assert.equal(c('feof',r),1);c('fclose',r);
});
test('UCRT wide printf consumes va_list and preserves Unicode paths and buffer boundaries',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a),out=p.heap.alloc(100),args=p.heap.alloc(8),fmt=p.heap.string('%ls/%d',true);m.w32(args,p.heap.string('\u03a9',true));m.w32(args+4,42);
  assert.equal(c('__stdio_common_vswprintf',36,0,out,50,fmt,0,args),4);assert.equal(m.wstr(out),'\u03a9/42');m.fill(out,100,0xa5);
  assert.equal(c('__stdio_common_vswprintf',6,0,out,3,fmt,0,args),4);assert.equal(m.wstr(out),'\u03a9/');assert.equal(m.u8(out+6),0xa5);
});
test('fgets translates CRLF in text mode and reports EOF without overwriting the next buffer',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a);p.vfs.writeFile('C:/Temp/lines.txt',new TextEncoder().encode('one\r\ntwo'));
  const h=c('fopen',p.heap.string('C:/Temp/lines.txt'),p.heap.string('r')),out=p.heap.alloc(20);assert.equal(c('fgets',out,20,h),out);assert.equal(m.cstr(out),'one\n');assert.equal(c('feof',h),0);
  assert.equal(c('fgets',out,20,h),out);assert.equal(m.cstr(out),'two');assert.equal(c('feof',h),1);assert.equal(c('fgets',out,20,h),0);assert.equal(m.cstr(out),'two');
});
