// PE32 parsing, imports/exports, HIGHLOW relocations and bounded resource lookup.
import {RuntimeFault,requireThat,hex} from './errors.js';
import {alignUp} from './memory.js';
const machineNames={0x14C:'x86',0x8664:'x86-64',0xAA64:'ARM64',0x1C4:'ARM'};
export class PEImage {
  constructor(input,name='application.exe') {
    this.bytes=input instanceof Uint8Array?input:new Uint8Array(input);this.name=name;const b=this.bytes;this.d=new DataView(b.buffer,b.byteOffset,b.byteLength);
    this.check(0,64);requireThat(this.u16(0)===0x5A4D,'PE_MZ','Not a Windows PE executable (missing MZ signature).',{name});
    const p=this.u32(0x3C);this.check(p,24);requireThat(this.u32(p)===0x00004550,'PE_SIGNATURE','Not a PE executable. DOS/NE/LE binaries are not supported.',{name});
    this.machine=this.u16(p+4);this.architecture=machineNames[this.machine]||hex(this.machine);this.sectionCount=this.u16(p+6);this.characteristics=this.u16(p+22);this.isDll=!!(this.characteristics&0x2000);
    const optionalSize=this.u16(p+20),o=p+24;this.check(o,optionalSize);this.magic=this.u16(o);this.is64=this.magic===0x20B;
    requireThat(this.magic===0x10B||this.magic===0x20B,'PE_OPTIONAL','Unsupported PE optional header.');
    requireThat(optionalSize>=(this.is64?112:96),'PE_OPTIONAL','Truncated optional header.');
    this.entryRva=this.u32(o+16);this.imageBase=this.is64?Number(this.d.getBigUint64(o+24,true)):this.u32(o+28);
    this.sectionAlignment=this.u32(o+32);this.fileAlignment=this.u32(o+36);this.sizeOfImage=this.u32(o+56);this.sizeOfHeaders=this.u32(o+60);this.subsystem=this.u16(o+68);this.stackReserve=this.is64?Number(this.d.getBigUint64(o+72,true)):this.u32(o+72);
    const dc=this.u32(o+(this.is64?108:92)),ds=this.is64?112:96;
    requireThat(dc<=64 && ds+dc*8<=optionalSize,'PE_DIRECTORIES','Invalid number of PE data directories.');
    this.directories=Array.from({length:16},(_,i)=>i<dc?{rva:this.u32(o+ds+i*8),size:this.u32(o+ds+i*8+4)}:{rva:0,size:0});
    this.managed=!!this.directories[14].rva;
    requireThat(this.sectionCount>0&&this.sectionCount<=96,'PE_SECTIONS','Invalid section count.');
    requireThat(this.sizeOfImage>0&&this.sizeOfImage<=256*1024*1024,'PE_SIZE','PE image exceeds the 256 MiB image limit.');
    requireThat(this.sizeOfHeaders<=b.length&&this.sizeOfHeaders<=this.sizeOfImage,'PE_HEADERS','Invalid header size.');
    requireThat(this.sectionAlignment>0&&this.fileAlignment>0,'PE_ALIGNMENT','Invalid PE alignment.');
    this.sections=[];const table=o+optionalSize;this.check(table,this.sectionCount*40);
    for(let i=0;i<this.sectionCount;i++){const q=table+i*40;const s={name:String.fromCharCode(...b.subarray(q,q+8)).replace(/\0.*$/,''),virtualSize:this.u32(q+8),rva:this.u32(q+12),rawSize:this.u32(q+16),rawOffset:this.u32(q+20),flags:this.u32(q+36)};
      this.check(s.rawOffset,s.rawSize);requireThat(s.rva+Math.max(s.virtualSize,s.rawSize)<=this.sizeOfImage,'PE_SECTION','Section extends beyond SizeOfImage.',{section:s.name});
      requireThat(s.rva>=this.sizeOfHeaders||Math.max(s.virtualSize,s.rawSize)===0,'PE_SECTION','Section overlaps image headers.');
      for(const old of this.sections){const end=s.rva+Math.max(s.virtualSize,s.rawSize),oe=old.rva+Math.max(old.virtualSize,old.rawSize);requireThat(end<=old.rva||oe<=s.rva,'PE_SECTION','Overlapping virtual sections.');}
      this.sections.push(s);
    }
    requireThat(this.entryRva<this.sizeOfImage,'PE_ENTRY','Entrypoint lies outside the image.');
    this.imports=this.parseImports();this.exports=this.parseExports();
  }
  check(p,n){requireThat(Number.isSafeInteger(p)&&p>=0&&Number.isSafeInteger(n)&&n>=0&&p+n<=this.bytes.length,'PE_BOUNDS','PE structure points outside file.',{name:this.name,offset:p,length:n});}
  u16(p){this.check(p,2);return this.d.getUint16(p,true);}
  u32(p){this.check(p,4);return this.d.getUint32(p,true);}
  rva(rva,size=1){requireThat(Number.isInteger(rva)&&rva>=0&&rva+size<=this.sizeOfImage,'PE_RVA','Invalid relative virtual address.');if(rva<this.sizeOfHeaders){requireThat(rva+size<=this.sizeOfHeaders,'PE_RVA','RVA crosses header boundary.');this.check(rva,size);return rva;}
    const s=this.sections.find(s=>rva>=s.rva&&rva+size<=s.rva+s.rawSize);requireThat(s,'PE_RVA','RVA does not reference initialized file data.',{rva:hex(rva),size,name:this.name});const offset=s.rawOffset+rva-s.rva;this.check(offset,size);return offset;}
  strRva(rva,max=4096){const out=[];for(let i=0;i<max;i++){const c=this.bytes[this.rva(rva+i)];if(c===0)return String.fromCharCode(...out);out.push(c);}throw new RuntimeFault('PE_STRING','Unterminated PE name.');}
  parseImports(){const dir=this.directories[1];if(!dir.rva)return [];const list=[];let terminated=false;
    requireThat(dir.size>=20&&dir.size<=16*1024*1024,'PE_IMPORT','Invalid import directory size.');
    for(let n=0;n<Math.min(4096,Math.floor(dir.size/20));n++){const p=this.rva(dir.rva+n*20,20),oft=this.u32(p),name=this.u32(p+12),iat=this.u32(p+16);if(!oft&&!name&&!iat){terminated=true;break;}requireThat(name&&iat,'PE_IMPORT','Malformed import descriptor.');const dll=this.strRva(name),symbols=[];
      for(let i=0;i<65536;i++){const step=this.is64?8:4,q=this.rva((oft||iat)+i*step,step),raw=this.is64?this.d.getBigUint64(q,true):BigInt(this.u32(q));if(raw===0n)break;requireThat(i<65535,'PE_IMPORT','Unterminated import thunk table.');const ordinal=!!(raw&(this.is64?0x8000000000000000n:0x80000000n));let symbol;if(ordinal)symbol=Number(raw&65535n);else{requireThat(raw<=0xFFFFFFFFn,'PE_IMPORT','Invalid import name RVA.');symbol=this.strRva(Number(raw)+2);}requireThat(iat+i*step+step<=this.sizeOfImage,'PE_IMPORT','IAT out of image bounds.');symbols.push({name:symbol,iatRva:iat+i*step});}
      list.push({dll,symbols});}
    requireThat(terminated,'PE_IMPORT','Unterminated import descriptor table.');return list;}
  parseExports(){const dir=this.directories[0],out=new Map();if(!dir.rva)return out;const p=this.rva(dir.rva,40),base=this.u32(p+16),count=this.u32(p+20),named=this.u32(p+24),functions=this.u32(p+28),names=this.u32(p+32),ordinals=this.u32(p+36);requireThat(count<=65536&&named<=count,'PE_EXPORT','Invalid export counts.');
    for(let i=0;i<count;i++){const rva=this.u32(this.rva(functions+i*4,4));if(!rva)continue;requireThat(rva<this.sizeOfImage,'PE_EXPORT','Export points outside image.');const exp={ordinal:base+i,rva};if(rva>=dir.rva&&rva<dir.rva+dir.size)exp.forwarder=this.strRva(rva);out.set(base+i,exp);}
    for(let i=0;i<named;i++){const name=this.strRva(this.u32(this.rva(names+i*4,4))),ordinal=this.u16(this.rva(ordinals+i*2,2));requireThat(ordinal<count,'PE_EXPORT','Invalid export ordinal.');const exp=out.get(base+ordinal);if(exp)out.set(name,exp);}return out;}
  validateRunnable(){requireThat(!this.is64&&this.machine===0x14C,'UNSUPPORTED_ARCH',`${this.name} is ${this.architecture}. This build executes 32-bit x86 only.`);requireThat(!this.managed,'UNSUPPORTED_DOTNET',`${this.name} requires the .NET CLR. A CLR is not implemented in this runtime.`);requireThat(this.subsystem===2||this.subsystem===3,'UNSUPPORTED_SUBSYSTEM',`PE subsystem ${this.subsystem} is not supported. Only Win32 console/GUI user programs are implemented.`);}
  summary(){return {name:this.name,architecture:this.architecture,managed:this.managed,isDll:this.isDll,subsystem:this.subsystem===2?'Windows GUI':this.subsystem===3?'Console':String(this.subsystem),entryRva:hex(this.entryRva),imageBase:hex(this.imageBase),imageBytes:this.sizeOfImage,sections:this.sections.map(s=>({name:s.name,size:s.virtualSize})),imports:this.imports.map(x=>({dll:x.dll,symbols:x.symbols.map(s=>s.name)})),tls:!!this.directories[9].rva,delayImports:!!this.directories[13].rva};}
}
export class PELoader {
  constructor(process){this.p=process;this.m=process.memory;this.vfs=process.vfs;this.modules=new Map();this.order=[];this.loading=0;this.initializers=[];this.tlsIndex=0;}
  findDll(name,from){const p=this.p;const dirs=[p.exePath.slice(0,p.exePath.lastIndexOf('/')),from?.slice(0,from.lastIndexOf('/')),this.vfs.cwd,'C:/Windows/System32','C:/Windows'];for(const d of dirs.filter(Boolean)){const path=this.vfs.path(d+'/'+name);const n=this.vfs.get(path);if(n&&!n.directory)return path;}return null;}
  moduleByBase(base){return this.order.find(m=>m.base===base);}
  load(path,{main=false}={}){path=this.vfs.path(path);const key=path.toLowerCase();if(this.modules.has(key))return this.modules.get(key);
    requireThat(this.order.length<128,'DLL_LIMIT','Too many loaded modules.');const image=new PEImage(this.vfs.readFile(path),path);image.validateRunnable();const size=alignUp(image.sizeOfImage),preferred=image.imageBase;
    requireThat(preferred>=0x10000&&preferred+size<=0xE0000000,'PE_BASE','Preferred image address is outside the supported user address range.');
    const base=this.m.isFree(preferred,size)?preferred:this.m.gap(size);if(base!==preferred)requireThat(image.directories[5].rva,'PE_RELOCATION',`Cannot relocate ${path}: no relocation table is available.`);
    this.m.map(base,size,'rw',path);this.m.write(base,image.bytes.subarray(0,image.sizeOfHeaders));for(const s of image.sections)if(s.rawSize)this.m.write(base+s.rva,image.bytes.subarray(s.rawOffset,s.rawOffset+s.rawSize));
    const module={path,name:path.split('/').at(-1),image,base,size,entry:(base+image.entryRva)>>>0};this.modules.set(key,module);this.order.push(module);
    this.relocate(module);this.p.emit('module',{path,base:hex(base),bytes:size,main});
    for(const descriptor of image.imports){for(const symbol of descriptor.symbols){const address=this.resolve(descriptor.dll,symbol.name,path);this.m.w32(base+symbol.iatRva,address);}}
    requireThat(!image.directories[13].rva,'UNSUPPORTED_DELAY_IMPORT','PE delay-import descriptors are not implemented. Rebuild without delay-load or use a binary without delay imports.',{module:path});
    // Set final permissions after relocations and IAT binding. Shared-page section
    // permissions are unioned so sub-page PE alignments do not clobber neighbours.
    const permissions=new Map();const add=(a,n,perm)=>{for(let page=Math.floor(a/4096);page<Math.ceil((a+n)/4096);page++){const old=permissions.get(page)||'';permissions.set(page,[...new Set(old+perm)].join(''));}};
    add(base,image.sizeOfHeaders,'r');for(const s of image.sections){let perm='';if(s.flags&0x40000000)perm+='r';if(s.flags&0x80000000)perm+='w';if(s.flags&0x20000000)perm+='x';add(base+s.rva,Math.max(s.virtualSize,s.rawSize),perm);}
    this.m.protect(base,size,'');for(const [page,perm]of permissions)this.m.protect(page*4096,4096,perm);
    this.setupTls(module);if(!main&&image.entryRva)this.initializers.push({address:module.entry,args:[base,1,0],label:path+'!DllMain',dll:true});
    return module;
  }
  resolve(dll,name,from=null,depth=0){requireThat(depth<16,'DLL_FORWARDER','Export-forwarding cycle detected.');const canonical=dll.toLowerCase().endsWith('.dll')?dll.toLowerCase():dll.toLowerCase()+'.dll';
    // Built-in system modules take precedence. Original runtime implementation;
    // never load the host OS DLLs or Wine replacements.
    if(this.p.apis.isSystemModule(canonical))return this.p.apis.address(canonical,name);
    const path=this.findDll(canonical,from);if(!path)return this.p.apis.missing(canonical,name,'The application DLL was not present in the package or virtual system directory.');
    const module=this.load(path),exp=module.image.exports.get(name);if(!exp)return this.p.apis.missing(canonical,name,'The packaged DLL does not export this symbol.');
    if(exp.forwarder){const dot=exp.forwarder.lastIndexOf('.');requireThat(dot>0,'DLL_FORWARDER','Malformed forwarded export.');let sym=exp.forwarder.slice(dot+1);if(sym.startsWith('#'))sym=Number(sym.slice(1));return this.resolve(exp.forwarder.slice(0,dot),sym,path,depth+1);}return (module.base+exp.rva)>>>0;
  }
  relocate(module){const {image,base}=module,delta=base-image.imageBase;if(!delta)return;const dir=image.directories[5];let p=base+dir.rva,end=p+dir.size;requireThat(dir.rva+dir.size<=module.size,'PE_RELOCATION','Relocation directory out of image bounds.');
    while(p<end){requireThat(p+8<=end,'PE_RELOCATION','Truncated relocation block.');const page=this.m.u32(p),size=this.m.u32(p+4);requireThat(size>=8&&!(size&1)&&p+size<=end,'PE_RELOCATION','Invalid relocation block size.');for(let q=p+8;q<p+size;q+=2){const item=this.m.u16(q),type=item>>>12,rva=page+(item&4095);if(type===0)continue;requireThat(rva+4<=module.size,'PE_RELOCATION','Relocation target is outside the image.');const address=base+rva;if(type===3)this.m.w32(address,(this.m.u32(address)+delta)>>>0);else if(type===1)this.m.w16(address,this.m.u16(address)+(delta>>>16));else if(type===2)this.m.w16(address,this.m.u16(address)+delta);else throw new RuntimeFault('PE_RELOCATION',`Relocation type ${type} is not implemented.`);}p+=size;}
  }
  setupTls(module){const dir=module.image.directories[9];if(!dir.rva)return;requireThat(dir.size>=24&&dir.rva+24<=module.size,'PE_TLS','Invalid TLS directory.');const a=module.base+dir.rva,start=this.m.u32(a),end=this.m.u32(a+4),indexAddress=this.m.u32(a+8),callbacks=this.m.u32(a+12),zero=this.m.u32(a+16);requireThat(end>=start&&end-start+zero<=16*1024*1024,'PE_TLS','Invalid TLS template size.');const index=this.tlsIndex++;requireThat(index<64,'TLS_LIMIT','Static TLS module limit reached.');const data=this.p.heap.alloc(Math.max(1,end-start+zero),true);if(end>start)this.m.write(data,this.m.read(start,end-start));if(indexAddress)this.m.w32(indexAddress,index);this.m.w32(this.p.tlsArray+index*4,data);
    if(callbacks){for(let i=0;i<128;i++){const ptr=this.m.u32(callbacks+i*4);if(!ptr)return;this.initializers.push({address:ptr,args:[module.base,1,0],label:module.path+'!TLS callback'});}throw new RuntimeFault('PE_TLS','Unterminated TLS callback array.');}
  }
  resource(module,type,name,language=null){const dir=module.image.directories[2];if(!dir.rva)return null;const root=module.base+dir.rva,end=root+dir.size;const bounded=(a,n)=>requireThat(a>=root&&a+n<=end,'PE_RESOURCE','Resource directory is out of bounds.');
    const entries=(offset)=>{const a=root+offset;bounded(a,16);const n=this.m.u16(a+12)+this.m.u16(a+14);requireThat(n<=65536,'PE_RESOURCE','Too many resource entries.');bounded(a+16,n*8);return Array.from({length:n},(_,i)=>{const key=this.m.u32(a+16+i*8),target=this.m.u32(a+20+i*8);let value=key;if(key&0x80000000){const s=root+(key&0x7FFFFFFF);bounded(s,2);const len=this.m.u16(s);bounded(s+2,len*2);value=Array.from({length:len},(_,j)=>String.fromCharCode(this.m.u16(s+2+j*2))).join('');}return {key:value,target};});};
    let offset=0;for(const key of [type,name,language]){const list=entries(offset),entry=key===null?list[0]:list.find(e=>typeof key==='string'?String(e.key).toLowerCase()===key.toLowerCase():e.key===key);if(!entry)return null;if(entry.target&0x80000000)offset=entry.target&0x7FFFFFFF;else{const a=root+entry.target;bounded(a,16);const rva=this.m.u32(a),size=this.m.u32(a+4);requireThat(rva+size<=module.size,'PE_RESOURCE','Resource data is out of bounds.');return {address:module.base+rva,size};}}return null;
  }
}
