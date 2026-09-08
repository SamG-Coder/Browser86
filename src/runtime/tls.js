// Dynamic TLS is separate from the PE loader's static TLS array at TEB+0x2C.
export function installTLS(api){
  const p=api.p,m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const allocated=new Set(),limit=1088;
  const address=(index,create=false)=>{
    if(index<64)return p.teb+0xE10+index*4;
    let expansion=m.u32(p.teb+0xF94);
    if(!expansion&&create){expansion=p.heap.alloc(4096,true);m.w32(p.teb+0xF94,expansion);}
    return expansion?expansion+(index-64)*4:0;
  };
  k('TlsAlloc',0,()=>{
    let index=0;while(allocated.has(index)&&index<limit)index++;
    if(index===limit)return api.fail(8,0xFFFFFFFF);
    m.w32(address(index,true),0);allocated.add(index);return index;
  });
  k('TlsFree',1,index=>{
    if(!allocated.has(index))return api.fail(87);
    m.w32(address(index),0);allocated.delete(index);return 1;
  });
  k('TlsSetValue',2,(index,value)=>{
    if(index>=limit)return api.fail(87);
    m.w32(address(index,true),value);return 1;
  });
  for(const preserve of [false,true])k(preserve?'TlsGetValue2':'TlsGetValue',1,index=>{
    if(index>=limit)return preserve?0:api.fail(87);
    const ptr=address(index);if(!preserve)p.setError(0);return ptr?m.u32(ptr):0;
  });
}
