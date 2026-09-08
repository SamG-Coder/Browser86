import {RuntimeFault,requireThat} from './errors.js';
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
    this.nodes=new Map();this.cwd='C:/app';this.revision=0;this.limit=limit;this.bytes=0;
    this.mkdir('C:/');this.mkdir('C:/app');this.mkdir('C:/Windows/System32');this.mkdir('C:/Temp');this.mkdir('C:/Users/Browser/Documents');
    for(const e of entries){const p=/^[a-z]:/i.test(e.path)?e.path:'C:/app/'+e.path;e.directory?this.mkdir(p):this.writeFile(p,e.data);}
    this.revision=0;
  }
  path(p){return normalizePath(p,this.cwd);}
  key(p){return this.path(p).toLowerCase();}
  get(p){return this.nodes.get(this.key(p));}
  exists(p){return !!this.get(p);}
  mkdir(p){const path=this.path(p);const parts=path.slice(3).split('/').filter(Boolean);let current='C:/';
    if(!this.nodes.has('c:/'))this.nodes.set('c:/',{path:'C:/',directory:true,mtime:Date.now()});
    for(const x of parts){current+=(current.endsWith('/')?'':'/')+x;const key=current.toLowerCase(),old=this.nodes.get(key);requireThat(!old||old.directory,'VFS_NOT_DIRECTORY','A parent path is a file.',{path:current});if(!old){this.nodes.set(key,{path:current,directory:true,mtime:Date.now()});this.revision++;}}
    return true;
  }
  writeFile(p,bytes){const path=this.path(p);const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const old=this.get(path);requireThat(!old?.directory,'VFS_IS_DIRECTORY','Cannot write a directory.',{path});const newSize=this.bytes-(old?.data.length||0)+data.length;requireThat(newSize<=this.limit,'VFS_QUOTA','Virtual disk quota exceeded.');this.mkdir(path.slice(0,path.lastIndexOf('/'))||'C:/');this.nodes.set(path.toLowerCase(),{path,directory:false,data:data.slice(),mtime:Date.now()});this.bytes=newSize;this.revision++;return true;}
  readFile(p){const n=this.get(p);requireThat(n&&!n.directory,'VFS_NOT_FOUND','Virtual file not found.',{path:this.path(p)});return n.data;}
  writeAt(p,position,bytes){requireThat(Number.isSafeInteger(position)&&position>=0,'VFS_POSITION','Invalid file position.');const old=this.readFile(p),size=Math.max(old.length,position+bytes.length);requireThat(size<=this.limit && this.bytes-old.length+size<=this.limit,'VFS_QUOTA','Virtual disk quota exceeded.');const data=new Uint8Array(size);data.set(old);data.set(bytes,position);this.writeFile(p,data);return bytes.length;}
  remove(p){const key=this.key(p),n=this.nodes.get(key);requireThat(key!=='c:/','VFS_OPERATION','The virtual drive root cannot be removed.');if(!n)return false;if(n.directory)requireThat(![...this.nodes.keys()].some(k=>k.startsWith(key+'/')),'VFS_NOT_EMPTY','Directory is not empty.');this.bytes-=n.data?.length||0;this.nodes.delete(key);this.revision++;return true;}
  rename(from,to){const src=this.get(from),path=this.path(to),key=this.key(to);requireThat(src,'VFS_NOT_FOUND','Source file does not exist.');requireThat(!src.directory,'VFS_OPERATION','Directory renaming is not implemented.');requireThat(!this.exists(to)||this.key(from)===key,'VFS_EXISTS','Destination exists.');this.mkdir(path.slice(0,path.lastIndexOf('/'))||'C:/');this.nodes.delete(this.key(from));this.nodes.set(key,{...src,path,mtime:Date.now()});this.revision++;return true;}
  list(p='C:/'){const key=this.key(p).replace(/\/$/,'')+'/';return [...this.nodes.values()].filter(n=>n.path.toLowerCase()!==key&&n.path.toLowerCase().startsWith(key)&&!n.path.slice(key.length).includes('/')).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.path.localeCompare(b.path));}
  snapshot(){return [...this.nodes.values()].map(n=>({path:n.path,directory:n.directory,data:n.data?.slice(),mtime:n.mtime}));}
  metadata(){return [...this.nodes.values()].map(({path,directory,data,mtime})=>({path,directory,size:data?.length||0,mtime}));}
}
