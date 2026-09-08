import {RuntimeFault} from './errors.js';
import {ansiDecode} from './memory.js';
import {fileTimeFromMs} from './vfs.js';

const INVALID=0xFFFFFFFF,MAX_POSITION=0x7FFFFFFFFFFFFFFFn;
export function checkBuffer(memory,address,length,access='w'){
  memory.checkRange(address,length);
  for(let offset=0;offset<length;offset+=Math.min(4096-((address+offset)&4095),length-offset))memory.page(address+offset,access);
}
function write64(m,out,value){m.w32(out,Number(value&0xFFFFFFFFn));m.w32(out+4,Number(value>>32n));}

// Both EOF APIs resize the shared file without changing its seek position.
export function resizeFile(api,f,length){
  if(!f.write)return api.fail(5);
  if(length<0n)return api.fail(87);
  const v=api.vfs,old=f.node.data;
  if(length>BigInt(v.limit)||BigInt(v.bytes-old.length)+length>BigInt(v.limit))return api.fail(112);
  const data=new Uint8Array(Number(length));data.set(old.subarray(0,data.length));
  v.writeFile(f.path,data,{node:f.node,preserveWriteTime:!!f.suppressWrite,preserveAccessTime:!!f.suppressAccess});return 1;
}

export function installFileIO(api){
  const p=api.p,m=api.m,v=api.vfs,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const diskFile=h=>{const f=p.object(h,'file');return f&&!f.directory?f:null;};
  const seek=(f,distance,method,limited=false)=>{
    if(method>2){api.fail(87);return null;}
    if(!f.read&&!f.write){api.fail(5);return null;}
    const base=method===0?0n:method===1?BigInt(f.position):BigInt(f.node.data.length),next=base+distance;
    if(next<0n){api.fail(131);return null;}
    if(next>MAX_POSITION||limited&&next>0xFFFFFFFFn){api.fail(87);return null;}
    return next;
  };
  k('SetFilePointer',4,(h,low,high,method)=>{
    const f=diskFile(h);if(!f)return api.fail(6,INVALID);
    const distance=high?(BigInt(m.i32(high))<<32n)|BigInt(low>>>0):BigInt(low|0);
    return api.expected(()=>{
      const next=seek(f,distance,method,!high);if(next===null)return INVALID;
      if(high){checkBuffer(m,high,4);m.w32(high,Number(next>>32n));}
      f.position=next;p.setError(0);return Number(next&0xFFFFFFFFn);
    },INVALID);
  });
  // LARGE_INTEGER is passed by value in TWO x86 stack slots.
  k('SetFilePointerEx',5,(h,low,high,out,method)=>{
    const f=diskFile(h);if(!f)return api.fail(6);
    const raw=(BigInt(high>>>0)<<32n)|BigInt(low>>>0),distance=method===0?raw:BigInt.asIntN(64,raw);
    return api.expected(()=>{
      const next=seek(f,distance,method);if(next===null)return 0;
      if(out){checkBuffer(m,out,8);write64(m,out,next);}
      f.position=next;return 1;
    });
  });
  k('GetFileSize',2,(h,high)=>{
    const f=diskFile(h);if(!f)return api.fail(6,INVALID);
    return api.expected(()=>{const size=f.node.data.length;if(high){checkBuffer(m,high,4);m.w32(high,0);}return size;},INVALID);
  });
  k('GetFileSizeEx',2,(h,out)=>{
    const f=diskFile(h);if(!f)return api.fail(6);if(!out)return api.fail(87);
    return api.expected(()=>{const size=f.node.data.length;checkBuffer(m,out,8);write64(m,out,BigInt(size));return 1;});
  });
  k('ReadFile',5,(h,buffer,count,read,overlap)=>{
    if(read){checkBuffer(m,read,4);m.w32(read,0);}
    if(overlap)throw new RuntimeFault('UNSUPPORTED_IO','Overlapped file I/O is not implemented.');
    if(count>128*1024*1024)return api.fail(8);
    if(h===10){
      checkBuffer(m,buffer,count);
      const consume=()=>{
        if(!p.input.length&&count)return undefined;
        const data=Uint8Array.from(p.input.slice(0,count));
        m.write(buffer,data);if(read)m.w32(read,data.length);p.input.splice(0,data.length);return 1;
      };
      return consume()??p.wait(consume,'Console input');
    }
    const f=diskFile(h);if(!f)return api.fail(6);if(!f.read)return api.fail(5);
    return api.expected(()=>{
      const file=f.node.data,position=BigInt(f.position);
      const start=position>=BigInt(file.length)?file.length:Number(position);
      const data=file.subarray(start,start+count);
      checkBuffer(m,buffer,data.length);m.write(buffer,data);if(read)m.w32(read,data.length);
      if(data.length&&!f.suppressAccess)v.setMetadata(f.path,{times:{access:fileTimeFromMs(Date.now())}},{node:f.node});
      f.position=position+BigInt(data.length);return 1;
    });
  });
  k('WriteFile',5,(h,buffer,count,written,overlap)=>{
    if(written){checkBuffer(m,written,4);m.w32(written,0);}
    if(overlap)throw new RuntimeFault('UNSUPPORTED_IO','Overlapped file I/O is not implemented.');
    if(count>128*1024*1024)return api.fail(8);
    if(h===11||h===12){
      const data=m.read(buffer,count);p.emit('stdout',{text:ansiDecode(data),stream:h===12?'stderr':'stdout'});
      if(written)m.w32(written,count);return 1;
    }
    const f=diskFile(h);if(!f)return api.fail(6);if(!f.write)return api.fail(5);
    // A null write does not allocate, extend, or move the file cursor.
    if(!count)return 1;
    return api.expected(()=>{
      const old=f.node.data,position=BigInt(f.position),end=position+BigInt(count);
      if(end>BigInt(v.limit)||BigInt(v.bytes-old.length)+ (end>BigInt(old.length)?end:BigInt(old.length))>BigInt(v.limit))return api.fail(112);
      const data=m.read(buffer,count);v.writeAt(f.path,Number(position),data,{node:f.node,preserveWriteTime:!!f.suppressWrite,preserveAccessTime:!!f.suppressAccess});
      f.position=end;if(written)m.w32(written,count);return 1;
    });
  });
  k('SetEndOfFile',1,h=>{
    const f=diskFile(h);if(!f)return api.fail(6);
    return api.expected(()=>resizeFile(api,f,BigInt(f.position)));
  });
  k('FlushFileBuffers',1,h=>{const f=diskFile(h);return !f?api.fail(6):!f.write?api.fail(5):1;});
}
