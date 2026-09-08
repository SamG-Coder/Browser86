import {RuntimeFault} from './errors.js';

const WAIT_FAILED=0xFFFFFFFF, WAIT_TIMEOUT=258;

// Objects belong to this guest process. Ownership models its sole thread;
// adding threads requires a scheduler and per-thread ownership/abandonment.
export function installSynchronization(api){
  const p=api.p,m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const attributes=(security,name)=>{
    if(name)throw new RuntimeFault('UNSUPPORTED_SYNC','Named synchronization objects and cross-process synchronization are not implemented.');
    if(security)throw new RuntimeFault('UNSUPPORTED_SYNC','Synchronization security attributes and handle inheritance are not implemented.');
  };
  for(const suffix of ['A','W']){
    k('CreateEvent'+suffix,4,(security,manual,initial,name)=>{
      attributes(security,name);
      return p.handle('event',{manual:!!manual,signalled:!!initial});
    });
    k('CreateMutex'+suffix,3,(security,initialOwner,name)=>{
      attributes(security,name);
      return p.handle('mutex',{depth:initialOwner?1:0});
    });
    k('CreateSemaphore'+suffix,4,(security,initial,maximum,name)=>{
      attributes(security,name);
      initial|=0;maximum|=0;
      if(maximum<=0||initial<0||initial>maximum)return api.fail(87);
      return p.handle('semaphore',{count:initial,maximum});
    });
  }
  k('SetEvent',1,h=>{const e=p.object(h,'event');if(!e)return api.fail(6);e.signalled=true;return 1;});
  k('ResetEvent',1,h=>{const e=p.object(h,'event');if(!e)return api.fail(6);e.signalled=false;return 1;});
  k('ReleaseMutex',1,h=>{
    const mutex=p.object(h,'mutex');if(!mutex)return api.fail(6);
    if(!mutex.depth)return api.fail(288); // ERROR_NOT_OWNER
    mutex.depth--;return 1;
  });
  k('ReleaseSemaphore',3,(h,count,previous)=>{
    const semaphore=p.object(h,'semaphore');if(!semaphore)return api.fail(6);
    count|=0;if(count<=0)return api.fail(87);
    if(count>semaphore.maximum-semaphore.count)return api.fail(298); // ERROR_TOO_MANY_POSTS
    // Validate/write the optional guest output before changing the object.
    if(previous)m.w32(previous,semaphore.count);
    semaphore.count+=count;return 1;
  });
  const ready=o=>o.type==='event'?o.signalled:o.type==='semaphore'?o.count>0:o.type==='mutex'?true:p.exitCode!==null;
  const acquire=o=>{
    if(o.type==='event'&&!o.manual)o.signalled=false;
    else if(o.type==='semaphore')o.count--;
    else if(o.type==='mutex')o.depth++;
  };
  const wait=(handles,all,timeout,reason)=>{
    const resolve=h=>h===0xFFFFFFFF?p.processObject:h===0xFFFFFFFE?p.threadObject:p.object(h);
    const objects=handles.map(resolve);
    if(objects.some(o=>!o||!['event','mutex','semaphore','process','thread'].includes(o.type)))return api.fail(6,WAIT_FAILED);
    if(new Set(handles).size!==handles.length)return api.fail(87,WAIT_FAILED);
    if(all&&new Set(objects).size!==objects.length)return api.fail(87,WAIT_FAILED);
    const deadline=timeout===WAIT_FAILED?Infinity:performance.now()+timeout;
    const check=()=>{
      // Windows leaves closing a pending handle undefined; fail deterministically.
      if(handles.some((h,i)=>resolve(h)!==objects[i]))return api.fail(6,WAIT_FAILED);
      if(all){
        // No event reset, semaphore consumption or mutex acquisition until ALL
        // objects satisfy the wait. A failed/timed-out wait has no side effects.
        if(objects.every(ready)){objects.forEach(acquire);return 0;}
      }else{
        const index=objects.findIndex(ready);
        if(index!==-1){acquire(objects[index]);return index;}
      }
      return performance.now()>=deadline?WAIT_TIMEOUT:undefined;
    };
    return check()??p.wait(check,reason);
  };
  const rejectAlertable=alertable=>{
    if(alertable)throw new RuntimeFault('UNSUPPORTED_APC','Alertable waits are not implemented.');
  };
  const multiple=(count,ptr,all,timeout,alertable=0,reason='WaitForMultipleObjects')=>{
    rejectAlertable(alertable);
    if(!count||count>64||!ptr)return api.fail(87,WAIT_FAILED);
    const handles=Array.from({length:count},(_,i)=>m.u32(ptr+i*4));
    return wait(handles,!!all,timeout,reason);
  };
  k('WaitForSingleObject',2,(h,timeout)=>wait([h],false,timeout,'WaitForSingleObject'));
  k('WaitForSingleObjectEx',3,(h,timeout,alertable)=>{
    rejectAlertable(alertable);return wait([h],false,timeout,'WaitForSingleObjectEx');
  });
  k('WaitForMultipleObjects',4,multiple);
  k('WaitForMultipleObjectsEx',5,(count,ptr,all,timeout,alertable)=>multiple(count,ptr,all,timeout,alertable,'WaitForMultipleObjectsEx'));
}
