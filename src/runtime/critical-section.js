import {RuntimeFault} from './errors.js';
import {checkBuffer} from './files.js';

export function installCriticalSections(api){
  const p=api.p,m=api.m,initialized=new Set(),k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const check=address=>{
    if(!initialized.has(address))throw new RuntimeFault('CRITICAL_SECTION','Critical section was not initialized.');
    checkBuffer(m,address,24);
  };
  const initialize=(address,flags=0)=>{
    if(flags&~0x01000000)return api.fail(87);
    checkBuffer(m,address,24);
    if(initialized.has(address))throw new RuntimeFault('CRITICAL_SECTION','Delete a critical section before reinitializing it.');
    m.fill(address,24);m.w32(address,0xffffffff);m.w32(address+4,0xffffffff);initialized.add(address);return 1;
  };
  const enter=(address,tryOnly)=>{
    check(address);const owner=m.u32(address+12),depth=m.i32(address+8);
    if(owner&&owner!==8){if(tryOnly)return 0;throw new RuntimeFault('UNSUPPORTED_SYNC','A critical section names an unsupported guest thread.');}
    if(depth<0||depth===0x7fffffff)throw new RuntimeFault('CRITICAL_SECTION','Invalid critical-section recursion count.');
    m.w32(address+4,0xfffffffe);m.w32(address+8,depth+1);m.w32(address+12,8);return tryOnly?1:0;
  };
  k('InitializeCriticalSection',1,address=>{initialize(address);return 0;});
  k('InitializeCriticalSectionAndSpinCount',2,(address,spin)=>initialize(address));
  k('InitializeCriticalSectionEx',3,(address,spin,flags)=>initialize(address,flags));
  k('SetCriticalSectionSpinCount',2,(address,spin)=>{check(address);const previous=m.u32(address+20);m.w32(address+20,0);return previous;});
  k('EnterCriticalSection',1,address=>enter(address,false));
  k('TryEnterCriticalSection',1,address=>enter(address,true));
  k('LeaveCriticalSection',1,address=>{
    check(address);const depth=m.i32(address+8);
    if(depth<=0||m.u32(address+12)!==8)throw new RuntimeFault('CRITICAL_SECTION','Unbalanced or unowned LeaveCriticalSection.');
    m.w32(address+8,depth-1);if(depth===1){m.w32(address+4,0xffffffff);m.w32(address+12,0);}return 0;
  });
  k('DeleteCriticalSection',1,address=>{
    check(address);if(m.u32(address+8))throw new RuntimeFault('CRITICAL_SECTION','Cannot delete an owned critical section.');
    initialized.delete(address);m.fill(address,24);return 0;
  });
}
