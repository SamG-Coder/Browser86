import {RuntimeFault} from './errors.js';

const WAIT_FAILED=0xFFFFFFFF, WAIT_TIMEOUT=258;

// Objects belong to this guest process. Ownership models its sole thread;
// adding threads requires a scheduler and per-thread ownership/abandonment.
export function installSynchronization(api){
  const p=api.p,m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  p.namedObjects=new Map();
  const allAccess=type=>type==='mutex'?0x1F0001:0x1F0003;
  api.syncAccess=(type,requested)=>{
    const all=allAccess(type);let access=requested&0x0FFFFFFF;
    if(requested&0x80000000)access|=0x20001; // GENERIC_READ
    if(requested&0x40000000)access|=type==='mutex'?0x20000:0x20002;
    if(requested&0x20000000)access|=0x120000; // GENERIC_EXECUTE
    if(requested&0x10000000)access|=all;
    if(access&0x02000000)access=(access&~0x02000000)|all; // MAXIMUM_ALLOWED
    return access&~all?null:access;
  };
  const nameKey=(ptr,wide)=>{
    if(!ptr)return null;
    const text=api.str(ptr,wide);
    const prefix=text.startsWith('Global\\')?'Global': 'Local';
    const rest=/^(Global|Local)\\/.test(text)?text.slice(prefix.length+1):text;
    if(!rest||text.length>=260||rest.includes('\\'))return false;
    return prefix+'\\'+rest;
  };
  const create=(type,security,name,wide,access,make)=>{
    const key=nameKey(name,wide);if(key===false)return api.fail(123);
    const existing=key?p.namedObjects.get(key):null;
    if(existing&&existing.type!==type)return api.fail(6);
    let inherit=0;
    if(security){
      if(m.u32(security)!==12)return api.fail(87);
      if(m.u32(security+4)&&!existing)throw new RuntimeFault('UNSUPPORTED_SYNC','Custom synchronization security descriptors are not implemented.');
      inherit=m.u32(security+8)?1:0;
    }
    const granted=api.syncAccess(type,access);if(granted===null)return api.fail(5);
    const state=existing?null:make();if(!existing&&!state)return 0;
    const object=existing||{type,...state,nameKey:key};
    const handle=p.referenceHandle(object,inherit,granted);
    p.setError(existing?183:0);return handle;
  };
  for(const wide of [false,true]){
    const suffix=wide?'W':'A';
    const event=(security,name,flags,access)=>{
      if(flags&~3)return api.fail(87);
      return create('event',security,name,wide,access,()=>({manual:!!(flags&1),signalled:!!(flags&2)}));
    };
    const mutex=(security,name,flags,access)=>{
      if(flags&~1)return api.fail(87);
      return create('mutex',security,name,wide,access,()=>({depth:flags&1}));
    };
    const semaphore=(security,initial,maximum,name,flags,access)=>{
      if(flags)return api.fail(87);
      return create('semaphore',security,name,wide,access,()=>{
        initial|=0;maximum|=0;
        if(maximum<=0||initial<0||initial>maximum){api.fail(87);return null;}
        return {count:initial,maximum};
      });
    };
    k('CreateEvent'+suffix,4,(security,manual,initial,name)=>event(security,name,(manual?1:0)|(initial?2:0),allAccess('event')));
    k('CreateMutex'+suffix,3,(security,owner,name)=>mutex(security,name,owner?1:0,allAccess('mutex')));
    k('CreateSemaphore'+suffix,4,(security,initial,maximum,name)=>semaphore(security,initial,maximum,name,0,allAccess('semaphore')));
    k('CreateEventEx'+suffix,4,event);
    k('CreateMutexEx'+suffix,4,mutex);
    k('CreateSemaphoreEx'+suffix,6,semaphore);
    for(const [label,type]of [['Event','event'],['Mutex','mutex'],['Semaphore','semaphore']])k('Open'+label+suffix,3,(access,inherit,name)=>{
      if(!name)return api.fail(87);
      const key=nameKey(name,wide);if(key===false)return api.fail(123);
      const object=p.namedObjects.get(key);if(!object)return api.fail(2);
      if(object.type!==type)return api.fail(6);
      const granted=api.syncAccess(type,access);if(granted===null)return api.fail(5);
      return p.referenceHandle(object,inherit?1:0,granted);
    });
  }
  k('SetEvent',1,h=>{const e=p.object(h,'event');if(!e)return api.fail(6);if(!p.hasHandleAccess(h,2))return api.fail(5);e.signalled=true;return 1;});
  k('ResetEvent',1,h=>{const e=p.object(h,'event');if(!e)return api.fail(6);if(!p.hasHandleAccess(h,2))return api.fail(5);e.signalled=false;return 1;});
  k('ReleaseMutex',1,h=>{
    const mutex=p.object(h,'mutex');if(!mutex)return api.fail(6);
    if(!mutex.depth)return api.fail(288); // ERROR_NOT_OWNER
    mutex.depth--;return 1;
  });
  k('ReleaseSemaphore',3,(h,count,previous)=>{
    const semaphore=p.object(h,'semaphore');if(!semaphore)return api.fail(6);
    if(!p.hasHandleAccess(h,2))return api.fail(5);
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
    if(handles.some(h=>!p.hasHandleAccess(h,0x100000)))return api.fail(5,WAIT_FAILED);
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
