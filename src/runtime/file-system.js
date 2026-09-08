import {RuntimeFault} from './errors.js';
import {FILE_ATTRIBUTE_MASK} from './vfs.js';

const INVALID=0xFFFFFFFF;
export function installFileSystem(api){
  const p=api.p,m=api.m,v=api.vfs,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const opens=node=>!node?[]:[...new Set(p.handles.values())].filter(f=>f.type==='file'&&f.node===node);
  const removeWhenClosed=node=>{if(!node.openObjects&&node.deletePending&&v.get(node.path)===node)v.remove(node.path);};
  for(const wide of [false,true]){
    const suffix=wide?'W':'A',str=ptr=>api.str(ptr,wide);
    k('CreateFile'+suffix,7,(name,access,share,security,creation,flags,template)=>api.expected(()=>{
      if(flags&0x40000000)throw new RuntimeFault('UNSUPPORTED_IO','FILE_FLAG_OVERLAPPED is not implemented.');
      if(flags&0x20000000)throw new RuntimeFault('UNSUPPORTED_IO','Unbuffered I/O and sector alignment are not implemented.');
      if(template)throw new RuntimeFault('UNSUPPORTED_IO','CreateFile template handles are not implemented.');
      if(share&~7||![1,2,3,4,5].includes(creation))return api.fail(87,INVALID);
      const text=str(name);if(/^CONOUT\$$/i.test(text))return 11;if(/^CONIN\$$/i.test(text))return 10;
      const path=v.path(text),existing=v.get(path),exists=!!existing,deleteOnClose=!!(flags&0x04000000);
      const read=!!(access&0x90000001),write=!!(access&0x50000002),deleteAccess=deleteOnClose||!!(access&0x10010000);
      if(existing?.deletePending)return api.fail(5,INVALID);
      if(existing?.directory&&(!(flags&0x02000000)||creation!==3))return api.fail(5,INVALID);
      if(existing?.directory&&deleteOnClose)throw new RuntimeFault('UNSUPPORTED_IO','Delete-on-close directory handles are not implemented.');
      if(existing&&!existing.directory&&(existing.attributes&1)&&(write||deleteOnClose||creation===2||creation===5))return api.fail(5,INVALID);
      if(creation===1&&exists)return api.fail(80,INVALID);
      if((creation===3||creation===5)&&!exists)return api.fail(2,INVALID);
      if(creation===5&&!write)return api.fail(5,INVALID);
      if(deleteOnClose&&(flags&1))return api.fail(5,INVALID);
      for(const f of opens(existing))if(read&&!(f.share&1)||write&&!(f.share&2)||deleteAccess&&!(f.share&4)||f.read&&!(share&1)||f.write&&!(share&2)||f.deleteAccess&&!(share&4))return api.fail(32,INVALID);
      const parent=path.slice(0,path.lastIndexOf('/'))||'C:/';if(!v.get(parent)?.directory)return api.fail(3,INVALID);
      let inherit=0;
      if(security){
        if(m.u32(security)!==12)return api.fail(87,INVALID);
        if(m.u32(security+4)&&!exists)throw new RuntimeFault('UNSUPPORTED_IO','Custom file security descriptors are not implemented.');
        inherit=m.u32(security+8)?1:0;
      }
      if(!exists||creation===2||creation===5)v.writeFile(path,new Uint8Array());
      const node=v.get(path);
      if(!exists&&(flags&FILE_ATTRIBUTE_MASK)){const attributes=flags&FILE_ATTRIBUTE_MASK&~(16|128);v.setMetadata(path,{attributes:attributes||128});}
      const object={type:'file',node,position:0n,read,write,share,deleteAccess,deleteOnClose,directory:node.directory,
        readAttributes:read||!!(access&0x80),writeAttributes:write||!!(access&0x100)};
      Object.defineProperty(object,'path',{get:()=>node.path});
      object.onClose=()=>{
        node.openObjects--;if(deleteOnClose){node.deleteOnCloseObjects--;node.deletePending=true;v.revision++;}
        removeWhenClosed(node);
      };
      const handle=p.referenceHandle(object,inherit);node.openObjects=(node.openObjects||0)+1;
      if(deleteOnClose){node.deleteOnCloseObjects=(node.deleteOnCloseObjects||0)+1;v.revision++;}
      p.setError(exists&&(creation===2||creation===4)?183:0);return handle;
    },INVALID));
    k('DeleteFile'+suffix,1,name=>api.expected(()=>{
      const node=v.get(str(name));if(!node||node.directory)return api.fail(2);
      if(node.deletePending||node.attributes&1)return api.fail(5);
      if(opens(node).some(f=>!(f.share&4)))return api.fail(32);
      node.deletePending=true;v.revision++;removeWhenClosed(node);return 1;
    }));
    k('MoveFile'+suffix,2,(from,to)=>api.expected(()=>{
      const source=v.get(str(from)),target=v.get(str(to));if(!source)return api.fail(2);
      if(source.deletePending||target?.deletePending)return api.fail(5);
      if(opens(source).some(f=>!(f.share&4)))return api.fail(32);
      v.rename(source.path,str(to));return 1;
    }));
    k('CopyFile'+suffix,3,(from,to,fail)=>api.expected(()=>{
      const source=v.get(str(from)),target=v.get(str(to));if(!source||source.directory)return api.fail(2);
      if(source.deletePending||target?.deletePending||target?.attributes&1)return api.fail(5);
      if(fail&&target)return api.fail(80);
      if(source===target||opens(source).some(f=>!(f.share&1))||opens(target).some(f=>!(f.share&2)))return api.fail(32);
      const attributes=source.attributes,write=source.times.write;
      v.writeFile(str(to),source.data);v.setMetadata(str(to),{attributes,times:{write}});return 1;
    }));
  }
}
