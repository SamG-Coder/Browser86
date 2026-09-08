import {checkBuffer} from './files.js';

export function installInitOnce(api){
  const p=api.p,m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const validate=(once,...outputs)=>{
    if(!once)return false;checkBuffer(m,once,4);for(const out of outputs)if(out)checkBuffer(m,out,4);return true;
  };
  const begin=(once,flags,pending,context)=>{
    if(flags&~3||flags===3||!pending||!validate(once,pending,context))return api.fail(87);
    const run=()=>{
      const value=m.u32(once),state=value&3;
      if(state===2){m.w32(pending,0);if(context)m.w32(context,value&0xfffffffc);return 1;}
      if(flags===1)return api.fail(31);
      if(state===0){m.w32(once,flags===2?3:1);m.w32(pending,1);return 1;}
      if(state===3&&flags===2){m.w32(pending,1);return 1;}
      if(state===3||flags===2)return api.fail(87);
      return undefined;
    };
    return run()??p.wait(run,'One-time initialization');
  };
  const complete=(once,flags,context)=>{
    if(flags&~6||flags===6||context&3||flags===4&&context||!validate(once))return api.fail(87);
    const state=m.u32(once)&3;
    if(state===0||state===2)return api.fail(31);
    if((state===3)!==(flags===2))return api.fail(87);
    m.w32(once,flags===4?0:(context|2));return 1;
  };
  k('InitOnceInitialize',1,once=>{if(!validate(once))return api.fail(87);m.w32(once,0);return 0;});
  k('InitOnceBeginInitialize',4,begin);
  k('InitOnceComplete',3,complete);
  k('InitOnceExecuteOnce',4,(once,callback,parameter,context)=>{
    if(!validate(once,context))return api.fail(87);
    const run=()=>{
      const value=m.u32(once),state=value&3;
      if(state===2){if(context)m.w32(context,value&0xfffffffc);return 1;}
      if(state===3)return api.fail(87);
      if(state===1)return undefined;
      if(!callback)return api.fail(87);
      m.w32(once,1);
      return p.call(callback,[once,parameter,context],success=>{
        if(!success){m.w32(once,0);return 0;}
        return complete(once,0,context?m.u32(context):0);
      });
    };
    return run()??p.wait(run,'One-time initialization callback');
  });
}
