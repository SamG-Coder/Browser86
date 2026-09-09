// Cooperative ECMA-335 evaluation-stack interpreter. MIT — samgcoder.
import {PEImage} from '../pe.js';
import {RuntimeFault,requireThat,hex} from '../errors.js';
import {shellArguments} from '../command-line.js';
import {CLIImage} from './metadata.js';
import {FloatValue,floating,number,unref,ref,clone,truth,text,managedError,ManagedException,raise,nonnull,arrayIndex,convert,binary,compare} from './values.js';
import {FrameworkLibrary} from './bcl.js';
const builtins=new Set(['mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','Microsoft.VisualBasic']);
const guard=(ok,message,detail)=>requireThat(ok,'CLR_IL',message,detail);
export class ManagedRuntime {
  constructor(process,pe){
    this.p=process;this.frames=[];this.assemblies=new Map();this.staticFields=new Map();this.initialized=new Map();this.allocations=0;this.allocatedBytes=0;this.heapBudget=process.memory.limit||128*1024*1024;
    this.main=this.addAssembly(new CLIImage(pe).validateRunnable());this.library=new FrameworkLibrary(this);this.forms=this.library.forms;this.lastInstruction=null;this.trace=[];
    const entry=this.main.methods.get(this.main.entryToken),sig=entry.signature;
    guard(!sig.hasThis&&[0,1].includes(sig.params.length)&&(!sig.params.length||sig.params[0].fullName==='System.String[]')&&['System.Void','System.Int32'].includes(sig.ret.fullName),'Unsupported managed Main signature.');
    this.entry=entry;this.args=this.array({fullName:'System.String'},shellArguments(process.commandLine).slice(1));
  }
  start(){this.invoke(this.entry,this.entry.signature.params.length?[this.args]:[],value=>this.p.exit(number(value)||0));}
  allocate(bytes=64){guard(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid managed allocation size.');this.allocatedBytes+=bytes;this.allocations++;requireThat(this.allocatedBytes<=this.heapBudget,'CLR_HEAP_LIMIT','Managed allocation budget exhausted. This prototype uses host GC and a conservative cumulative allocation budget.',{budget:this.heapBudget});}
  array(element,values){if(typeof values==='number'){if(!Number.isInteger(values)||values<0)raise('OverflowException','Invalid array length.');requireThat(values<=1000000,'CLR_ARRAY_LIMIT','Managed array exceeds the one-million-element limit.');this.allocate(values*16+48);values=Array.from({length:values},()=>this.defaultValue(element));}else{this.allocate(values.length*16+48);values=values.map(clone);}return {tag:'array',element,type:{fullName:element.fullName+'[]'},values};}
  defaultValue(type){if(type.et===0x45)return this.defaultValue(type.element);if(type.et===0x11){const t=this.resolveType(type);if(t.fullName.startsWith('System.')&&/\.(Boolean|Char|[SU]?Byte|U?Int(16|32)|U?IntPtr)$/.test(t.fullName))return 0;if(/\.U?Int64$/.test(t.fullName))return 0n;if(/\.(Single|Double)$/.test(t.fullName))return new FloatValue(0);return this.object(t,true);}
    if(type.et===0x13||type.et===0x1e)return 0;const name=type.fullName;if(/\.(Boolean|Char|[SU]?Byte|U?Int(16|32)|U?IntPtr)$/.test(name))return 0;if(/\.U?Int64$/.test(name))return 0n;if(/\.(Single|Double)$/.test(name))return new FloatValue(0);return null;}
  addAssembly(asm){const key=asm.assemblyName.toLowerCase();requireThat(!this.assemblies.has(key),'CLR_ASSEMBLY','Duplicate assembly simple name.',{assembly:asm.assemblyName});requireThat(this.assemblies.size<128,'CLR_ASSEMBLY_LIMIT','Too many loaded managed assemblies.');this.assemblies.set(key,asm);return asm;}
  loadAssembly(name,from){const key=name.toLowerCase();if(this.assemblies.has(key))return this.assemblies.get(key);if(builtins.has(name))return null;
    const dirs=[from?.path?.slice(0,from.path.lastIndexOf('/')),this.p.exePath.slice(0,this.p.exePath.lastIndexOf('/')),this.p.vfs.cwd];
    for(const dir of new Set(dirs.filter(Boolean)))for(const ext of ['.dll','.exe']){const path=this.p.vfs.path(dir+'/'+name+ext);if(this.p.vfs.exists(path)){const asm=new CLIImage(new PEImage(this.p.vfs.readFile(path),path)).validateRunnable({dll:true});requireThat(asm.assemblyName.toLowerCase()===key,'CLR_ASSEMBLY','Assembly identity does not match its requested name.',{requested:name,actual:asm.assemblyName});return this.addAssembly(asm);}}
    throw new RuntimeFault('CLR_ASSEMBLY_NOT_FOUND',`Managed dependency ${name}.dll was not found beside the executable. Include it in the application ZIP.`,{assembly:name});
  }
  resolveType(type){if(type.et===0x11||type.et===0x12)type=type.asm.type(type.token);if(type.et===0x15)return {...this.resolveType(type.definition),typeArgs:type.typeArgs};if(type.token>>>24===27){if(type.definition)return this.resolveType(type.definition);return type;}if(type.row?.MethodList!==undefined)return type;
    if(type.assemblyName){const asm=this.loadAssembly(type.assemblyName,type.asm);if(asm){const found=[...asm.types.values()].find(t=>t.row?.MethodList!==undefined&&t.fullName===type.fullName);if(!found)throw new RuntimeFault('CLR_TYPE_NOT_FOUND','Managed type was not found in its assembly.',{type:type.fullName,assembly:asm.assemblyName});return found;}}
    return type;
  }
  baseType(type){type=this.resolveType(type);if(type.row?.Extends)return this.resolveType(type.asm.type(type.asm.decode('TypeDefOrRef',type.row.Extends)));return null;}
  typeChain(type){const out=[],seen=new Set();for(let t=type;t;t=this.baseType(t)){const key=(t.asm?.assemblyName||'')+':'+t.fullName;guard(!seen.has(key)&&out.length<128,'Type inheritance cycle or excessive depth.');seen.add(key);out.push(t);}return out;}
  assignable(actual,wanted){if(wanted.fullName==='System.Object')return true;if(actual.fullName===wanted.fullName)return true;
    if(/Exception$/.test(actual.fullName)){if(wanted.fullName==='System.Exception')return true;if(wanted.fullName==='System.SystemException'&&actual.fullName!=='System.Exception'&&actual.fullName!=='System.ApplicationException')return true;if(wanted.fullName==='System.ArithmeticException'&&['System.DivideByZeroException','System.OverflowException','System.NotFiniteNumberException'].includes(actual.fullName))return true;}
    return this.typeChain(actual).some(t=>t.fullName===wanted.fullName);
  }
  isInstance(obj,type){if(obj===null)return false;type=this.resolveType(type);obj=unref(obj);const actual=typeof obj==='string'?{fullName:'System.String'}:typeof obj==='number'?{fullName:'System.Int32'}:typeof obj==='bigint'?{fullName:'System.Int64'}:floating(obj)?{fullName:'System.Double'}:obj?.type||{fullName:'System.Object'};return this.assignable(actual,type);}
  object(type,valueType=false){type=this.resolveType(type);this.allocate(96);const obj={tag:'object',type,valueType,fields:new Map()};for(const t of this.typeChain(type).reverse())for(const field of t.fields||[])if(!(field.row.Flags&0x10))obj.fields.set(this.fieldKey(field),this.defaultValue(field.fieldType));return obj;}
  compatibleType(a,b){if(a.et===0x13||a.et===0x1e||b.et===0x13||b.et===0x1e)return true;return a.fullName===b.fullName;}
  sameSignature(a,b){return a.params.length===b.params.length&&a.params.every((t,i)=>this.compatibleType(t,b.params[i]));}
  resolveMethod(method,receiver,virt=false){let type=this.resolveType(method.type),found;
    if(type.methods)found=type.methods.find(m=>m.name===method.name&&this.sameSignature(m.signature,method.signature));
    // MemberRefs on a derived type may refer to an inherited implementation.
    if(!found&&type.methods)for(const parent of this.typeChain(type).slice(1)){found=parent.methods?.find(m=>m.name===method.name&&this.sameSignature(m.signature,method.signature));if(found)break;}
    if(virt&&receiver?.type&&((found?.row.Flags&0x40)||(!found&&['ToString','Equals','GetHashCode'].includes(method.name)))){
      for(const actual of this.typeChain(receiver.type)){const override=actual.methods?.find(m=>m.name===method.name&&(m.row.Flags&0x40)&&this.sameSignature(m.signature,method.signature));if(override){found=override;break;}}
    }
    return found?{...found,typeArgs:method.type.typeArgs||method.typeArgs,methodArgs:method.methodArgs}: {...method,type};
  }
  field(member){if(member.token>>>24===4)return member;const type=this.resolveType(member.type);for(const t of this.typeChain(type)){const field=t.fields?.find(f=>f.name===member.name);if(field)return field;}return {...member,type};}
  fieldKey(field){return (field.type.asm?.assemblyName||field.type.assemblyName||'framework')+'::'+field.type.fullName+'::'+field.name;}
  ensureType(type,action){type=this.resolveType(type);const key=(type.asm?.assemblyName||'')+'::'+type.fullName;if(this.initialized.has(key))return action();this.initialized.set(key,'initializing');const ctor=type.methods?.find(m=>m.name==='.cctor');if(ctor){this.invoke(ctor,[],()=>{this.initialized.set(key,'initialized');action();},false,true);}else{this.initialized.set(key,'initialized');action();}}
  invoke(method,args,done=()=>{},virt=false,skipInit=false){let receiver=method.signature.hasThis?unref(args[0]):null;if(virt)nonnull(receiver);method=this.resolveMethod(method,receiver,virt);
    if(!skipInit&&method.name!=='.cctor'&&method.type.methods&&(method.name==='.ctor'||!method.signature.hasThis))return this.ensureType(method.type,()=>this.invoke(method,args,done,virt,true));
    this.p.apiCalls++;this.p.lastApi=method.type.fullName+'::'+method.name;
    const record={api:this.p.lastApi,caller:this.lastInstruction?.location||'managed entry',args:args.slice(0,12).map(x=>text(x).slice(0,160))};this.p.callTrace.push(record);if(this.p.callTrace.length>64)this.p.callTrace.shift();
    if(method.row.RVA){
      requireThat(this.frames.length<1024,'CLR_STACK_LIMIT','Managed call-stack limit exceeded.');requireThat(!(method.row.ImplFlags&3),'CLR_NATIVE_METHOD','Native managed methods are not supported.');
      const body=method.asm.methodBody(method);const f={method,body,ip:0,lastIP:0,stack:[],args:args.map(clone),locals:body.locals.map(t=>this.defaultValue(t)),done,pending:null,exception:null};this.frames.push(f);return;
    }
    let result;if(method.row.Flags&0x2000)result=this.pinvoke(method,args);else result=this.library.invoke(method,args);
    if(result?.wait){this.p.waiting={check:result.wait,reason:result.reason,complete:value=>done(this.coerce(value,method.signature.ret))};this.p.emit('waiting',{reason:result.reason});}
    else if(result?.formsLoop){this.forms.begin(result.formsLoop,this.frames.length,()=>done(undefined));}
    else done(this.coerce(result,method.signature.ret));
  }
  coerce(value,type){if(type.fullName==='System.Void')return value;if(type.fullName==='System.Boolean')return truth(value)?1:0;if(type.fullName==='System.Single')return convert(value,'r4');if(type.fullName==='System.Double')return floating(value)?value:new FloatValue(number(value));if(type.fullName==='System.Int64'||type.fullName==='System.UInt64')return convert(value,'i8');return value;}
  pinvoke(method,args){const row=method.asm.rows(28).find(r=>method.asm.decode('MemberForwarded',r.MemberForwarded)===method.token);guard(row,'P/Invoke method has no ImplMap.');const dll=method.asm.str(method.asm.row(0x1a000000|row.ImportScope).Name),name=method.asm.str(row.ImportName);const primitive=t=>[2,3,4,5,6,7,8,9,24,25].includes(t.et);
    requireThat(method.signature.params.every(primitive)&&(method.signature.ret.et===1||primitive(method.signature.ret)),'CLR_PINVOKE_SIGNATURE','Only blittable 8/16/32-bit scalar and IntPtr P/Invoke signatures are currently supported.',{dll,symbol:name});
    const api=this.p.apis.lookup(dll,name);requireThat(api?.fn,'CLR_PINVOKE_API',`P/Invoke target is not a built-in supported native API: ${dll}!${name}.`,{dll,symbol:name});requireThat(api.argc===args.length,'CLR_PINVOKE_SIGNATURE','Native API argument count does not match the managed declaration.',{dll,symbol:name});
    const result=api.fn(...args.map(v=>number(v)>>>0));requireThat(!result?.call,'CLR_PINVOKE_CALLBACK','Native-to-managed callbacks are not supported by this bridge.');return result;
  }
  push(f,value){guard(f.stack.length<f.body.maxStack,'Evaluation stack exceeds declared maxstack.');f.stack.push(value);}
  pop(f){guard(f.stack.length>0,'Evaluation stack underflow.',{method:f.method.name,offset:f.lastIP});return f.stack.pop();}
  fetch(f,n){guard(f.ip+n<=f.body.code.length,'Truncated instruction operand.');const p=f.ip;f.ip+=n;return p;}
  u8(f){return f.body.code[this.fetch(f,1)];}
  i8(f){return (this.u8(f)<<24)>>24;}
  u16(f){const p=this.fetch(f,2),b=f.body.code;return b[p]|(b[p+1]<<8);}
  u32(f){const p=this.fetch(f,4),b=f.body.code;return (b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]<<24))>>>0;}
  i32(f){return this.u32(f)|0;}
  branch(f,to){guard(Number.isInteger(to)&&to>=0&&to<f.body.code.length,'Branch target lies outside method.');f.ip=to;}
  slot(f,kind,index,address=false,store=false){const list=kind==='arg'?f.args:f.locals;guard(index<list.length,'Argument/local index out of bounds.',{kind,index});if(store)list[index]=clone(this.pop(f));else this.push(f,address?ref(()=>list[index],v=>{list[index]=clone(v);},kind==='local'?f.body.locals[index]:null):clone(list[index]));}
  fieldOperation(f,token,op){const field=this.field(f.method.asm.member(token)),stat=op>=0x7e;
    const perform=()=>{let obj=stat?null:nonnull(op===0x7d?f.stack.at(-2):f.stack.at(-1));const map=stat?this.staticFields:obj.fields,key=this.fieldKey(field);
      guard(map instanceof Map,'Field access requires a managed object.');if(!map.has(key)){const known=stat?this.library.staticField(field):undefined;map.set(key,known===undefined?this.defaultValue(field.fieldType):known);}
      if(op===0x7d||op===0x80){const v=this.pop(f);if(!stat)this.pop(f);map.set(key,clone(v));}
      else{if(!stat)this.pop(f);this.push(f,op===0x7c||op===0x7f?ref(()=>map.get(key),v=>map.set(key,clone(v)),field.fieldType):clone(map.get(key)));}
    };if(stat)this.ensureType(field.type,perform);else perform();
  }
  takeArguments(f,signature,newobj=false){const count=signature.params.length+(signature.hasThis&&!newobj?1:0);guard(f.stack.length>=count,'Insufficient call arguments.');return f.stack.splice(f.stack.length-count,count);}
  callInstruction(f,token,op){const member=f.method.asm.member(token),args=this.takeArguments(f,member.signature,op===0x73);
    if(op===0x73){const type=this.resolveType(member.type),base=this.baseType(type),valueType=type.et===0x11||type.category===0x11||base?.fullName==='System.ValueType';const obj=this.object(type,valueType);this.invoke(member,[obj,...args],()=>this.push(f,clone(obj)));}
    else this.invoke(member,args,result=>{if(member.signature.ret.et!==1)this.push(f,clone(result));},op===0x6f);
  }
  leave(f,target){f.stack=[];const clauses=f.body.clauses.filter(c=>c.flags===2&&f.lastIP>=c.tryOffset&&f.lastIP<c.tryOffset+c.tryLength&&!(target>=c.tryOffset&&target<c.tryOffset+c.tryLength)).sort((a,b)=>a.tryLength-b.tryLength);const next=()=>{const c=clauses.shift();if(c){f.pending=next;f.ip=c.handlerOffset;}else{f.pending=null;this.branch(f,target);}};next();}
  handleException(error){const value=error.value,plan=[];let target=null;
    for(let i=this.frames.length-1;i>=0;i--){const f=this.frames[i],active=f.body.clauses.filter(c=>f.lastIP>=c.tryOffset&&f.lastIP<c.tryOffset+c.tryLength).sort((a,b)=>a.tryLength-b.tryLength);
      for(const c of active){if(c.flags===0&&this.isInstance(value,f.method.asm.type(c.classToken))){target={f,c,index:i};break;}if(c.flags===2||c.flags===4)plan.push({f,c,index:i});}if(target)break;
    }
    const captured=this.frames.map(f=>({method:f.method.type.fullName+'::'+f.method.name,assembly:f.method.asm.assemblyName,offset:f.lastIP}));
    const advance=()=>{const step=plan.shift();if(step){this.frames.length=step.index+1;step.f.stack=[];step.f.pending=advance;step.f.ip=step.c.handlerOffset;return;}
      if(target){this.frames.length=target.index+1;target.f.stack=[value];target.f.exception=value;target.f.pending=null;target.f.ip=target.c.handlerOffset;return;}
      throw new RuntimeFault('CLR_UNHANDLED_EXCEPTION',text(value),{exceptionType:value.type.fullName,message:value.message,managedStack:captured.reverse()});};advance();
  }
  step(){
    const f=this.frames.at(-1);if(!f)return;f.lastIP=f.ip;const op=this.u8(f),asm=f.method.asm;
    this.lastInstruction={assembly:asm.assemblyName,methodToken:f.method.token,method:f.method.type.fullName+'::'+f.method.name,offset:f.lastIP,opcode:hex(op),location:asm.assemblyName+'!'+f.method.name+' IL_'+f.lastIP.toString(16).padStart(4,'0')};this.trace.push(this.lastInstruction.location);if(this.trace.length>64)this.trace.shift();this.p.cpu.instructions++;this.p.cpu.eip=(f.method.token+f.lastIP)>>>0;
    const push=v=>this.push(f,v),pop=()=>this.pop(f),binaryOp=(name,options)=>{const b=pop(),a=pop();push(binary(name,a,b,options));};
    if(op>=2&&op<=5)return this.slot(f,'arg',op-2);
    if(op>=6&&op<=9)return this.slot(f,'local',op-6);
    if(op>=10&&op<=13)return this.slot(f,'local',op-10,false,true);
    if(op>=0x15&&op<=0x1e)return push(op-0x16);
    if(op>=0x2b&&op<=0x44){const index=op<=0x37?op-0x2b:op-0x38,delta=op<=0x37?this.i8(f):this.i32(f),target=f.ip+delta;let take;
      if(index===0)take=true;else if(index===1)take=!truth(pop());else if(index===2)take=truth(pop());else{const b=pop(),a=pop();take=compare(['eq','ge','gt','le','lt','ne','ge','gt','le','lt'][index-3],a,b,index>=8);}if(take)this.branch(f,target);return;}
    if(op>=0x46&&op<=0x50){const address=pop();guard(address?.tag==='ref','ldind requires a managed byref; unsafe native pointers are unsupported.');const value=address.get(),kind=['i1','u1','i2','u2','i4','u4','i8','i4','r4','r8',null][op-0x46];return push(kind?convert(value,kind):value);}
    if(op>=0x51&&op<=0x57||op===0xdf){const value=pop(),address=pop();guard(address?.tag==='ref','stind requires a managed byref.');const kind=op===0xdf?'i4':[null,'i1','i2','i4','i8','r4','r8'][op-0x51];address.set(kind?convert(value,kind):value);return;}
    if(op>=0x58&&op<=0x64){const names=['add','sub','mul','div','div','rem','rem','and','or','xor','shl','shr','shr'];return binaryOp(names[op-0x58],{unsigned:[0x5c,0x5e,0x64].includes(op)});}
    if(op>=0x67&&op<=0x6e)return push(convert(pop(),['i1','i2','i4','i8','r4','r8','u4','u8'][op-0x67]));
    if(op>=0x7b&&op<=0x80)return this.fieldOperation(f,this.u32(f),op);
    if(op>=0x82&&op<=0x8b)return push(convert(pop(),['i1','i2','i4','i8','u1','u2','u4','u8','i4','u4'][op-0x82],{checked:true,unsigned:true}));
    if(op>=0x90&&op<=0x9a){const index=pop(),a=nonnull(pop()),i=arrayIndex(a,index),kind=['i1','u1','i2','u2','i4','u4','i8','i4','r4','r8',null][op-0x90];return push(kind?convert(a.values[i],kind):clone(a.values[i]));}
    if(op>=0x9b&&op<=0xa2){const value=pop(),index=pop(),a=nonnull(pop()),i=arrayIndex(a,index),kind=['i4','i1','i2','i4','i8','r4','r8',null][op-0x9b];a.values[i]=kind?convert(value,kind):clone(value);return;}
    if(op>=0xb3&&op<=0xba)return push(convert(pop(),['i1','u1','i2','u2','i4','u4','i8','u8'][op-0xb3],{checked:true}));
    if(op>=0xd6&&op<=0xdb)return binaryOp(['add','add','mul','mul','sub','sub'][op-0xd6],{checked:true,unsigned:!!(op&1)});
    switch(op){
      case 0x00:return;case 0x01:this.p.pause('Managed break instruction');return;
      case 0x0e:return this.slot(f,'arg',this.u8(f));case 0x0f:return this.slot(f,'arg',this.u8(f),true);case 0x10:return this.slot(f,'arg',this.u8(f),false,true);
      case 0x11:return this.slot(f,'local',this.u8(f));case 0x12:return this.slot(f,'local',this.u8(f),true);case 0x13:return this.slot(f,'local',this.u8(f),false,true);
      case 0x14:return push(null);case 0x1f:return push(this.i8(f));case 0x20:return push(this.i32(f));
      case 0x21:{const p=this.fetch(f,8);return push(new DataView(f.body.code.buffer,f.body.code.byteOffset+p,8).getBigInt64(0,true));}
      case 0x22:case 0x23:{const p=this.fetch(f,op===0x22?4:8),d=new DataView(f.body.code.buffer,f.body.code.byteOffset+p,op===0x22?4:8);return push(new FloatValue(op===0x22?d.getFloat32(0,true):d.getFloat64(0,true)));}
      case 0x25:{const v=pop();push(v);return push(clone(v));}case 0x26:pop();return;
      case 0x28:case 0x6f:case 0x73:return this.callInstruction(f,this.u32(f),op);
      case 0x2a:{const result=f.method.signature.ret.et!==1?pop():undefined;guard(f.stack.length===0,'ret leaves values on the evaluation stack.');this.frames.pop();f.done(clone(result));return;}
      case 0x45:{const count=this.u32(f);guard(count<=100000,'switch table exceeds limit.');const offsets=Array.from({length:count},()=>this.i32(f)),index=number(pop());if(index>=0&&index<count)this.branch(f,f.ip+offsets[index]);return;}
      case 0x65:{const v=pop();return push(floating(v)?new FloatValue(-v.value):typeof v==='bigint'?BigInt.asIntN(64,-v):(-v)|0);}case 0x66:{const v=pop();return push(typeof v==='bigint'?BigInt.asIntN(64,~v):~v);}
      case 0x70:{this.u32(f);const from=pop(),to=pop();guard(from?.tag==='ref'&&to?.tag==='ref','cpobj requires managed byrefs.');to.set(clone(from.get()));return;}
      case 0x71:{this.u32(f);const r=pop();guard(r?.tag==='ref','ldobj requires a managed byref.');return push(clone(r.get()));}
      case 0x72:return push(asm.userString(this.u32(f)));
      case 0x74:case 0x75:{const type=asm.type(this.u32(f)),v=pop(),yes=v===null||this.isInstance(v,type);if(!yes&&op===0x74)raise('InvalidCastException','Unable to cast object to '+type.fullName);return push(yes?v:null);}
      case 0x76:return push(convert(pop(),'r8',{unsigned:true}));
      case 0x79:case 0xa5:{const type=asm.type(this.u32(f)),v=pop();if(v===null){if(op===0xa5&&type.et===0x12)return push(null);raise('NullReferenceException','Cannot unbox null.');}if(v.tag!=='box'||v.type.fullName!==type.fullName)raise('InvalidCastException','Boxed value type does not match '+type.fullName);return push(op===0x79?ref(()=>v.value,x=>{v.value=x;},type):clone(v.value));}
      case 0x7a:throw new ManagedException(pop());
      case 0x81:{this.u32(f);const v=pop(),r=pop();guard(r?.tag==='ref','stobj requires a managed byref.');r.set(clone(v));return;}
      case 0x8c:{const type=asm.type(this.u32(f));this.allocate(32);return push({tag:'box',type,value:clone(pop())});}
      case 0x8d:{const type=asm.type(this.u32(f));return push(this.array(type,number(pop())));}
      case 0x8e:{const a=nonnull(pop());guard(a.tag==='array','ldlen requires a managed array.');return push(a.values.length);}
      case 0x8f:case 0xa3:case 0xa4:{this.u32(f);const value=op===0xa4?pop():null,index=pop(),a=nonnull(pop()),i=arrayIndex(a,index);if(op===0xa4)a.values[i]=clone(value);else push(op===0x8f?ref(()=>a.values[i],v=>{a.values[i]=clone(v);},a.element):clone(a.values[i]));return;}
      case 0xc3:{const v=pop();if(!Number.isFinite(number(v)))raise('NotFiniteNumberException','Floating-point value is not finite.');return push(v);}
      case 0xd0:{const token=this.u32(f);return push({tag:'handle',asm,token});}
      case 0xd1:return push(convert(pop(),'u2'));case 0xd2:return push(convert(pop(),'u1'));case 0xd3:return push(convert(pop(),'i4'));case 0xd4:return push(convert(pop(),'i4',{checked:true}));case 0xd5:return push(convert(pop(),'u4',{checked:true}));case 0xe0:return push(convert(pop(),'u4'));
      case 0xdc:{const next=f.pending;guard(next,'endfinally without an unwind continuation.');f.pending=null;next();return;}
      case 0xdd:case 0xde:{const delta=op===0xdd?this.i32(f):this.i8(f);return this.leave(f,f.ip+delta);}
      case 0xfe:{const second=this.u8(f);
        if(second>=1&&second<=5){const b=pop(),a=pop();return push(compare(second===1?'eq':second<=3?'gt':'lt',a,b,second===3||second===5)?1:0);}
        if(second===6||second===7){let method=asm.member(this.u32(f));if(second===7)method=this.resolveMethod(method,nonnull(pop()),true);return push({tag:'function',method});}
        if(second>=9&&second<=14)return this.slot(f,second<=11?'arg':'local',this.u16(f),second===10||second===13,second===11||second===14);
        if(second===0x13||second===0x1e)return; // Single-thread memory ordering; readonly byref uses normal managed bounds.
        if(second===0x16){f.constrained=asm.type(this.u32(f));return;}
        if(second===0x15){const type=asm.type(this.u32(f)),r=pop();guard(r?.tag==='ref','initobj requires a managed byref.');r.set(this.defaultValue({...type,et:0x11}));return;}
        if(second===0x1a){guard(f.exception,'rethrow outside a catch handler.');throw new ManagedException(f.exception);}
        if(second===0x1c){const type=asm.type(this.u32(f)),sizes={'System.Boolean':1,'System.Byte':1,'System.SByte':1,'System.Char':2,'System.Int16':2,'System.UInt16':2,'System.Int32':4,'System.UInt32':4,'System.Single':4,'System.Int64':8,'System.UInt64':8,'System.Double':8,'System.IntPtr':4,'System.UIntPtr':4};requireThat(sizes[type.fullName],'CLR_UNSUPPORTED_SIZEOF','sizeof is currently supported only for primitive types.');return push(sizes[type.fullName]);}
        throw new RuntimeFault('CLR_UNSUPPORTED_OPCODE','Unsupported CIL opcode FE '+second.toString(16).padStart(2,'0'),this.lastInstruction);
      }
      default:throw new RuntimeFault('CLR_UNSUPPORTED_OPCODE','Unsupported CIL opcode '+op.toString(16).padStart(2,'0'),this.lastInstruction);
    }
  }
  tick(budget=20000,milliseconds=12){this.p.poll();if(this.p.waiting)return;const end=performance.now()+milliseconds;for(let i=0;i<budget&&this.p.status==='running'&&!this.p.waiting;i++){
      try{if(this.forms.active&&this.frames.length===this.forms.baseDepth){if(!this.forms.pump())break;if(this.forms.active&&this.frames.length===this.forms.baseDepth)continue;}
        if(!this.frames.length)break;const f=this.frames.at(-1),address=(f.method.token+f.ip)>>>0;if(this.p.breakpoints.has(address)){this.p.pause('Managed IL breakpoint');break;}this.step();
      }catch(error){if(error instanceof ManagedException)this.handleException(error);else throw error;}
      requireThat(this.p.cpu.instructions<this.p.instructionsLimit,'INSTRUCTION_LIMIT','Managed instruction budget exceeded.',{limit:this.p.instructionsLimit});if((i&255)===255&&performance.now()>=end)break;
    }}
  stepOne(){requireThat(this.p.cpu.instructions<this.p.instructionsLimit,'INSTRUCTION_LIMIT','Managed instruction budget exceeded.');this.p.poll();if(!this.p.waiting){try{if(this.forms.active&&this.frames.length===this.forms.baseDepth){if(!this.forms.pump()||(this.forms.active&&this.frames.length===this.forms.baseDepth))return;}this.step();}catch(error){if(error instanceof ManagedException)this.handleException(error);else throw error;}}}
  debug(){return {runtime:'cil',managed:{entryToken:hex(this.main.entryToken),lastInstruction:this.lastInstruction,allocatedBytes:this.allocatedBytes,allocations:this.allocations,assemblies:[...this.assemblies.values()].map(a=>a.summary()),frames:this.frames.slice().reverse().map(f=>({method:f.method.type.fullName+'::'+f.method.name,token:hex(f.method.token),offset:f.ip,stack:f.stack.slice(-16).map(text),locals:f.locals.slice(0,32).map(text)}))},registers:{METHOD:this.lastInstruction?hex(this.lastInstruction.methodToken):'—',IL:this.lastInstruction?'IL_'+this.lastInstruction.offset.toString(16):'—'},eip:this.lastInstruction?.location||'managed entry',flags:'not applicable (CIL)',trace:this.trace};}
}
