import {RuntimeFault} from './errors.js';

const CURRENT_PROCESS=0xFFFFFFFF,CURRENT_THREAD=0xFFFFFFFE;
const kernelTypes=new Set(['file','event','mutex','semaphore','process','thread']);

export function installHandles(api){
  const p=api.p,m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const processObject=p.processObject={type:'process',id:4},threadObject=p.threadObject={type:'thread',id:8};
  const sourceObject=h=>h===CURRENT_PROCESS?processObject:h===CURRENT_THREAD?threadObject:p.object(h);
  const kernelObject=h=>{const o=p.object(h);return o&&kernelTypes.has(o.type)?o:null;};
  k('CloseHandle',1,h=>{
    // Preserve the runtime's fixed console/pseudo handle behavior.
    if(h>=10&&h<=12||h===CURRENT_PROCESS||h===CURRENT_THREAD)return 1;
    if(!kernelObject(h)||((p.handleFlags?.get(h)||0)&2))return api.fail(6);
    p.releaseHandle(h);return 1;
  });
  k('GetHandleInformation',2,(h,out)=>{
    if(!kernelObject(h))return api.fail(6);
    if(!out)return api.fail(87);
    m.w32(out,p.handleFlags?.get(h)||0);return 1;
  });
  k('SetHandleInformation',3,(h,mask,flags)=>{
    if(!kernelObject(h))return api.fail(6);
    if(mask&~3)return api.fail(87);
    const old=p.handleFlags?.get(h)||0;
    (p.handleFlags??=new Map()).set(h,(old&~mask)|(flags&mask));return 1;
  });
  k('DuplicateHandle',7,(sourceProcess,source,targetProcess,out,access,inherit,options)=>{
    if(!p.isCurrentProcess(sourceProcess))return api.fail(6);
    const object=sourceObject(source);
    if(!object||!kernelTypes.has(object.type)){
      if(source>=10&&source<=12)throw new RuntimeFault('UNSUPPORTED_HANDLE','Duplicating fixed console handles is not implemented.');
      return api.fail(6);
    }
    // DUPLICATE_CLOSE_SOURCE closes even when creating the target fails.
    // Keep the object reference alive locally while removing the source entry.
    const validTarget=p.isCurrentProcess(targetProcess),sourceAccess=p.handleAccess?.get(source)??0xFFFFFFFF;
    if(options&1)p.releaseHandle(source);
    if(options&~3)return api.fail(87);
    if(!targetProcess)return options&1?1:api.fail(87);
    if(!validTarget)return api.fail(6);
    let granted=sourceAccess;
    if(!(options&2)){
      if(!['event','mutex','semaphore'].includes(object.type))throw new RuntimeFault('UNSUPPORTED_HANDLE','Changing access rights while duplicating this object type is not implemented.');
      granted=api.syncAccess(object.type,access);if(granted===null)return api.fail(5);
    }
    // Check the entire output range before allocating a handle, without
    // corrupting an existing output value on failure.
    if(out){m.checkRange(out,4);for(let i=0;i<4;i++)m.page(out+i,'w');}
    const duplicate=p.referenceHandle(object,inherit?1:0,granted);
    if(out)m.w32(out,duplicate);
    return 1;
  });
  k('GetProcessId',1,h=>p.isCurrentProcess(h)?4:api.fail(6));
  k('GetThreadId',1,h=>h===CURRENT_THREAD||p.object(h,'thread')?.id===8?8:api.fail(6));
  k('GetExitCodeProcess',2,(h,out)=>{
    if(!p.isCurrentProcess(h))return api.fail(6);
    if(!out)return api.fail(87);m.w32(out,p.exitCode??259);return 1;
  });
  k('GetExitCodeThread',2,(h,out)=>{
    if(h!==CURRENT_THREAD&&p.object(h,'thread')?.id!==8)return api.fail(6);
    if(!out)return api.fail(87);m.w32(out,p.exitCode??259);return 1;
  });
}
