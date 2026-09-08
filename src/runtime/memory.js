import {RuntimeFault,requireThat,hex} from './errors.js';
export const PAGE=4096;
export const alignUp=(n,a=PAGE)=>Math.ceil(n/a)*a;
// Explicit Windows-1252 mapping keeps browser and small-ICU Node builds identical.
const ansiSpecial=[0x20AC,0x81,0x201A,0x192,0x201E,0x2026,0x2020,0x2021,0x2C6,0x2030,0x160,0x2039,0x152,0x8D,0x17D,0x8F,0x90,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x2DC,0x2122,0x161,0x203A,0x153,0x9D,0x17E,0x178];
const ansiTable=Array.from({length:256},(_,i)=>String.fromCharCode(i>=128&&i<160?ansiSpecial[i-128]:i));
const ansiReverse=new Map(ansiTable.map((c,i)=>[c,i]));
export function ansiDecode(bytes){let text='',parts=[];for(const b of bytes){text+=ansiTable[b];if(text.length>=8192){parts.push(text);text='';}}parts.push(text);return parts.join('');}
export function ansiEncode(s){return Uint8Array.from(String(s),c=>ansiReverse.get(c)??63);}
export class Memory {
  constructor(limit=256*1024*1024){this.pages=new Map();this.limit=limit;this.allocated=0;this.cacheId=-1;this.cache=null;}
  checkRange(address,length){requireThat(Number.isInteger(address)&&address>=0&&Number.isInteger(length)&&length>=0&&address+length<=0x100000000,'MEMORY_RANGE','Invalid guest address range.',{address:hex(address),length});}
  isMapped(address,length=1){this.checkRange(address,length);if(!length)return true;for(let p=Math.floor(address/PAGE);p<=Math.floor((address+length-1)/PAGE);p++)if(!this.pages.has(p))return false;return true;}
  isFree(address,length){this.checkRange(address,length);if(!length)return true;for(let p=Math.floor(address/PAGE);p<=Math.floor((address+length-1)/PAGE);p++)if(this.pages.has(p))return false;return true;}
  map(address,length,perm='rw',label='anonymous'){
    this.checkRange(address,length);requireThat(address>=0x10000 && length>0,'MEMORY_MAP','The null/low-memory guard is reserved.');
    const start=Math.floor(address/PAGE),end=Math.ceil((address+length)/PAGE);
    requireThat(this.isFree(start*PAGE,(end-start)*PAGE),'MEMORY_OVERLAP','Guest mappings overlap.',{address:hex(address),length,label});
    requireThat(this.allocated+(end-start)*PAGE<=this.limit,'MEMORY_LIMIT','Guest committed-memory limit reached.',{limit:this.limit});
    const buffer=new ArrayBuffer((end-start)*PAGE);
    for(let p=start;p<end;p++)this.pages.set(p,{bytes:new Uint8Array(buffer,(p-start)*PAGE,PAGE),view:new DataView(buffer,(p-start)*PAGE,PAGE),perm,label});
    this.allocated+=(end-start)*PAGE;return address>>>0;
  }
  unmap(address,length){this.checkRange(address,length);for(let p=Math.floor(address/PAGE);p<Math.ceil((address+length)/PAGE);p++)if(this.pages.delete(p))this.allocated-=PAGE;this.cacheId=-1;}
  protect(address,length,perm){requireThat(this.isMapped(address,length),'ACCESS_VIOLATION','Cannot protect unmapped memory.');let old;for(let p=Math.floor(address/PAGE);p<Math.ceil((address+length)/PAGE);p++){const x=this.pages.get(p);old??=x.perm;x.perm=perm;}return old;}
  gap(length,start=0x40000000,end=0x70000000){length=alignUp(length,0x10000);for(let a=alignUp(start,0x10000);a+length<=end;a+=0x10000)if(this.isFree(a,length))return a;throw new RuntimeFault('MEMORY_SPACE','No suitable free guest address range.');}
  page(address,access='r'){
    address>>>=0;const id=address>>>12;let p;
    if(id===this.cacheId)p=this.cache;else {p=this.pages.get(id);this.cacheId=id;this.cache=p;}
    if(!p||!p.perm.includes(access))throw new RuntimeFault('ACCESS_VIOLATION',`${access==='w'?'Write':access==='x'?'Execute':'Read'} access violation at ${hex(address)}.`,{address:hex(address),access,label:p?.label});
    return p;
  }
  u8(a){return this.page(a).bytes[a&4095];}
  i8(a){return this.u8(a)<<24>>24;}
  u16(a){a>>>=0;const o=a&4095;if(o<=4094)return this.page(a).view.getUint16(o,true);return this.u8(a)|(this.u8(a+1)<<8);}
  i16(a){return this.u16(a)<<16>>16;}
  u32(a){a>>>=0;const o=a&4095;if(o<=4092)return this.page(a).view.getUint32(o,true);return (this.u8(a)|(this.u8(a+1)<<8)|(this.u8(a+2)<<16)|(this.u8(a+3)<<24))>>>0;}
  i32(a){return this.u32(a)|0;}
  w8(a,v){this.page(a,'w').bytes[a&4095]=v;}
  w16(a,v){a>>>=0;const o=a&4095;if(o<=4094)this.page(a,'w').view.setUint16(o,v,true);else{this.w8(a,v);this.w8(a+1,v>>>8);}}
  w32(a,v){a>>>=0;const o=a&4095;if(o<=4092)this.page(a,'w').view.setUint32(o,v>>>0,true);else{this.w16(a,v);this.w16(a+2,v>>>16);}}
  read(a,n){this.checkRange(a,n);requireThat(n<=this.limit,'MEMORY_LIMIT','Read exceeds transfer limit.');const out=new Uint8Array(n);for(let i=0;i<n;){const o=(a+i)&4095,k=Math.min(PAGE-o,n-i);out.set(this.page(a+i).bytes.subarray(o,o+k),i);i+=k;}return out;}
  write(a,data){this.checkRange(a,data.length);for(let i=0;i<data.length;){const o=(a+i)&4095,k=Math.min(PAGE-o,data.length-i);this.page(a+i,'w').bytes.set(data.subarray(i,i+k),o);i+=k;}}
  fill(a,n,v=0){this.checkRange(a,n);for(let i=0;i<n;){const o=(a+i)&4095,k=Math.min(PAGE-o,n-i);this.page(a+i,'w').bytes.fill(v,o,o+k);i+=k;}}
  cstr(a,max=1024*1024){if(!a)return '';const bytes=[];for(let i=0;i<max;i++){const c=this.u8(a+i);if(!c)return ansiDecode(bytes);bytes.push(c);}throw new RuntimeFault('STRING_LIMIT','Unterminated ANSI guest string.');}
  wstr(a,max=512*1024){if(!a)return '';const chunks=[];let s='';for(let i=0;i<max;i++){const c=this.u16(a+i*2);if(!c)return chunks.join('')+s;s+=String.fromCharCode(c);if(s.length>=4096){chunks.push(s);s='';}}throw new RuntimeFault('STRING_LIMIT','Unterminated UTF-16 guest string.');}
  string(a,s,wide=false,capacity=Infinity){if(wide){const n=Math.min(s.length,Math.max(0,capacity-1));for(let i=0;i<n;i++)this.w16(a+i*2,s.charCodeAt(i));if(capacity>0)this.w16(a+n*2,0);return n;}
    const bytes=ansiEncode(s),n=Math.min(bytes.length,Math.max(0,capacity-1));this.write(a,bytes.subarray(0,n));if(capacity>0)this.w8(a+n,0);return n;}
  mappings(){const out=[];for(const [id,p] of [...this.pages.entries()].sort((a,b)=>a[0]-b[0])){const prev=out.at(-1);if(prev&&prev.end===id*PAGE&&prev.perm===p.perm&&prev.label===p.label)prev.end+=PAGE;else out.push({start:id*PAGE,end:(id+1)*PAGE,perm:p.perm,label:p.label});}return out;}
}
export class Heap {
  constructor(memory,start=0x20000000,end=0x30000000){this.m=memory;this.top=start;this.end=end;this.blocks=new Map();this.freeBlocks=[];}
  alloc(size,zero=false){requireThat(Number.isInteger(size)&&size>=0&&size<=64*1024*1024,'HEAP_LIMIT','Invalid or excessive heap allocation.',{size});size=alignUp(Math.max(16,size),16);let address;
    const i=this.freeBlocks.findIndex(b=>b.size>=size);if(i>=0){const b=this.freeBlocks[i];address=b.address;if(b.size===size)this.freeBlocks.splice(i,1);else{b.address+=size;b.size-=size;}}
    else {address=this.top;requireThat(address+size<=this.end,'HEAP_LIMIT','Guest heap address space exhausted.');const first=Math.floor(address/PAGE)*PAGE,last=alignUp(address+size);for(let p=first;p<last;p+=PAGE)if(!this.m.isMapped(p))this.m.map(p,PAGE,'rw','process heap');this.top+=size;}
    this.blocks.set(address,size);if(zero)this.m.fill(address,size);return address;
  }
  free(address){if(!address)return true;const size=this.blocks.get(address);if(!size)return false;this.blocks.delete(address);this.freeBlocks.push({address,size});this.freeBlocks.sort((a,b)=>a.address-b.address);for(let i=this.freeBlocks.length-2;i>=0;i--){const a=this.freeBlocks[i],b=this.freeBlocks[i+1];if(a.address+a.size===b.address){a.size+=b.size;this.freeBlocks.splice(i+1,1);}}return true;}
  realloc(a,n,zero=false){if(!a)return this.alloc(n,zero);const old=this.blocks.get(a);requireThat(old,'HEAP_POINTER','Invalid heap block.');const b=this.alloc(n,zero);this.m.write(b,this.m.read(a,Math.min(n,old)));this.free(a);return b;}
  string(s,wide=false){const a=this.alloc((s.length+1)*(wide?2:1));this.m.string(a,s,wide);return a;}
}
