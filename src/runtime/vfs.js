import {RuntimeFault,requireThat} from './errors.js';
export const FILE_ATTRIBUTE_MASK=0x31B7;
export const fileTimeFromMs=ms=>((BigInt(Math.trunc(ms))+11644473600000n)*10000n).toString();
export function fileMetadata(node){return {id:node.id,attributes:node.attributes,times:{...node.times}};}
export function validateFileMetadata(info){
  requireThat(info&&Number.isInteger(info.id)&&info.id>0&&info.id<=0xFFFFFFFF,'VFS_METADATA','Invalid virtual file identity.');
  requireThat(Number.isInteger(info.attributes)&&info.attributes>=0&&info.attributes<=0xFFFFFFFF&&!(info.attributes&~FILE_ATTRIBUTE_MASK),'VFS_METADATA','Invalid virtual file attributes.');
  for(const key of ['creation','access','write'])requireThat(typeof info.times?.[key]==='string'&&/^\d{1,20}$/.test(info.times[key])&&BigInt(info.times[key])<=0xFFFFFFFFFFFFFFFFn,'VFS_METADATA','Invalid virtual FILETIME.');
  return info;
}
export function normalizePath(input,cwd='C:/app') {
  requireThat(typeof input==='string' && input.length<=32767 && !/[\x00-\x1F]/.test(input),'VFS_PATH','Invalid virtual filename.');
  let p=input.replace(/\\/g,'/');
  requireThat(!p.startsWith('//'),'VFS_PATH','UNC paths and host devices are not exposed.');
  if(/^[a-z]:/i.test(p)){requireThat(/^c:(\/|$)/i.test(p),'VFS_DRIVE','Only absolute paths on virtual C: are supported.');p=p.slice(2);}
  else if(!p.startsWith('/'))p=cwd.replace(/^[a-z]:/i,'')+'/'+p;
  const parts=[];
  for(const x of p.split('/')) {if(!x||x==='.')continue;if(x==='..'){parts.pop();continue;}requireThat(!/[:*?"<>|]/.test(x),'VFS_PATH','Invalid Windows filename.',{path:input});parts.push(x);}
  return 'C:/'+parts.join('/');
}
export class VirtualFileSystem {
  constructor(entries=[],{limit=512*1024*1024}={}) {
    this.nodes=new Map();this.cwd='C:/app';this.revision=0;this.limit=limit;this.bytes=0;this.nextId=1;
    const ids=new Set();
    for(const entry of entries)if(entry.id!==undefined){validateFileMetadata(entry);requireThat(!ids.has(entry.id),'VFS_METADATA','Duplicate virtual file identity.');ids.add(entry.id);}
    this.reservedIds=ids;
    this.mkdir('C:/');this.mkdir('C:/app');this.mkdir('C:/Windows/System32');this.mkdir('C:/Temp');this.mkdir('C:/Users/Browser/Documents');
    for(const e of entries){const p=/^[a-z]:/i.test(e.path)?e.path:'C:/app/'+e.path;e.directory?this.mkdir(p):this.writeFile(p,e.data);const node=this.get(p);
      if(e.id!==undefined){requireThat(!!(e.attributes&16)===node.directory,'VFS_METADATA','File attributes disagree with the entry type.');Object.assign(node,fileMetadata(e));node.mtime=Number(BigInt(node.times.write)/10000n-11644473600000n);}
      else if(Number.isFinite(e.mtime)){node.mtime=e.mtime;const time=fileTimeFromMs(e.mtime);node.times={creation:time,access:time,write:time};}
    }
    this.revision=0;
  }
  path(p){return normalizePath(p,this.cwd);}
  key(p){return this.path(p).toLowerCase();}
  get(p){return this.nodes.get(this.key(p));}
  exists(p){return !!this.get(p);}
  newNode(path,directory){while(this.reservedIds.has(this.nextId))this.nextId++;requireThat(this.nextId<=0xFFFFFFFF,'VFS_METADATA','Virtual file identity space exhausted.');const mtime=Date.now(),time=fileTimeFromMs(mtime);return {path,directory,id:this.nextId++,attributes:directory?16:32,times:{creation:time,access:time,write:time},mtime};}
  setMetadata(p,patch,{node:expectedNode}={}){const node=this.get(p);requireThat(node,'VFS_NOT_FOUND','File does not exist.');requireThat(!node.deletePending||node===expectedNode,'VFS_DELETE_PENDING','File is pending deletion.');const info={id:node.id,attributes:patch.attributes??node.attributes,times:{...node.times,...patch.times}};validateFileMetadata(info);requireThat(!!(info.attributes&16)===node.directory,'VFS_METADATA','Metadata cannot change a file into a directory.');Object.assign(node,info);node.mtime=Number(BigInt(info.times.write)/10000n-11644473600000n);this.revision++;}
  mkdir(p){const path=this.path(p);const parts=path.slice(3).split('/').filter(Boolean);let current='C:/';
    if(!this.nodes.has('c:/'))this.nodes.set('c:/',this.newNode('C:/',true));
    for(const x of parts){current+=(current.endsWith('/')?'':'/')+x;const key=current.toLowerCase(),old=this.nodes.get(key);requireThat(!old||old.directory,'VFS_NOT_DIRECTORY','A parent path is a file.',{path:current});if(!old){this.nodes.set(key,this.newNode(current,true));this.revision++;}}
    return true;
  }
  writeFile(p,bytes,{node:expectedNode,preserveWriteTime=false,preserveAccessTime=true}={}){const path=this.path(p);const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const old=this.get(path);requireThat(!old?.deletePending||old===expectedNode,'VFS_DELETE_PENDING','File is pending deletion.');requireThat(!old?.directory,'VFS_IS_DIRECTORY','Cannot write a directory.',{path});const newSize=this.bytes-(old?.data.length||0)+data.length;requireThat(newSize<=this.limit,'VFS_QUOTA','Virtual disk quota exceeded.');this.mkdir(path.slice(0,path.lastIndexOf('/'))||'C:/');const node=old||this.newNode(path,false);node.data=data.slice();node.attributes=(node.attributes&~128)|32;
    const now=Date.now(),time=fileTimeFromMs(now);if(!preserveWriteTime){node.mtime=now;node.times.write=time;}if(!preserveAccessTime)node.times.access=time;
    this.nodes.set(path.toLowerCase(),node);this.bytes=newSize;this.revision++;return true;}
  readFile(p){const n=this.get(p);requireThat(!n?.deletePending,'VFS_DELETE_PENDING','File is pending deletion.');requireThat(n&&!n.directory,'VFS_NOT_FOUND','Virtual file not found.',{path:this.path(p)});return n.data;}
  writeAt(p,position,bytes,options){requireThat(Number.isSafeInteger(position)&&position>=0,'VFS_POSITION','Invalid file position.');const node=this.get(p);const old=node&&node===options?.node?node.data:this.readFile(p);if(!bytes.length)return 0;const size=Math.max(old.length,position+bytes.length);requireThat(size<=this.limit && this.bytes-old.length+size<=this.limit,'VFS_QUOTA','Virtual disk quota exceeded.');const data=new Uint8Array(size);data.set(old);data.set(bytes,position);this.writeFile(p,data,options);return bytes.length;}
  remove(p){const key=this.key(p),n=this.nodes.get(key);requireThat(key!=='c:/','VFS_OPERATION','The virtual drive root cannot be removed.');if(!n)return false;requireThat(!n.openObjects,'VFS_SHARING','File has open handles.');if(n.directory)requireThat(![...this.nodes.keys()].some(k=>k.startsWith(key+'/')),'VFS_NOT_EMPTY','Directory is not empty.');this.bytes-=n.data?.length||0;this.nodes.delete(key);this.revision++;return true;}
  rename(from,to){const src=this.get(from),path=this.path(to),key=this.key(to);requireThat(src,'VFS_NOT_FOUND','Source file does not exist.');requireThat(!src.deletePending&&!this.get(to)?.deletePending,'VFS_DELETE_PENDING','File is pending deletion.');requireThat(!src.directory,'VFS_OPERATION','Directory renaming is not implemented.');requireThat(!this.exists(to)||this.key(from)===key,'VFS_EXISTS','Destination exists.');this.mkdir(path.slice(0,path.lastIndexOf('/'))||'C:/');this.nodes.delete(this.key(from));src.path=path;this.nodes.set(key,src);this.revision++;return true;}
  list(p='C:/'){const key=this.key(p).replace(/\/$/,'')+'/';return [...this.nodes.values()].filter(n=>n.path.toLowerCase()!==key&&n.path.toLowerCase().startsWith(key)&&!n.path.slice(key.length).includes('/')).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.path.localeCompare(b.path));}
  snapshot(){return [...this.nodes.values()].filter(n=>!n.deletePending&&!n.deleteOnCloseObjects).map(n=>({path:n.path,directory:n.directory,data:n.data?.slice(),mtime:n.mtime,...fileMetadata(n)}));}
  metadata(){return [...this.nodes.values()].map(({path,directory,data,mtime})=>({path,directory,size:data?.length||0,mtime}));}
}
