// Original bounded ECMA-335 metadata reader. MIT — samgcoder.
// No host eval, generated JavaScript, Mono, or framework binaries are involved.
import {PEImage} from '../pe.js';
import {RuntimeFault, requireThat} from '../errors.js';

const coded = {
  TypeDefOrRef:[2,[2,1,27]], HasConstant:[2,[4,8,23]],
  HasCustomAttribute:[5,[6,4,1,2,8,9,10,0,14,23,20,17,26,27,32,35,38,39,40,42,44,43]],
  HasFieldMarshal:[1,[4,8]], HasDeclSecurity:[2,[2,6,32]],
  MemberRefParent:[3,[2,1,26,6,27]], HasSemantics:[1,[20,23]],
  MethodDefOrRef:[1,[6,10]], MemberForwarded:[1,[4,6]],
  Implementation:[2,[38,35,39]], CustomAttributeType:[3,[null,null,6,10,null]],
  ResolutionScope:[2,[0,26,35,1]], TypeOrMethodDef:[1,[2,6]],
};
// u2/u4 are integers; s/b/g are heap indexes; numbers are table indexes.
const schemas = [
 ['u2','s','g','g','g'], ['ResolutionScope','s','s'],
 ['u4','s','s','TypeDefOrRef',4,6], [4], ['u2','s','b'], [6],
 ['u4','u2','u2','s','b',8], [8], ['u2','u2','s'], [2,'TypeDefOrRef'],
 ['MemberRefParent','s','b'], ['u2','HasConstant','b'],
 ['HasCustomAttribute','CustomAttributeType','b'], ['HasFieldMarshal','b'],
 ['u2','HasDeclSecurity','b'], ['u2','u4',2], ['u4',4], ['b'], [2,20], [20],
 ['u2','s','TypeDefOrRef'], [2,23], [23], ['u2','s','b'],
 ['u2',6,'HasSemantics'], [2,'MethodDefOrRef','MethodDefOrRef'], ['s'], ['b'],
 ['u2','MemberForwarded','s',26], ['u4',4], ['u4','u4'], ['u4'],
 ['u4','u2','u2','u2','u2','u4','b','s','s'], ['u4'], ['u4','u4','u4'],
 ['u2','u2','u2','u2','u4','b','s','s','b'], ['u4',35], ['u4','u4','u4',35],
 ['u4','s','b'], ['u4','u4','s','s','Implementation'],
 ['u4','u4','s','Implementation'], [2,2], ['u2','u2','TypeOrMethodDef','s'],
 ['MethodDefOrRef','b'], [42,'TypeDefOrRef'],
];
const primitives = {1:'System.Void',2:'System.Boolean',3:'System.Char',4:'System.SByte',5:'System.Byte',6:'System.Int16',7:'System.UInt16',8:'System.Int32',9:'System.UInt32',10:'System.Int64',11:'System.UInt64',12:'System.Single',13:'System.Double',14:'System.String',22:'System.TypedReference',24:'System.IntPtr',25:'System.UIntPtr',28:'System.Object'};
const td = new TextDecoder('utf-8', {fatal:true});
function bad(message, detail={}) { throw new RuntimeFault('CLR_METADATA', message, detail); }
function ok(condition, message, detail) { if (!condition) bad(message,detail); }
export function decodeCoded(kind,value) {
 const [bits,tables]=coded[kind], tag=value&((1<<bits)-1), row=value>>>bits;
 if (!row) return 0;
 ok(tables[tag]!==null && tables[tag]!==undefined, 'Invalid '+kind+' metadata tag.');
 return (tables[tag]*0x1000000+row)>>>0;
}
export function tokenText(token) { return '0x'+(token>>>0).toString(16).padStart(8,'0'); }

