import {RuntimeFault} from './errors.js';
import {checkBuffer} from './files.js';

export function installConditionVariables(api){
  const p=api.p,m=api.m,queues=new Map(),k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const call=(name,...args)=>api.lookup('kernel32.dll',name).fn(...args);
  const check=address=>{
    if(address&3)throw new RuntimeFault('CONDITION_VARIABLE','Condition variable requires pointer alignment.');
    checkBuffer(m,address,4);
    if(m.u32(address)!==(queues.has(address)?1:0))throw new RuntimeFault('CONDITION_VARIABLE','Invalid or modified condition variable state.');
  };
  const remove=entry=>{
    const queue=queues.get(entry.address),index=queue?.indexOf(entry)??-1;if(index<0)return;
    check(entry.address);queue.splice(index,1);if(!queue.length){queues.delete(entry.address);m.w32(entry.address,0);}
  };
  k('InitializeConditionVariable',1,address=>{
    checkBuffer(m,address,4);if(address&3||queues.has(address))throw new RuntimeFault('CONDITION_VARIABLE','Cannot initialize an unaligned or active condition variable.');
    m.w32(address,0);return 0;
  });
  const sleep=(address,lock,timeout,srw,flags=0)=>{
    if(flags&~1)return api.fail(87);check(address);
    if(address>=lock&&address<lock+(srw?4:24))throw new RuntimeFault('CONDITION_VARIABLE','Condition variable overlaps its lock.');
    const mode=flags?'Shared':'Exclusive';
    if(!srw){checkBuffer(m,lock,24);if(m.u32(lock+8)!==1||m.u32(lock+12)!==8)throw new RuntimeFault('CONDITION_VARIABLE','SleepConditionVariableCS requires the critical section to be entered exactly once.');}
    // All validation precedes releasing the lock. Guest execution cannot run
    // between release and queue insertion within this synchronous handler.
    call(srw?'ReleaseSRWLock'+mode:'LeaveCriticalSection',lock);
    const entry={address,deadline:timeout===0xffffffff?Infinity:performance.now()+timeout,result:undefined};
    const queue=queues.get(address)||[];queue.push(entry);queues.set(address,queue);m.w32(address,1);
    const poll=()=>{
      if(entry.result===undefined&&performance.now()>=entry.deadline){entry.result=0;remove(entry);}
      if(entry.result===undefined)return undefined;
      // Return only after reacquiring, even if the original timeout expired.
      if(!srw&&m.u32(lock+12))return undefined;
      if(!call(srw?'TryAcquireSRWLock'+mode:'TryEnterCriticalSection',lock))return undefined;
      return entry.result?1:api.fail(1460);
    };
    const result=poll();return result===undefined?p.wait(poll,'Condition variable'):result;
  };
  k('SleepConditionVariableCS',3,(address,lock,timeout)=>sleep(address,lock,timeout,false));
  k('SleepConditionVariableSRW',4,(address,lock,timeout,flags)=>sleep(address,lock,timeout,true,flags));
  for(const all of [false,true])k(all?'WakeAllConditionVariable':'WakeConditionVariable',1,address=>{
    check(address);
    for(const entry of [...(queues.get(address)||[])]){
      entry.result=performance.now()>=entry.deadline?0:1;remove(entry);if(entry.result&&!all)break;
    }
    return 0;
  });
}
