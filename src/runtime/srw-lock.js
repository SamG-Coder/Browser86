import {RuntimeFault} from './errors.js';
import {checkBuffer} from './files.js';

// x86 SRWLOCK is one opaque pointer-sized word. No contention-list pointers
// are needed by the current single-thread guest scheduler.
export function installSRWLocks(api){
  const p=api.p,m=api.m,k=(name,fn)=>api.add('kernel32.dll',name,1,fn);
  const state=address=>{
    if(address&3)throw new RuntimeFault('SRW_LOCK','SRWLOCK requires pointer alignment.');
    checkBuffer(m,address,4);const value=m.u32(address);
    if(value!==0&&(value&15)!==1)throw new RuntimeFault('SRW_LOCK','Invalid or unsupported SRW lock state.');
    return value;
  };
  k('InitializeSRWLock',address=>{if(address&3)throw new RuntimeFault('SRW_LOCK','SRWLOCK requires pointer alignment.');checkBuffer(m,address,4);m.w32(address,0);return 0;});
  for(const shared of [false,true]){
    const suffix=shared?'Shared':'Exclusive';
    const attempt=address=>{
      const value=state(address);
      if(value&&(!shared||value===1))return false;
      if(shared&&value===0xfffffff1)throw new RuntimeFault('SRW_LOCK','SRW shared ownership count overflow.');
      m.w32(address,shared?(value?value+16:17):1);return true;
    };
    k('TryAcquireSRWLock'+suffix,address=>attempt(address)?1:0);
    k('AcquireSRWLock'+suffix,address=>attempt(address)?0:p.wait(()=>attempt(address)?0:undefined,'SRW lock '+suffix.toLowerCase()));
    k('ReleaseSRWLock'+suffix,address=>{
      const value=state(address);
      if(shared?value<17:value!==1)throw new RuntimeFault('SRW_LOCK','SRW release does not match an acquired lock mode.');
      m.w32(address,shared&&value>17?value-16:0);return 0;
    });
  }
}