export class SignatureReader {
 constructor(bytes, assembly) { this.bytes=bytes; this.pos=0; this.assembly=assembly; }
 byte() { ok(this.pos<this.bytes.length,'Truncated signature.'); return this.bytes[this.pos++]; }
 compressed() {
  const b=this.byte(); if(!(b&128))return b;
  if((b&192)===128)return ((b&63)<<8)|this.byte();
  ok((b&224)===192,'Invalid compressed integer.');
  return ((b&31)*0x1000000+(this.byte()<<16)+(this.byte()<<8)+this.byte())>>>0;
 }
 type(depth=0) {
  ok(depth<48,'Signature nesting limit reached.'); let e=this.byte();
  while(e===0x1f||e===0x20){this.compressed();e=this.byte();}
  if(primitives[e])return {kind:'primitive',name:primitives[e],element:e};
  if(e===0x11||e===0x12){const token=decodeCoded('TypeDefOrRef',this.compressed());return {kind:e===0x11?'valuetype':'class',token,assembly:this.assembly};}
  if(e===0x0f||e===0x10||e===0x1d||e===0x45)return {kind:({15:'pointer',16:'byref',29:'array',69:'pinned'})[e],type:this.type(depth+1)};
  if(e===0x13||e===0x1e)return {kind:e===0x13?'var':'mvar',index:this.compressed()};
  if(e===0x15){const base=this.type(depth+1),n=this.compressed();ok(n<=256,'Too many generic type arguments.');return {kind:'generic',base,args:Array.from({length:n},()=>this.type(depth+1))};}
  if(e===0x14){const type=this.type(depth+1),rank=this.compressed(),n=this.compressed();ok(rank<=32&&n<=rank,'Invalid array rank.');const sizes=Array.from({length:n},()=>this.compressed()),m=this.compressed();ok(m<=rank,'Invalid array lower bounds.');return {kind:'mdarray',type,rank,sizes,lowerBounds:Array.from({length:m},()=>this.compressed())};}
  if(e===0x1b)return {kind:'fnptr',signature:this.method()};
  bad('Unsupported signature element '+tokenText(e));
 }
 method() {
  const flags=this.byte();
  if((flags&15)===6)return {field:true,type:this.type()};
  if((flags&15)===7){const n=this.compressed();ok(n<=65536,'Too many locals.');return {locals:Array.from({length:n},()=>this.type())};}
  const genericCount=(flags&16)?this.compressed():0,n=this.compressed();ok(n<=4096,'Too many method parameters.');
  const ret=this.type(),params=[];
  for(let i=0;i<n;i++){if(this.bytes[this.pos]===0x41)this.pos++;params.push(this.type());}
  return {flags,hasThis:!!(flags&32),genericCount,ret,params};
 }
}

