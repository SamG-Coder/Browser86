import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('VCRUNTIME memory and string exports retain cdecl behavior and shared implementations',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory;assert.equal(p.apis.isSystemModule('vcruntime140.dll'),true);
  for(const name of ['memcpy','memmove','memset','strchr','wcschr','wcsrchr']){const f=p.apis.lookup('vcruntime140.dll',name);assert.equal(f.cdecl,true);assert.equal(f.fn,p.apis.lookup('msvcrt.dll',name).fn);}
  const b=p.heap.string('abcdef');p.apis.lookup('vcruntime140.dll','memmove').fn(b+1,b,5);assert.equal(m.cstr(b),'aabcde');
  assert.equal(p.apis.lookup('vcruntime140.dll','_CxxThrowException'),undefined);
});
test('WinMain command line skips only the program name and leading argument whitespace',()=>{
  for(const args of ['', '  "two words"  /flag  ']){const {p}=guest('HelloConsole.exe',{args}),fn=p.apis.lookup('msvcrt.dll','_get_narrow_winmain_command_line').fn,address=fn();assert.equal(p.memory.cstr(address),args.trimStart());assert.equal(fn(),address);assert.ok(address>=p.commandA);}
});
