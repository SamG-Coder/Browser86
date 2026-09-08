import test from 'node:test';
import assert from 'node:assert/strict';
import {guest} from './helpers.mjs';
test('UCRT narrow argument setup exposes parsed strings and a null terminator',()=>{
  const {p}=guest('HelloConsole.exe',{args:'"two words" plain ""'}),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a);
  assert.equal(c('_configure_narrow_argv',1),0);const argc=m.u32(c('__p___argc')),argv=m.u32(c('__p___argv'));
  assert.equal(argc,4);assert.deepEqual(Array.from({length:argc-1},(_,i)=>m.cstr(m.u32(argv+4+i*4))),['two words','plain','']);assert.equal(m.u32(argv+argc*4),0);
  assert.equal(c('_configure_narrow_argv',0),0);assert.equal(c('_configure_narrow_argv',99),22);assert.equal(m.u32(c('_errno')),22);assert.throws(()=>c('_configure_narrow_argv',2),{code:'CRT_ARGV'});
});
test('Initial narrow environment remains a stable startup snapshot',()=>{
  const {p}=guest('HelloConsole.exe'),m=p.memory,c=(n,...a)=>p.apis.lookup('msvcrt.dll',n).fn(...a);
  assert.equal(c('_initialize_narrow_environment'),0);const env=c('_get_initial_narrow_environment');assert.equal(env,m.u32(c('__p__environ')));
  const values=[];for(let a=env;m.u32(a);a+=4)values.push(m.cstr(m.u32(a)));assert.ok(values.includes('BROWSER86=1'));
  c('_putenv',p.heap.string('BROWSER86=changed'));assert.equal(c('_get_initial_narrow_environment'),env);assert.equal(m.cstr(c('getenv',p.heap.string('BROWSER86'))),'changed');assert.ok(values.includes('BROWSER86=1'));
});