export class ManagedAssembly {
 constructor(input,name='managed.exe') {
  this.image=input instanceof PEImage?input:new PEImage(input,name); this.path=name;
  const image=this.image;ok(image.managed,'PE has no CLR header.');
  const dir=image.directories[14];ok(dir.size>=72,'Truncated CLR header.');
  const h=image.rva(dir.rva,72);ok(image.u32(h)>=72,'Invalid CLR header size.');
  this.flags=image.u32(h+16);this.entryToken=image.u32(h+20);
  this.metadataRva=image.u32(h+8);this.metadataSize=image.u32(h+12);
  ok(this.metadataSize>=20&&this.metadataSize<=128*1024*1024,'Invalid metadata length.');
  const p=image.rva(this.metadataRva,this.metadataSize);
  this.bytes=image.bytes.subarray(p,p+this.metadataSize);this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);
  this.check(0,20);ok(this.u32(0)===0x424a5342,'Invalid CLR metadata signature.');
  const versionSize=this.u32(12);this.check(16,versionSize);ok(versionSize<=1024,'Oversized CLR version.');
  this.runtimeVersion=td.decode(this.bytes.subarray(16,16+versionSize)).replace(/\0.*$/s,'');
  let q=(16+versionSize+3)&~3;this.check(q,4);const streamCount=this.u16(q+2);q+=4;
  ok(streamCount>0&&streamCount<=32,'Invalid metadata stream count.');this.streams=new Map();
  for(let i=0;i<streamCount;i++){
   const offset=this.u32(q),size=this.u32(q+4);q+=8;const start=q;
   while(this.byte(q)!==0){q++;ok(q-start<32,'Metadata stream name is too long.');}
   const streamName=td.decode(this.bytes.subarray(start,q));q=(q+4)&~3;
   this.check(offset,size);ok(!this.streams.has(streamName),'Duplicate metadata stream.');
   this.streams.set(streamName,this.bytes.subarray(offset,offset+size));
  }
  this.parseTables();this.types=new Map();this.methods=new Map();this.fields=new Map();this.refCache=new Map();
  const ar=this.row(32,1,false);this.name=ar?this.string(ar[7]):name.split(/[\\/]/).at(-1).replace(/\.(exe|dll)$/i,'');
  this.version=ar?ar.slice(1,5).join('.'):'';
  this.references=this.rows(35).map(r=>({name:this.string(r[6]),version:r.slice(0,4).join('.'),publicKeyToken:Array.from(this.blob(r[5]),b=>b.toString(16).padStart(2,'0')).join('')}));
  this.indexDefinitions();
 }
 check(p,n) { ok(Number.isSafeInteger(p)&&Number.isSafeInteger(n)&&p>=0&&n>=0&&p+n<=this.bytes.length,'Metadata points outside its stream.',{offset:p,length:n}); }
 byte(p){this.check(p,1);return this.bytes[p];} u16(p){this.check(p,2);return this.view.getUint16(p,true);} u32(p){this.check(p,4);return this.view.getUint32(p,true);}
 parseTables() {
  const b=this.streams.get('#~')||this.streams.get('#-');ok(b&&b.length>=24,'Missing CLR tables stream.');
  this.tableBytes=b;const d=new DataView(b.buffer,b.byteOffset,b.byteLength);this.tableView=d;this.counts=new Array(64).fill(0);this.tables=new Map();
  const heapSizes=b[6],valid=d.getBigUint64(8,true);let p=24,total=0;
  const readCount=()=>{ok(p+4<=b.length,'Truncated table row counts.');const n=d.getUint32(p,true);p+=4;return n;};
  for(let i=0;i<64;i++)if(valid&(1n<<BigInt(i))){const n=readCount();ok(schemas[i],'Unsupported metadata table '+i);ok(n<=1000000,'Metadata table limit exceeded.');this.counts[i]=n;total+=n;}
  ok(total<=2000000,'Metadata row limit exceeded.');
  if(heapSizes&0x40)readCount();
  const size=field=>{
   if(field==='u2')return 2;if(field==='u4')return 4;
   if(field==='s'||field==='g'||field==='b')return heapSizes&({s:1,g:2,b:4})[field]?4:2;
   if(typeof field==='number')return this.counts[field]>=65536?4:2;
   const [bits,tables]=coded[field];return Math.max(...tables.filter(x=>x!==null).map(x=>this.counts[x]))>=(1<<(16-bits))?4:2;
  };
  for(let i=0;i<schemas.length;i++)if(this.counts[i]){
   const widths=schemas[i].map(size),rowSize=widths.reduce((a,b)=>a+b,0),bytes=rowSize*this.counts[i];
   ok(p+bytes<=b.length,'Truncated metadata table '+i);this.tables.set(i,{offset:p,widths,rowSize});p+=bytes;
  }
 }
 row(table,rid,required=true) {
  const t=this.tables.get(table);
  if(!t||!Number.isInteger(rid)||rid<1||rid>this.counts[table]){if(!required)return null;bad('Invalid metadata row.',{table,row:rid,assembly:this.path});}
  let p=t.offset+(rid-1)*t.rowSize;
  return t.widths.map(n=>{const value=n===2?this.tableView.getUint16(p,true):this.tableView.getUint32(p,true);p+=n;return value;});
 }
 rows(table){return Array.from({length:this.counts[table]},(_,i)=>this.row(table,i+1));}
 tokenRow(token){return this.row(token>>>24,token&0xffffff);}
 string(index) {
  if(!index)return '';const heap=this.streams.get('#Strings');ok(heap&&index<heap.length,'Invalid string heap index.');
  let p=index;while(p<heap.length&&heap[p])p++;ok(p<heap.length,'Unterminated metadata string.');return td.decode(heap.subarray(index,p));
 }
 heapBlob(heapName,index) {
  if(!index)return new Uint8Array();const heap=this.streams.get(heapName);ok(heap&&index<heap.length,'Invalid '+heapName+' heap index.');
  const reader=new SignatureReader(heap.subarray(index),this),length=reader.compressed(),p=index+reader.pos;
  ok(p+length<=heap.length,'Truncated '+heapName+' value.');return heap.subarray(p,p+length);
 }
 blob(index){return this.heapBlob('#Blob',index);}
 userString(token){ok(token>>>24===0x70,'Invalid user-string token.');const b=this.heapBlob('#US',token&0xffffff);if(!b.length)return '';ok((b.length&1)===1,'Malformed UTF-16 user string.');return new TextDecoder('utf-16le').decode(b.subarray(0,b.length-1));}
 signature(index){return new SignatureReader(this.blob(index),this).method();}
 typeSig(token){if(token>>>24===27)return new SignatureReader(this.blob(this.tokenRow(token)[0]),this).type();return {kind:'class',token,assembly:this};}
 typeName(sig) {
  if(!sig)return 'System.Void';if(sig.name)return sig.name;
  if(sig.kind==='generic')return this.typeName(sig.base);
  if(['array','byref','pointer','pinned','mdarray'].includes(sig.kind))return this.typeName(sig.type)+({array:'[]',byref:'&',pointer:'*',pinned:'',mdarray:'[,]'}[sig.kind]);
  if(sig.kind==='var'||sig.kind==='mvar')return (sig.kind==='var'?'!':'!!')+sig.index;
  if(sig.assembly&&sig.assembly!==this)return sig.assembly.typeName(sig);
  const token=sig.token;
  if(token>>>24===27)return this.typeName(this.typeSig(token));
  if(token>>>24===2){const t=this.types.get(token);if(t)return t.name;}
  const r=this.tokenRow(token);if(token>>>24===1)return this.string(r[2])?this.string(r[2])+'.'+this.string(r[1]):this.string(r[1]);
  if(token>>>24===2)return this.string(r[2])?this.string(r[2])+'.'+this.string(r[1]):this.string(r[1]);
  bad('Token is not a type.',{token:tokenText(token)});
 }
 indexDefinitions() {
  const types=this.rows(2);
  types.forEach((r,i)=>{const token=0x02000001+i;this.types.set(token,{assembly:this,token,flags:r[0],name:this.typeName({token}),baseToken:decodeCoded('TypeDefOrRef',r[3]),methods:[],fields:[],interfaces:[]});});
  for(const r of this.rows(41)){const inner=this.types.get(0x02000000+r[0]),outer=this.types.get(0x02000000+r[1]);ok(inner&&outer,'Invalid nested type.');inner.name=outer.name+'+'+inner.name.split('.').at(-1);}
  for(let i=0;i<types.length;i++){
   const r=types[i],next=types[i+1],type=this.types.get(0x02000001+i);
   for(let rid=r[4];rid<(next?next[4]:this.counts[4]+1);rid++){
    const x=this.row(4,rid),token=0x04000000+rid,field={assembly:this,token,owner:type,flags:x[0],name:this.string(x[1]),type:this.signature(x[2]).type};
    this.fields.set(token,field);type.fields.push(field);
   }
   for(let rid=r[5];rid<(next?next[5]:this.counts[6]+1);rid++){
    const x=this.row(6,rid),token=0x06000000+rid,method={assembly:this,token,owner:type,rva:x[0],implFlags:x[1],flags:x[2],name:this.string(x[3]),signature:this.signature(x[4])};
    this.methods.set(token,method);type.methods.push(method);
   }
  }
  for(const r of this.rows(9)){const type=this.types.get(0x02000000+r[0]);ok(type,'Invalid interface implementation.');type.interfaces.push(this.typeSig(decodeCoded('TypeDefOrRef',r[1])));}
  for(const r of this.rows(28)){
   const method=this.methods.get(decodeCoded('MemberForwarded',r[1]));
   if(method)method.pinvoke={flags:r[0],name:this.string(r[2]),dll:this.string(this.row(26,r[3])[0])};
  }
  for(const r of this.rows(11)){const field=this.fields.get(decodeCoded('HasConstant',r[1]));if(field){field.constantType=r[0]&255;field.constant=this.blob(r[2]);}}
  for(const r of this.rows(29)){const field=this.fields.get(0x04000000+r[1]);if(field)field.rva=r[0];}
 }
 member(token) {
  if(this.methods.has(token))return this.methods.get(token);
  if(this.fields.has(token))return this.fields.get(token);
  if(this.refCache.has(token))return this.refCache.get(token);
  if(token>>>24===43){const r=this.tokenRow(token),base=this.member(decodeCoded('MethodDefOrRef',r[0])),s=new SignatureReader(this.blob(r[1]),this);ok(s.byte()===10,'Invalid MethodSpec signature.');const n=s.compressed();ok(n<=256,'Too many generic method arguments.');const value={...base,specToken:token,methodArgs:Array.from({length:n},()=>s.type())};this.refCache.set(token,value);return value;}
  ok(token>>>24===10,'Expected method/field token.',{token:tokenText(token)});
  const r=this.tokenRow(token),parent=decodeCoded('MemberRefParent',r[0]);
  const value={assembly:this,token,parent,ownerSig:this.typeSig(parent),name:this.string(r[1]),signature:this.signature(r[2]),reference:true};
  this.refCache.set(token,value);return value;
 }
 body(method) {
  if(method.body)return method.body;ok(method.rva,'Method has no CIL body.',{method:method.name});
  const image=this.image,p=image.rva(method.rva,1),first=image.bytes[p];let codeOffset,size,maxStack,localToken=0,flags=0;
  if((first&3)===2){codeOffset=p+1;size=first>>>2;maxStack=8;}
  else {ok((first&3)===3,'Invalid CIL method header.');const h=image.u16(p),words=h>>>12;ok(words>=3,'Truncated fat method header.');codeOffset=p+words*4;maxStack=image.u16(p+2);size=image.u32(p+4);localToken=image.u32(p+8);flags=h&4095;}
  ok(size<=16*1024*1024&&maxStack<=65535,'Method body limit exceeded.');image.rva(method.rva+codeOffset-p,size);
  const code=image.bytes.subarray(codeOffset,codeOffset+size);let locals=[];
  if(localToken){ok(localToken>>>24===17,'Invalid local signature token.');locals=this.signature(this.tokenRow(localToken)[0]).locals;ok(locals,'Expected local variable signature.');}
  const clauses=[];
  if(flags&8){let at=(codeOffset+size+3)&~3,more=true;
   for(let section=0;more;section++){
    ok(section<64,'Too many method sections.');image.check(at,4);const kind=image.bytes[at],fat=!!(kind&64);more=!!(kind&128);
    ok((kind&63)===1,'Unsupported CIL method section.');const length=fat?(image.bytes[at+1]|image.bytes[at+2]<<8|image.bytes[at+3]<<16):image.bytes[at+1],step=fat?24:12;
    ok(length>=4&&(length-4)%step===0,'Invalid exception table size.');image.check(at,length);
    for(let c=at+4;c<at+length;c+=step){
     const clause=fat?{flags:image.u32(c),tryOffset:image.u32(c+4),tryLength:image.u32(c+8),handlerOffset:image.u32(c+12),handlerLength:image.u32(c+16),classToken:image.u32(c+20)}:{flags:image.u16(c),tryOffset:image.u16(c+2),tryLength:image.bytes[c+4],handlerOffset:image.u16(c+5),handlerLength:image.bytes[c+7],classToken:image.u32(c+8)};
     ok(clause.tryOffset+clause.tryLength<=size&&clause.handlerOffset+clause.handlerLength<=size,'Exception region outside method.');clauses.push(clause);
    }
    at=(at+length+3)&~3;
   }
  }
  return method.body={code,view:new DataView(code.buffer,code.byteOffset,code.byteLength),maxStack,locals,clauses,initLocals:!!(flags&16)};
 }
 validateRunnable({library=false}={}) {
  const image=this.image;
  requireThat(!image.is64&&image.machine===0x14c,'CLR_UNSUPPORTED_ARCH','The managed runtime currently uses 32-bit pointers; PE32 x86 and AnyCPU assemblies are supported.');
  requireThat((this.flags&1)!==0&&(this.flags&0x10)===0,'CLR_MIXED_MODE','Mixed-mode C++/CLI, native CLR entrypoints and native images are not supported. Supply a pure-IL assembly.');
  requireThat(!image.isDll||library,'PE_DLL','Select a managed executable, not a DLL.');
  if(!library)requireThat(this.entryToken>>>24===6&&this.methods.has(this.entryToken),'CLR_ENTRY','The assembly has no supported managed Main entrypoint.');
  requireThat(image.subsystem===2||image.subsystem===3,'UNSUPPORTED_SUBSYSTEM','Only console and Windows GUI managed applications are supported.');
 }
 summary(){return {...this.image.summary(),managed:true,runtime:'cil',architecture:(this.flags&2)?'x86 .NET':'AnyCPU .NET',assembly:this.name,runtimeVersion:this.runtimeVersion,clrFlags:this.flags,assemblyReferences:this.references,managedMethods:this.methods.size,compatibility:'Experimental CIL and .NET Framework API subset; not full CLR or Framework compatibility.'};}
}
