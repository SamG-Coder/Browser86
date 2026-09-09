// ECMA-335 II: bounded CLI metadata and method-body reader. MIT — samgcoder.
// No eval, code generation, external runtime, or assembly-name-specific execution.
import {RuntimeFault,requireThat} from '../errors.js';
const check=(ok,message,detail)=>requireThat(ok,'CLR_METADATA',message,detail);
const coded={
  TypeDefOrRef:[2,[2,1,27]],HasConstant:[2,[4,8,23]],
  HasCustomAttribute:[5,[6,4,1,2,8,9,10,0,14,23,20,17,26,27,32,35,38,39,40,42,44,43]],
  HasFieldMarshal:[1,[4,8]],HasDeclSecurity:[2,[2,6,32]],MemberRefParent:[3,[2,1,26,6,27]],
  HasSemantics:[1,[20,23]],MethodDefOrRef:[1,[6,10]],MemberForwarded:[1,[4,6]],
  Implementation:[2,[38,35,39]],CustomAttributeType:[3,[-1,-1,6,10,-1]],
  ResolutionScope:[2,[0,26,35,1]],TypeOrMethodDef:[1,[2,6]]
};
// Column names are kept alongside the schema so diagnostics remain readable.
const schemas=[
 'Generation:u2 Name:s Mvid:g EncId:g EncBaseId:g',
 'ResolutionScope:cResolutionScope Name:s Namespace:s',
 'Flags:u4 Name:s Namespace:s Extends:cTypeDefOrRef FieldList:t4 MethodList:t6',
 'Field:t4','Flags:u2 Name:s Signature:b','Method:t6',
 'RVA:u4 ImplFlags:u2 Flags:u2 Name:s Signature:b ParamList:t8','Param:t8',
 'Flags:u2 Sequence:u2 Name:s','Class:t2 Interface:cTypeDefOrRef',
 'Class:cMemberRefParent Name:s Signature:b','Type:u2 Parent:cHasConstant Value:b',
 'Parent:cHasCustomAttribute Type:cCustomAttributeType Value:b',
 'Parent:cHasFieldMarshal NativeType:b','Action:u2 Parent:cHasDeclSecurity PermissionSet:b',
 'PackingSize:u2 ClassSize:u4 Parent:t2','Offset:u4 Field:t4','Signature:b',
 'Parent:t2 EventList:t20','Event:t20','EventFlags:u2 Name:s EventType:cTypeDefOrRef',
 'Parent:t2 PropertyList:t23','Property:t23','Flags:u2 Name:s Type:b',
 'Semantics:u2 Method:t6 Association:cHasSemantics',
 'Class:t2 MethodBody:cMethodDefOrRef MethodDeclaration:cMethodDefOrRef',
 'Name:s','Signature:b','MappingFlags:u2 MemberForwarded:cMemberForwarded ImportName:s ImportScope:t26',
 'RVA:u4 Field:t4','Token:u4 FuncCode:u4','Token:u4',
 'HashAlgId:u4 MajorVersion:u2 MinorVersion:u2 BuildNumber:u2 RevisionNumber:u2 Flags:u4 PublicKey:b Name:s Culture:s',
 'Processor:u4','OSPlatformId:u4 OSMajorVersion:u4 OSMinorVersion:u4',
 'MajorVersion:u2 MinorVersion:u2 BuildNumber:u2 RevisionNumber:u2 Flags:u4 PublicKeyOrToken:b Name:s Culture:s HashValue:b',
 'Processor:u4 AssemblyRef:t35','OSPlatformId:u4 OSMajorVersion:u4 OSMinorVersion:u4 AssemblyRef:t35',
 'Flags:u4 Name:s HashValue:b','Flags:u4 TypeDefId:u4 TypeName:s TypeNamespace:s Implementation:cImplementation',
 'Offset:u4 Flags:u4 Name:s Implementation:cImplementation','NestedClass:t2 EnclosingClass:t2',
 'Number:u2 Flags:u2 Owner:cTypeOrMethodDef Name:s','Method:cMethodDefOrRef Instantiation:b',
 'Owner:t42 Constraint:cTypeDefOrRef'
].map(s=>s.split(' ').map(c=>c.split(':')));
const primitive={1:'System.Void',2:'System.Boolean',3:'System.Char',4:'System.SByte',5:'System.Byte',6:'System.Int16',7:'System.UInt16',8:'System.Int32',9:'System.UInt32',10:'System.Int64',11:'System.UInt64',12:'System.Single',13:'System.Double',14:'System.String',24:'System.IntPtr',25:'System.UIntPtr',28:'System.Object'};
const decoder=new TextDecoder('utf-8',{fatal:true});
export class BlobReader {
  constructor(bytes){this.b=bytes;this.p=0;}
  byte(){check(this.p<this.b.length,'Truncated signature.');return this.b[this.p++];}
  uint(){const a=this.byte();if(!(a&128))return a;if((a&192)===128)return ((a&63)<<8)|this.byte();check((a&224)===192,'Invalid compressed unsigned integer.');return ((a&31)*0x1000000+this.byte()*65536+this.byte()*256+this.byte())>>>0;}
}
export class CLIImage {
  constructor(pe){
    this.pe=pe;this.path=pe.name;this.streams=new Map();this.tables=[];this.counts=Array(64).fill(0);this.types=new Map();this.methods=new Map();this.fields=new Map();this.bodies=new Map();
    const dir=pe.directories[14];check(dir.rva&&dir.size>=72,'Missing or truncated IMAGE_COR20_HEADER.');
    const h=pe.rva(dir.rva,72);check(pe.u32(h)>=72&&pe.u32(h)<=dir.size,'Invalid CLI header size.');
    this.runtimeMajor=pe.u16(h+4);this.runtimeMinor=pe.u16(h+6);this.flags=pe.u32(h+16);this.entryToken=pe.u32(h+20);
    const rva=pe.u32(h+8),size=pe.u32(h+12);check(size>=20&&size<=64*1024*1024,'Invalid metadata size.');
    const start=pe.rva(rva,size);this.data=pe.bytes.subarray(start,start+size);this.d=new DataView(this.data.buffer,this.data.byteOffset,size);
    check(this.u32(0)===0x424A5342,'CLI metadata BSJB signature is missing.');
    const versionLength=this.u32(12);this.bounds(16,versionLength);check(versionLength<=256,'Metadata version is too long.');
    this.version=this.text(this.data.subarray(16,16+versionLength)).replace(/\0.*$/s,'');let p=(16+versionLength+3)&~3;
    const streams=this.u16(p+2);p+=4;check(streams>0&&streams<=32,'Invalid metadata stream count.');
    const spans=[];for(let i=0;i<streams;i++){
      const offset=this.u32(p),length=this.u32(p+4);p+=8;let end=p;while(end<this.data.length&&end-p<32&&this.data[end])end++;
      check(end<this.data.length&&end-p<32,'Unterminated metadata stream name.');const name=this.text(this.data.subarray(p,end));p=(end+4)&~3;
      this.bounds(offset,length);check(!this.streams.has(name),'Duplicate metadata stream.',{name});
      check(!spans.some(s=>length&&s.length&&offset<s.offset+s.length&&s.offset<offset+length),'Overlapping metadata streams.');
      spans.push({offset,length});this.streams.set(name,{offset,length});
    }
    check(spans.every(s=>!s.length||s.offset>=p),'Metadata stream overlaps its headers.');
    for(const n of ['#Strings','#Blob'])check(this.streams.has(n),'Missing required metadata heap.',{heap:n});
    const tab=this.streams.get('#~')||this.streams.get('#-');check(tab,'Missing metadata tables stream.');this.tableStream=tab;
    this.bounds(tab.offset,24);p=tab.offset;check(tab.length>=24,'Truncated tables header.');const heaps=this.data[p+6];
    this.heapSizes={s:heaps&1?4:2,g:heaps&2?4:2,b:heaps&4?4:2};
    const valid=this.d.getBigUint64(p+8,true);p+=24;
    for(let i=0;i<64;i++)if(valid&(1n<<BigInt(i))){check(i<schemas.length,'Unsupported metadata table.',{table:i});this.counts[i]=this.u32(p);p+=4;check(this.counts[i]<=1000000,'Metadata row limit exceeded.',{table:i});}
    if(heaps&0x40){this.u32(p);p+=4;}
    const width=kind=>kind==='u2'?2:kind==='u4'?4:this.heapSizes[kind]|| (kind[0]==='t'?(this.counts[Number(kind.slice(1))]<65536?2:4):Math.max(...coded[kind.slice(1)][1].map(t=>this.counts[t]||0))<2**(16-coded[kind.slice(1)][0])?2:4);
    for(let i=0;i<schemas.length;i++){
      const schema=schemas[i],rowSize=schema.reduce((n,[,k])=>n+width(k),0),count=this.counts[i];
      check(p+rowSize*count<=tab.offset+tab.length,'Metadata rows exceed tables stream.',{table:i});this.tables[i]=[null];
      for(let row=1;row<=count;row++){const value={token:((i<<24)|row)>>>0};for(const [name,kind]of schema){const w=width(kind);value[name]=w===2?this.u16(p):this.u32(p);p+=w;}this.tables[i].push(value);}
    }
    // Pointer tables describe unoptimized edits; reject rather than misindex owners.
    requireThat(![3,5,7,19,22].some(i=>this.counts[i]),'CLR_UNSUPPORTED_METADATA','Unoptimized metadata pointer tables are not supported.');
    this.assemblyName=this.counts[32]?this.str(this.tables[32][1].Name):pe.name.split('/').at(-1).replace(/\.(exe|dll)$/i,'');
    for(let i=1;i<=this.counts[2];i++){
      const row=this.tables[2][i];const type={asm:this,token:row.token,row,name:this.str(row.Name),namespace:this.str(row.Namespace)};type.fullName=(type.namespace?type.namespace+'.':'')+type.name;this.types.set(row.token,type);
    }
    for(const row of this.rows(41)){const type=this.types.get(0x02000000|row.NestedClass),parent=this.types.get(0x02000000|row.EnclosingClass);check(type&&parent,'Invalid nested type.');type.fullName=parent.fullName+'+'+type.name;}
    for(let i=1;i<=this.counts[2];i++){
      const type=this.types.get(0x02000000|i),row=type.row,next=this.tables[2][i+1];type.methods=[];type.fields=[];
      const methodsEnd=next?.MethodList||this.counts[6]+1,fieldsEnd=next?.FieldList||this.counts[4]+1;
      check(row.MethodList>=1&&row.MethodList<=methodsEnd&&methodsEnd<=this.counts[6]+1,'Invalid MethodList.');
      check(row.FieldList>=1&&row.FieldList<=fieldsEnd&&fieldsEnd<=this.counts[4]+1,'Invalid FieldList.');
      for(let j=row.MethodList;j<methodsEnd;j++){const r=this.tables[6][j],method={asm:this,row:r,token:r.token,type,name:this.str(r.Name),signature:this.methodSignature(r.Signature)};this.methods.set(r.token,method);type.methods.push(method);}
      for(let j=row.FieldList;j<fieldsEnd;j++){const r=this.tables[4][j],b=new BlobReader(this.blob(r.Signature));check(b.byte()===6,'Invalid field signature.');const field={asm:this,row:r,token:r.token,type,name:this.str(r.Name),fieldType:this.readType(b)};this.fields.set(r.token,field);type.fields.push(field);}
    }
  }
  bounds(p,n){check(Number.isSafeInteger(p)&&p>=0&&Number.isSafeInteger(n)&&n>=0&&p+n<=this.data.length,'Metadata points outside its directory.',{offset:p,length:n});}
  u16(p){this.bounds(p,2);return this.d.getUint16(p,true);}
  u32(p){this.bounds(p,4);return this.d.getUint32(p,true);}
  text(bytes){try{return decoder.decode(bytes);}catch{throw new RuntimeFault('CLR_METADATA','Invalid UTF-8 metadata.');}}
  rows(table){return (this.tables[table]||[]).slice(1);}
  row(token,expected){token>>>=0;const table=token>>>24,index=token&0xffffff;check(expected===undefined||table===expected,'Unexpected metadata token kind.',{token});const row=this.tables[table]?.[index];check(row,'Invalid metadata token.',{token});return row;}
  heap(name,index){const s=this.streams.get(name);check(s&&index>=0&&index<s.length,'Invalid metadata heap index.',{heap:name,index});return {start:s.offset+index,end:s.offset+s.length};}
  str(index){if(!index)return '';const {start,end}=this.heap('#Strings',index);let p=start;while(p<end&&this.data[p])p++;check(p<end,'Unterminated #Strings entry.');return this.text(this.data.subarray(start,p));}
  blob(index,name='#Blob'){if(!index)return new Uint8Array();const {start,end}=this.heap(name,index),r=new BlobReader(this.data.subarray(start,end)),len=r.uint();check(r.p+len<=r.b.length,'Blob extends beyond heap.');return r.b.subarray(r.p,r.p+len);}
  userString(token){check(token>>>24===0x70,'ldstr requires a UserString token.');const b=this.blob(token&0xffffff,'#US');if(!b.length)return '';check(b.length%2===1,'Invalid user-string byte length.');let s='';for(let i=0;i<b.length-1;i+=2)s+=String.fromCharCode(b[i]|(b[i+1]<<8));return s;}
  decode(kind,value){if(!value)return 0;const [bits,tables]=coded[kind],tag=value&((1<<bits)-1),table=tables[tag],row=value>>>bits;check(table>=0&&row>0&&row<=this.counts[table],'Invalid coded metadata index.',{kind,value});return ((table<<24)|row)>>>0;}
  type(token,depth=0){check(depth<64,'Type reference nesting limit exceeded.');if(this.types.has(token))return this.types.get(token);const row=this.row(token);let type;
    if(token>>>24===1){const name=this.str(row.Name),ns=this.str(row.Namespace),scope=this.decode('ResolutionScope',row.ResolutionScope);let assemblyName=null,fullName=(ns?ns+'.':'')+name;
      if(scope>>>24===35)assemblyName=this.str(this.row(scope).Name);else if(scope>>>24===1){const parent=this.type(scope,depth+1);assemblyName=parent.assemblyName;fullName=parent.fullName+'+'+name;}
      type={asm:this,token,row,name,namespace:ns,fullName,assemblyName};
    }else if(token>>>24===27){const sig=this.readType(new BlobReader(this.blob(row.Signature)),depth+1);type={...sig,asm:this,token,row};}
    else throw new RuntimeFault('CLR_METADATA','Token is not a type.',{token});this.types.set(token,type);return type;
  }
  readType(r,depth=0){check(depth<64,'Signature nesting limit exceeded.');const et=r.byte();if(primitive[et])return {et,fullName:primitive[et]};
    if(et===0x1f||et===0x20){r.uint();return this.readType(r,depth+1);}
    if([0x0f,0x10,0x1d,0x45].includes(et)){const element=this.readType(r,depth+1);return {et,element,fullName:element.fullName+({15:'*',16:'&',29:'[]',69:''}[et])};}
    if(et===0x11||et===0x12){const token=this.decode('TypeDefOrRef',r.uint());return {et,asm:this,token,get fullName(){return this.asm.type(this.token).fullName;}};}
    if(et===0x13||et===0x1e){const index=r.uint();return {et,index,fullName:(et===0x13?'!':'!!')+index};}
    if(et===0x15){const category=r.byte();check(category===0x11||category===0x12,'Invalid generic type category.');const token=this.decode('TypeDefOrRef',r.uint()),count=r.uint();check(count<=128,'Too many generic parameters.');const args=Array.from({length:count},()=>this.readType(r,depth+1));return {et,category,asm:this,definition:this.type(token,depth+1),typeArgs:args,get fullName(){return this.definition.fullName;}};}
    if(et===0x14){const element=this.readType(r,depth+1),rank=r.uint(),n=r.uint();check(rank<=32&&n<=rank,'Invalid array rank.');const sizes=Array.from({length:n},()=>r.uint()),nl=r.uint();check(nl<=rank,'Invalid array lower bounds.');const bounds=Array.from({length:nl},()=>r.uint());return {et,element,rank,sizes,bounds,fullName:element.fullName+'['+','.repeat(Math.max(0,rank-1))+']'};}
    throw new RuntimeFault('CLR_UNSUPPORTED_SIGNATURE','Unsupported CLI signature element.',{element:et});
  }
  methodSignature(index){const r=new BlobReader(this.blob(index)),flags=r.byte();check((flags&15)<=5,'Unsupported method calling convention.');const genericCount=flags&0x10?r.uint():0,count=r.uint();check(count<=1024,'Too many method arguments.');const ret=this.readType(r),params=[];for(let i=0;i<count;i++)params.push(this.readType(r));return {hasThis:!!(flags&0x20),flags,genericCount,ret,params};}
  member(token){if(this.methods.has(token))return this.methods.get(token);if(this.fields.has(token))return this.fields.get(token);const row=this.row(token);
    if(token>>>24===43){const method=this.member(this.decode('MethodDefOrRef',row.Method)),r=new BlobReader(this.blob(row.Instantiation));check(r.byte()===0x0a,'Invalid MethodSpec signature.');const count=r.uint();check(count<=128,'Too many method type arguments.');return {...method,methodArgs:Array.from({length:count},()=>this.readType(r))};}
    check(token>>>24===10,'Expected MethodDef, Field, MemberRef or MethodSpec.',{token});const parent=this.decode('MemberRefParent',row.Class);const type=parent>>>24===6?this.member(parent).type:this.type(parent);const b=new BlobReader(this.blob(row.Signature));if(b.b[0]===6){b.byte();return {asm:this,token,row,type,name:this.str(row.Name),fieldType:this.readType(b)};}
    return {asm:this,token,row,type,name:this.str(row.Name),signature:this.methodSignature(row.Signature)};
  }
  methodBody(method){if(this.bodies.has(method.token))return this.bodies.get(method.token);const rva=method.row.RVA;check(rva,'Method has no CIL body.',{method:method.name});const p=this.pe.rva(rva),first=this.pe.bytes[p];let codeRva,size,maxStack=8,localToken=0,flags=0;
    if((first&3)===2){codeRva=rva+1;size=first>>>2;}else{check((first&3)===3,'Invalid CIL method header.');const header=this.pe.u16(p),headerSize=(header>>>12)*4;check(headerSize>=12,'Truncated fat CIL header.');this.pe.rva(rva,headerSize);flags=header&0xfff;maxStack=this.pe.u16(p+2);size=this.pe.u32(p+4);localToken=this.pe.u32(p+8);codeRva=rva+headerSize;}
    check(size<=16*1024*1024&&maxStack<=65535,'CIL body limit exceeded.');const start=this.pe.rva(codeRva,size),code=this.pe.bytes.subarray(start,start+size),locals=[];
    if(localToken){const row=this.row(localToken,17),r=new BlobReader(this.blob(row.Signature));check(r.byte()===7,'Invalid local signature.');const count=r.uint();check(count<=65535,'Too many locals.');for(let i=0;i<count;i++)locals.push(this.readType(r));}
    const clauses=[];if(flags&8){let next=(codeRva+size+3)&~3;for(let section=0;section<64;section++){
      const off=this.pe.rva(next,4),kind=this.pe.bytes[off];check((kind&0x3f)===1,'Unsupported method data section.');const fat=!!(kind&0x40),length=fat?(this.pe.u32(off)>>>8):this.pe.bytes[off+1],step=fat?24:12;check(length>=4&&(length-4)%step===0,'Invalid EH table size.');this.pe.rva(next,length);
      for(let q=off+4;q<off+length;q+=step){const c=fat?{flags:this.pe.u32(q),tryOffset:this.pe.u32(q+4),tryLength:this.pe.u32(q+8),handlerOffset:this.pe.u32(q+12),handlerLength:this.pe.u32(q+16),classToken:this.pe.u32(q+20)}:{flags:this.pe.u16(q),tryOffset:this.pe.u16(q+2),tryLength:this.pe.bytes[q+4],handlerOffset:this.pe.u16(q+5),handlerLength:this.pe.bytes[q+7],classToken:this.pe.u32(q+8)};check(c.tryOffset+c.tryLength<=size&&c.handlerOffset+c.handlerLength<=size,'Exception region exceeds method body.');requireThat(c.flags===0||c.flags===2||c.flags===4,'CLR_UNSUPPORTED_EH','Exception filters are not supported.',{method:method.name});clauses.push(c);}
      if(!(kind&128))break;check(section<63,'Too many method data sections.');next=(next+length+3)&~3;
    }}
    const body={code,locals,maxStack,clauses,initLocals:!!(flags&16)};this.bodies.set(method.token,body);return body;
  }
  validateRunnable({dll=false}={}){requireThat(this.pe.machine===0x14c&&!this.pe.is64,'UNSUPPORTED_CLR_ARCH','Managed execution currently requires an x86 or AnyCPU PE32 image.');requireThat((this.flags&1)&&!(this.flags&0x10),'CLR_MIXED_MODE','Mixed-mode, native-entrypoint and C++/CLI images are not supported.');requireThat(!this.pe.isDll||dll,'PE_DLL','Select a managed EXE, not a DLL.');if(!dll){check(this.entryToken>>>24===6,'Entry point must be a MethodDef token.');this.row(this.entryToken,6);}return this;}
  summary(){return {runtime:'Browser86 CIL interpreter (experimental subset)',assembly:this.assemblyName,metadataVersion:this.version,architecture:this.flags&2?'x86 / CIL':'AnyCPU / CIL',entryToken:this.entryToken,types:this.counts[2],methods:this.counts[6],assemblyReferences:this.rows(35).map(r=>this.str(r.Name))};}
}
