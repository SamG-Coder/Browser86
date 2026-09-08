import {FILE_ATTRIBUTE_MASK} from './vfs.js';
import {checkBuffer,resizeFile} from './files.js';
import {RuntimeFault} from './errors.js';

export function writeFileTime(memory,out,value){const time=BigInt(value);memory.w32(out,Number(time&0xFFFFFFFFn));memory.w32(out+4,Number(time>>32n));}
export function installFileInformation(api){
  const p=api.p,m=api.m,v=api.vfs,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  k('SetFileInformationByHandle',4,(h,infoClass,input,size)=>{
    const f=p.object(h,'file');if(!f)return api.fail(6);
    if(![0,3,4,5,6,12,21,22,23].includes(infoClass))return api.fail(87);
    if(infoClass===4){
      if(size<1)return api.fail(24);if(!input)return api.fail(87);
      if(!f.deleteAccess)return api.fail(5);
      checkBuffer(m,input,1,'r');const deleting=!!m.u8(input),node=f.node;
      if(deleting){
        if(node.path==='C:/'||!node.directory&&(node.attributes&1))return api.fail(5);
        if(node.directory&&v.list(node.path).length)return api.fail(145);
      }
      node.deletePending=deleting;v.revision++;return 1;
    }
    if(infoClass!==6)throw new RuntimeFault('UNSUPPORTED_FILE_INFO',`Setting file information class ${infoClass} is not implemented.`,{infoClass});
    if(size<8)return api.fail(24);if(!input)return api.fail(87);
    if(f.directory||!f.write)return api.fail(5);
    checkBuffer(m,input,8,'r');
    const length=BigInt(m.u32(input))|(BigInt(m.i32(input+4))<<32n);
    return api.expected(()=>resizeFile(api,f,length));
  });
  k('GetFileInformationByHandleEx',4,(h,infoClass,out,size)=>{
    const f=p.object(h,'file');if(!f)return api.fail(6);
    if(infoClass>=25||[3,4,5,6,12,21,22].includes(infoClass))return api.fail(87);
    const required={1:24,2:8,9:8,18:24}[infoClass];
    if(!required)throw new RuntimeFault('UNSUPPORTED_FILE_INFO',`File information class ${infoClass} is not implemented.`,{infoClass});
    if(size<required)return api.fail(24);
    if(!out)return api.fail(87);
    const node=f.node;
    if(infoClass===2){
      // FILE_NAME_INFO uses a byte count, UTF-16 code units and no terminator.
      const name=node.path.slice(2).replaceAll('/','\\'),length=name.length*2;
      const count=Math.min(name.length,Math.floor((size-4)/2));
      checkBuffer(m,out,4+count*2);m.w32(out,length);
      for(let i=0;i<count;i++)m.w16(out+4+i*2,name.charCodeAt(i));
      return count===name.length?1:api.fail(234);
    }
    checkBuffer(m,out,required);m.fill(out,required);
    if(infoClass===1){
      // The virtual disk allocates exactly its data length, with no clusters.
      const length=node.data?.length||0;m.w32(out,length);m.w32(out+8,length);
      m.w32(out+16,node.deletePending?0:1);m.w8(out+20,node.deletePending?1:0);m.w8(out+21,node.directory?1:0);
    }else if(infoClass===9){m.w32(out,node.attributes);}
    else {m.w32(out,0xB8600001);m.w32(out+8,node.id);}
    return 1;
  });
  k('GetFileTime',4,(h,creation,access,write)=>{
    const f=p.object(h,'file');if(!f)return api.fail(6);if(!f.readAttributes)return api.fail(5);
    return api.expected(()=>{
      const node=f.node;if(!node)return api.fail(2);
      for(const out of [creation,access,write])if(out)checkBuffer(m,out,8);
      for(const [out,key]of [[creation,'creation'],[access,'access'],[write,'write']])if(out)writeFileTime(m,out,node.times[key]);
      return 1;
    });
  });
  k('SetFileTime',4,(h,creation,access,write)=>{
    const f=p.object(h,'file');if(!f)return api.fail(6);if(!f.writeAttributes)return api.fail(5);
    return api.expected(()=>{
      if(!f.node)return api.fail(2);
      const times={},suppress={};
      for(const [ptr,key]of [[creation,'creation'],[access,'access'],[write,'write']])if(ptr){
        checkBuffer(m,ptr,8,'r');const value=BigInt(m.u32(ptr))|(BigInt(m.u32(ptr+4))<<32n);
        if(value===0n)continue;
        if(value===0xFFFFFFFFFFFFFFFFn&&key!=='creation')suppress[key]=true;
        else times[key]=value.toString();
      }
      if(Object.keys(times).length)v.setMetadata(f.path,{times},{node:f.node});
      if(suppress.access)f.suppressAccess=true;if(suppress.write)f.suppressWrite=true;
      return 1;
    });
  });
  k('GetFileInformationByHandle',2,(h,out)=>{
    const f=p.object(h,'file');if(!f)return api.fail(6);if(!out)return api.fail(87);
    return api.expected(()=>{
      const node=f.node;if(!node)return api.fail(2);
      checkBuffer(m,out,52);m.fill(out,52);m.w32(out,node.attributes);
      for(const [offset,key]of [[4,'creation'],[12,'access'],[20,'write']])writeFileTime(m,out+offset,node.times[key]);
      m.w32(out+28,0xB8600001);m.w32(out+36,node.data?.length||0);m.w32(out+40,node.deletePending?0:1);m.w32(out+48,node.id);return 1;
    });
  });
  for(const wide of [false,true]){
    const suffix=wide?'W':'A',str=ptr=>api.str(ptr,wide);
    k('GetFileAttributes'+suffix,1,name=>api.expected(()=>{const node=v.get(str(name));return node?node.attributes:api.fail(2,0xFFFFFFFF);},0xFFFFFFFF));
    k('SetFileAttributes'+suffix,2,(name,attributes)=>api.expected(()=>{
      if(attributes&~FILE_ATTRIBUTE_MASK)return api.fail(87);
      const node=v.get(str(name));if(!node)return api.fail(2);
      const flags=attributes&~(16|128);v.setMetadata(node.path,{attributes:flags|(node.directory?16:flags?0:128)});return 1;
    }));
    k('GetFileAttributesEx'+suffix,3,(name,level,out)=>api.expected(()=>{
      if(level)return api.fail(87);if(!out)return api.fail(87);
      const node=v.get(str(name));if(!node)return api.fail(2);
      checkBuffer(m,out,36);m.fill(out,36);m.w32(out,node.attributes);
      for(const [offset,key]of [[4,'creation'],[12,'access'],[20,'write']])writeFileTime(m,out+offset,node.times[key]);
      m.w32(out+32,node.data?.length||0);return 1;
    }));
  }
}
