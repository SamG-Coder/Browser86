import {checkBuffer} from './files.js';

export function installAddressWait(api){
  const p=api.p,m=api.m,queues=new Map(),k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const remove=entry=>{const queue=queues.get(entry.address);if(!queue)return;const index=queue.indexOf(entry);if(index>=0)queue.splice(index,1);if(!queue.length)queues.delete(entry.address);};
  k('WaitOnAddress',4,(address,compare,size,timeout)=>{
    if(![1,2,4,8].includes(size)||!address||!compare)return api.fail(87);
    checkBuffer(m,address,size,'r');checkBuffer(m,compare,size,'r');
    for(let i=0;i<size;i++)if(m.u8(address+i)!==m.u8(compare+i))return 1;
    if(!timeout)return api.fail(1460);
    const entry={address,deadline:timeout===0xffffffff?Infinity:performance.now()+timeout,result:undefined};
    const queue=queues.get(address)||[];queue.push(entry);queues.set(address,queue);
    return p.wait(()=>{
      if(entry.result===undefined&&performance.now()>=entry.deadline){entry.result=0;remove(entry);}
      return entry.result===0?api.fail(1460):entry.result;
    },'Address value change');
  });
  for(const all of [false,true])k(all?'WakeByAddressAll':'WakeByAddressSingle',1,address=>{
    const queue=queues.get(address);if(!queue)return 0;
    for(const entry of [...queue]){
      entry.result=performance.now()>=entry.deadline?0:1;remove(entry);
      if(entry.result&&!all)break;
    }
    return 0;
  });
}
