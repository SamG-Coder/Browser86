// Browser86 managed execution engine. Original CIL interpreter — MIT, samgcoder.
import {GuestProcess} from '../process.js';
import {RuntimeFault,requireThat} from '../errors.js';
import {shellArguments} from '../command-line.js';
import {ManagedAssembly,decodeCoded,tokenText} from './metadata.js';
import {decodeIL,opcodeName} from './il.js';
import {Real,ManagedRef,ManagedException,NOT_HANDLED,raw,number,unbox,deref,truth,copy,display,requireRef,i32,u32} from './values.js';
import {invokeIntrinsic,readIntrinsicField} from './framework.js';
import {FormsBridge} from './forms.js';
import {arithmetic,compare,convert,coerce} from './numeric.js';

const frameworkAssemblies=new Set(['mscorlib','system','system.core','system.drawing','system.windows.forms','microsoft.visualbasic']);
const primitiveValues=new Set(['System.Boolean','System.Char','System.SByte','System.Byte','System.Int16','System.UInt16','System.Int32','System.UInt32','System.Int64','System.UInt64','System.Single','System.Double','System.IntPtr','System.UIntPtr']);
const hostBases={
 'System.SystemException':'System.Exception','System.Exception':'System.Object',
 'System.DivideByZeroException':'System.ArithmeticException','System.OverflowException':'System.ArithmeticException','System.ArithmeticException':'System.SystemException',
 'System.ArgumentNullException':'System.ArgumentException','System.ArgumentOutOfRangeException':'System.ArgumentException','System.ArgumentException':'System.SystemException',
 'System.NullReferenceException':'System.SystemException','System.IndexOutOfRangeException':'System.SystemException','System.InvalidCastException':'System.SystemException',
 'System.InvalidOperationException':'System.SystemException','System.FormatException':'System.SystemException','System.IO.IOException':'System.SystemException',
 'System.IO.FileNotFoundException':'System.IO.IOException','System.IO.DirectoryNotFoundException':'System.IO.IOException',
 'System.TypeInitializationException':'System.SystemException','System.MulticastDelegate':'System.Delegate','System.Delegate':'System.Object',
 'System.Windows.Forms.Form':'System.Windows.Forms.ContainerControl','System.Windows.Forms.ContainerControl':'System.Windows.Forms.ScrollableControl',
 'System.Windows.Forms.ScrollableControl':'System.Windows.Forms.Control','System.Windows.Forms.Panel':'System.Windows.Forms.ScrollableControl',
 'System.Windows.Forms.Button':'System.Windows.Forms.ButtonBase','System.Windows.Forms.CheckBox':'System.Windows.Forms.ButtonBase','System.Windows.Forms.RadioButton':'System.Windows.Forms.ButtonBase',
 'System.Windows.Forms.ButtonBase':'System.Windows.Forms.Control','System.Windows.Forms.Label':'System.Windows.Forms.Control','System.Windows.Forms.TextBox':'System.Windows.Forms.TextBoxBase',
 'System.Windows.Forms.TextBoxBase':'System.Windows.Forms.Control','System.Windows.Forms.Control':'System.ComponentModel.Component',
 'System.EventHandler':'System.MulticastDelegate','System.Windows.Forms.PaintEventHandler':'System.MulticastDelegate',
};
function inside(c,ip){return ip>=c.tryOffset&&ip<c.tryOffset+c.tryLength;}

export class ManagedProcess extends GuestProcess {
 constructor(options={}) {
  super({...options,initializeNative:false});
  this.runtime='cil';this.frames=[];this.assemblies=new Map();this.assemblyPaths=new Map();this.hostTypes=new Map();this.bindingCache=new Map();
  this.typeInitializers=new Map();this.staticFields=new Map();this.nextObjectId=1;this.managedAllocated=0;this.waits=[];this.managedInput=[];this.pendingEvents=[];this.eventActive=false;this.managedTrace=[];this.entryDone=false;
  this.managedLimit=Math.max(8,Math.min(512,options.memoryMiB||256))*1024*1024;
  this.maxFrames=2048;this.forms=new FormsBridge(this);
  const assembly=this.loadAssembly(this.exePath);assembly.validateRunnable();this.assembly=assembly;
  this.main={image:assembly.image,path:this.exePath,base:assembly.image.imageBase,size:assembly.image.sizeOfImage};
  this.argv=shellArguments('"'+this.exePath.replaceAll('/','\\')+'"'+(this.args?' '+this.args:'')).slice(1);
  const entry=assembly.methods.get(assembly.entryToken),sig=entry.signature;
  requireThat(!sig.hasThis&&(sig.params.length===0||sig.params.length===1&&assembly.typeName(sig.params[0])==='System.String[]'),'CLR_ENTRY','Main must be static and accept zero arguments or string[].');
  const ret=assembly.typeName(sig.ret);requireThat(ret==='System.Void'||ret==='System.Int32','CLR_ENTRY','Only void and int Main entrypoints are supported (not async Main).');
  this.status='running';const initialFrame=this.pushFrame(entry,sig.params.length?[this.array({name:'System.String'},this.argv)]:[],value=>{this.entryDone=true;this.exit(ret==='System.Int32'?i32(value):(this.exitCode||0));});this.ensureInitialized(entry.owner,initialFrame,0);
  this.emit('loaded',{runtime:'cil',exe:assembly.summary(),modules:[{path:this.exePath,base:'CIL'}],missing:[],cwd:this.vfs.cwd,notes:['Experimental pure-IL interpreter and explicit .NET Framework API subset. No Microsoft CLR is installed.']});
 }
 account(bytes){requireThat(Number.isSafeInteger(bytes)&&bytes>=0,'CLR_ALLOCATION','Invalid managed allocation size.');this.managedAllocated+=bytes;requireThat(this.managedAllocated<=this.managedLimit,'CLR_ALLOCATION_LIMIT','Managed cumulative allocation budget exceeded.',{limit:this.managedLimit,allocated:this.managedAllocated});}
 text(value){value=String(value);requireThat(value.length<=4*1024*1024,'CLR_STRING_LIMIT','Managed string limit exceeded.');this.account(value.length*2);return value;}
 loadAssembly(path,expected=null){
  path=this.vfs.path(path);const key=path.toLowerCase();if(this.assemblyPaths.has(key))return this.assemblyPaths.get(key);
  requireThat(this.assemblyPaths.size<128,'CLR_ASSEMBLY_LIMIT','Too many managed assemblies.');
  const assembly=new ManagedAssembly(this.vfs.readFile(path),path);assembly.validateRunnable({library:true});
  if(expected){requireThat(assembly.name.toLowerCase()===expected.name.toLowerCase(),'CLR_ASSEMBLY_IDENTITY','Packaged DLL identity does not match its reference.',{expected:expected.name,actual:assembly.name});requireThat(!expected.version||assembly.version===expected.version,'CLR_ASSEMBLY_VERSION','Assembly version mismatch; binding redirects are not implemented.',{expected:expected.version,actual:assembly.version,assembly:assembly.name});}
  const old=this.assemblies.get(assembly.name.toLowerCase());requireThat(!old||old.path===path,'CLR_ASSEMBLY_IDENTITY','Multiple versions of one assembly are not supported.');
  this.account(assembly.image.bytes.length);this.assemblyPaths.set(key,assembly);this.assemblies.set(assembly.name.toLowerCase(),assembly);this.emit('module',{path,base:'CIL',bytes:assembly.image.bytes.length,runtime:'cil'});return assembly;
 }
 dependency(reference,from){
  const old=this.assemblies.get(reference.name.toLowerCase());if(old){requireThat(old.version===reference.version,'CLR_ASSEMBLY_VERSION','Loaded assembly version mismatch.');return old;}
  for(const dir of new Set([from.path.slice(0,from.path.lastIndexOf('/')),this.exePath.slice(0,this.exePath.lastIndexOf('/')),this.vfs.cwd]))for(const ext of ['.dll','.exe']){
   const path=dir+'/'+reference.name+ext;if(this.vfs.exists(path))return this.loadAssembly(path,reference);
  }
  throw new RuntimeFault('CLR_ASSEMBLY_NOT_FOUND','Missing managed dependency: '+reference.name+', Version='+reference.version+'. Include it alongside the EXE in the ZIP.',{assembly:reference.name,requestingAssembly:from.path});
 }
 hostType(name){
  if(this.hostTypes.has(name))return this.hostTypes.get(name);
  const valueType=primitiveValues.has(name)||/^System\.Drawing\.(Point|PointF|Size|SizeF|Rectangle|RectangleF|Color)$/.test(name)||name==='System.DateTime'||name==='System.TimeSpan'||name==='System.Collections.Generic.List`1+Enumerator';
  const type={name,host:true,valueType,methods:[],fields:[],baseName:hostBases[name]||(name==='System.Object'?null:valueType?'System.ValueType':name.endsWith('Exception')?'System.Exception':/^(System\.(Action|Func)`?|.*EventHandler)/.test(name)?'System.MulticastDelegate':'System.Object')};this.hostTypes.set(name,type);return type;
 }
 resolveType(sig,context=null,depth=0){
  requireThat(depth<64,'CLR_TYPE','Type resolution nesting limit exceeded.');
  if(!sig)return this.hostType('System.Void');
  if(sig.host||sig.methods)return sig;
  if(sig.kind==='pinned')return this.resolveType(sig.type,context,depth+1);
  if(sig.kind==='var'||sig.kind==='mvar'){const args=sig.kind==='var'?context?.typeArgs:context?.methodArgs;requireThat(args?.[sig.index],'CLR_GENERICS','Unbound generic type parameter.',{kind:sig.kind,index:sig.index});return this.resolveType(args[sig.index],context,depth+1);}
  if(sig.kind==='generic'){const base=this.resolveType(sig.base,context,depth+1);return {...base,definition:base,genericArgs:sig.args,valueType:base.valueType};}
  if(sig.kind==='array')return {...this.hostType('System.Array'),element:sig.type,name:(sig.assembly||context?.assembly||this.assembly).typeName(sig.type)+'[]'};
  if(sig.name)return this.hostType(sig.name);
  const assembly=sig.assembly||context?.assembly||this.assembly,token=sig.token;
  if(token>>>24===2)return assembly.types.get(token);
  if(token>>>24===27)return this.resolveType(assembly.typeSig(token),context,depth+1);
  requireThat(token>>>24===1,'CLR_TYPE','Unsupported type token.',{token:tokenText(token)});
  const r=assembly.tokenRow(token),scope=decodeCoded('ResolutionScope',r[0]),name=assembly.typeName(sig);
  if(scope>>>24===35){const reference=assembly.references[(scope&0xffffff)-1];requireThat(reference,'CLR_TYPE','Invalid assembly reference.');
   if(frameworkAssemblies.has(reference.name.toLowerCase()))return this.hostType(name);
   const target=this.dependency(reference,assembly),type=[...target.types.values()].find(t=>t.name===name);requireThat(type,'CLR_TYPE_NOT_FOUND','Type not found: '+name,{assembly:target.name});return type;
  }
  if(scope>>>24===1){const outer=this.resolveType({token:scope,assembly},context,depth+1);if(outer.host)return this.hostType(outer.name+'+'+assembly.string(r[1]));const type=[...outer.assembly.types.values()].find(t=>t.name===outer.name+'+'+assembly.string(r[1]));requireThat(type,'CLR_TYPE_NOT_FOUND','Nested type not found.');return type;}
  const type=[...assembly.types.values()].find(t=>t.name===name);requireThat(type,'CLR_TYPE_NOT_FOUND','Local type not found: '+name);return type;
 }
 baseType(type){if(type.host)return type.baseName?this.hostType(type.baseName):null;return type.baseToken?this.resolveType({token:type.baseToken,assembly:type.assembly}):null;}
 isValueType(type){if(type.valueType!==undefined)return type.valueType;const base=this.baseType(type);return !!base&&(base.name==='System.ValueType'||base.name==='System.Enum');}
 isA(value,type){
  value=deref(value);if(value===null||value===undefined)return false;
  if(value.__array&&(type.element||type.name.endsWith('[]')))return value.elementName===(type.element?(type.element.assembly||this.assembly).typeName(type.element):type.name.slice(0,-2))||type.name==='System.Object[]'&&!this.isValueType(this.resolveType(value.element));
  let current=value.__type||(typeof value==='string'?this.hostType('System.String'):value.__array?this.hostType('System.Array'):value instanceof Real?this.hostType('System.Double'):typeof value==='bigint'?this.hostType('System.Int64'):this.hostType('System.Int32'));
  for(let n=0;current&&n<64;n++,current=this.baseType(current)){if(current.name===type.name&&(!type.assembly||current.assembly===type.assembly))return true;for(const iface of current.interfaces||[])if(this.resolveType(iface).name===type.name)return true;}
  return type.name==='System.IDisposable'&&(!!value.dispose||value.__type?.name.startsWith('System.Drawing.')||this.forms.isControl(value.__type));
 }
 defaultValue(sig,context=null,depth=0){
  if(sig?.kind==='byref'||sig?.kind==='pointer'||sig?.kind==='array'||sig?.kind==='mdarray')return null;
  if(sig?.kind==='pinned')return this.defaultValue(sig.type,context,depth);
  const type=this.resolveType(sig,context);const name=type.name;
  if(name==='System.Int64'||name==='System.UInt64')return 0n;
  if(name==='System.Single'||name==='System.Double')return new Real(0);
  if(primitiveValues.has(name))return 0;
  if(this.isValueType(type)){requireThat(depth<32,'CLR_TYPE','Recursive value type.');return this.newObject(type,depth+1);}
  return null;
 }
 newObject(type,depth=0){
  this.account(64+(type.fields?.length||0)*24);const obj={__type:type,__id:this.nextObjectId++,fields:new Map(),__valueType:this.isValueType(type)};
  if(!type.host){let current=type;for(let n=0;current&&!current.host&&n<64;n++,current=this.baseType(current))for(const field of current.fields)if(!(field.flags&16))obj.fields.set(field,this.defaultValue(field.type,{assembly:field.assembly,typeArgs:type.genericArgs},depth));}
  return obj;
 }
 array(element,itemsOrLength){
  const length=typeof itemsOrLength==='number'?itemsOrLength:itemsOrLength.length;
  if(!Number.isInteger(length)||length<0)this.throwException('System.OverflowException','Invalid array length.');
  requireThat(length<=2*1024*1024,'CLR_ARRAY_LIMIT','Managed array element limit exceeded.');this.account(32+length*16);
  return {__array:true,__id:this.nextObjectId++,element,elementName:(element.assembly||this.assembly).typeName(element),items:typeof itemsOrLength==='number'?Array.from({length},()=>this.defaultValue(element)):Array.from(itemsOrLength,copy)};
 }
 arrayRef(array,index){array=this.nonNull(array);requireThat(array.__array,'CLR_INVALID_IL','Expected a managed array.');index=number(index);if(!Number.isInteger(index)||index<0||index>=array.items.length)this.throwException('System.IndexOutOfRangeException','Index was outside the bounds of the array.');return new ManagedRef(()=>array.items[index],value=>{const type=this.resolveType(array.element);if(!this.isValueType(type)&&value!==null&&value!==undefined&&!this.isA(value,type))this.throwException('System.ArrayTypeMismatchException','Attempted to store an incompatible reference in the array.');array.items[index]=copy(coerce(this,value,type.name));},array.element);}
 nonNull(value){value=deref(value);if(value===null||value===undefined)this.throwException('System.NullReferenceException','Object reference not set to an instance of an object.');return value;}
 exception(name,message,inner=null){const value=this.newObject(this.hostType(name));value.message=message;value.innerException=inner;return value;}
 throwException(name,message){throw new ManagedException(this.exception(name,message));}
 resolveMember(reference){
  if(!reference.reference)return reference;
  const cacheKey=reference.assembly.path+':'+(reference.specToken||reference.token);if(this.bindingCache.has(cacheKey))return this.bindingCache.get(cacheKey);
  const owner=this.resolveType(reference.ownerSig),field=reference.signature.field;
  let result=null,current=owner;
  for(let n=0;current&&!current.host&&n<64;n++,current=this.baseType(current)){
   result=(field?current.fields:current.methods).find(m=>m.name===reference.name&&(field||m.signature.params.length===reference.signature.params.length&&m.signature.params.every((p,i)=>{
    const a=m.assembly.typeName(p),b=reference.assembly.typeName(reference.signature.params[i]);return a===b||a.startsWith('!')||b.startsWith('!');
   })));
   if(result)break;
  }
  if(!result&&current?.host)result={...reference,owner:current,host:true};
  requireThat(result,'CLR_MISSING_MEMBER','Managed member not found: '+owner.name+'.'+reference.name,{token:tokenText(reference.token),assembly:reference.assembly.path});
  if(owner.genericArgs)result={...result,typeArgs:owner.genericArgs};if(reference.methodArgs)result={...result,methodArgs:reference.methodArgs};
  this.bindingCache.set(cacheKey,result);return result;
 }
 virtualMethod(method,receiver){
  receiver=this.nonNull(receiver);if(!receiver.__type||!(method.flags&64)&&!method.host&&!(method.owner.flags&32))return method;
  for(let type=receiver.__type,n=0;type&&!type.host&&n<64;type=this.baseType(type),n++){
   const found=type.methods.find(m=>m.name===method.name&&m.signature.params.length===method.signature.params.length&&(m.flags&64));if(found)return found;
  }
  return method;
 }
 ensureInitialized(type,frame,retry){
  if(!type||type.host)return false;
  type=type.definition||type;const state=this.typeInitializers.get(type);
  if(state==='done'||state==='running')return false;
  if(state?.error)throw new ManagedException(state.error);
  const base=this.baseType(type);if(base&&!base.host&&this.ensureInitialized(base,frame,retry))return true;
  const cctor=type.methods.find(m=>m.name==='.cctor');
  if(!cctor){this.typeInitializers.set(type,'done');return false;}
  this.typeInitializers.set(type,'running');frame.ip=retry;
  const next=this.pushFrame(cctor,[],()=>this.typeInitializers.set(type,'done'));next.initializerType=type;return true;
 }
 staticRef(field){if(!this.staticFields.has(field))this.staticFields.set(field,this.defaultValue(field.type,{assembly:field.assembly}));return new ManagedRef(()=>this.staticFields.get(field),v=>this.staticFields.set(field,copy(v)),field.type);}
 fieldRef(field,obj){obj=this.nonNull(obj);requireThat(obj.fields instanceof Map,'CLR_INVALID_IL','Field access on a non-object.');if(!obj.fields.has(field))obj.fields.set(field,this.defaultValue(field.type,{assembly:field.assembly}));return new ManagedRef(()=>obj.fields.get(field),v=>obj.fields.set(field,copy(v)),field.type);}
 pushFrame(method,args,onReturn){
  requireThat(this.frames.length<this.maxFrames,'CLR_STACK_LIMIT','Managed call-stack limit exceeded.');
  requireThat(method.rva&&!(method.implFlags&3),'CLR_METHOD_BODY','Method does not contain supported CIL.',{method:method.owner.name+'.'+method.name});
  const body=method.assembly.body(method);decodeIL(body);
  requireThat(body.clauses.every(c=>c.flags===0||c.flags===2||c.flags===4),'CLR_EXCEPTION_FILTER','Exception filters are not implemented.');
  const context={assembly:method.assembly,typeArgs:method.typeArgs,methodArgs:method.methodArgs};
  const frame={method,body,args:args.map(copy),locals:body.locals.map(t=>this.defaultValue(t,context)),stack:[],ip:0,lastIp:0,onReturn,currentException:null,pendingTransfer:null,context};
  this.frames.push(frame);return frame;
 }
 finishFrame(value){const frame=this.frames.pop();if(frame.initializerType)this.typeInitializers.set(frame.initializerType,'done');frame.onReturn?.(copy(value));}
 block(result,complete){const wait={...result,check:result.wait,complete,depth:this.frames.length};this.waits.push(wait);this.waiting=wait;this.emit('waiting',{reason:wait.reason||'Managed wait'});}
 invoke(method,args,onReturn=()=>{}){
  if(method.pinvoke){const result=this.pinvoke(method,args);if(result?.wait)this.block(result,onReturn);else onReturn(result);return;}
  if(method.host||!method.rva){
   this.apiCalls++;this.lastApi=method.owner.name+'.'+method.name;
   this.callTrace.push({api:this.lastApi,caller:this.location(),args:args.map(v=>display(v).slice(0,120))});if(this.callTrace.length>64)this.callTrace.shift();
   let result=invokeIntrinsic(this,method,args);if(result===NOT_HANDLED)result=this.forms.invoke(method,args);
   if(result===NOT_HANDLED)throw new RuntimeFault('CLR_UNSUPPORTED_API','Not implemented: '+method.owner.name+'.'+method.name+'('+method.signature.params.map(p=>method.assembly.typeName(p)).join(', ')+').',{assembly:method.assembly.path,method:this.lastApi});
   if(result?.managedCall){this.invoke(result.managedCall.method,result.managedCall.args,value=>onReturn(result.then?result.then(value):value));return;}
   if(result?.delegateCall){this.invokeDelegate(result.delegateCall,result.args||[],onReturn);return;}
   if(result?.wait)this.block(result,onReturn);else onReturn(result);return;
  }
  this.pushFrame(method,args,onReturn);
 }
 invokeDelegate(delegate,args,onReturn=()=>{}){
  delegate=this.nonNull(delegate);const calls=delegate.invocations||[delegate];requireThat(calls.length<=1024,'CLR_DELEGATE_LIMIT','Too many delegate targets.');let i=0;
  const next=value=>{if(i>=calls.length){onReturn(value);return;}const call=calls[i++];requireThat(call.method,'CLR_DELEGATE','Invalid delegate target.');this.invoke(call.method,call.method.signature.hasThis?[call.target,...args]:args,next);};next();
 }
 enqueueDelegate(delegate,args){if(!delegate)return;requireThat(this.pendingEvents.length<8192,'CLR_EVENT_LIMIT','Managed event queue limit exceeded.');this.pendingEvents.push({delegate,args});}
 pinvoke(method,args){
  const spec=method.pinvoke,api=this.apis.lookup(spec.dll,spec.name);requireThat(api?.fn,'CLR_PINVOKE','No Browser86 native handler for '+spec.dll+'!'+spec.name+'. Arbitrary native DLL calls and reverse P/Invoke are not implemented.');
  // Explicitly small, auditable marshaling surface: primitive values and input strings.
  requireThat(args.length===api.argc,'CLR_PINVOKE','P/Invoke parameter count differs from native handler.');const allocations=[];
  const params=method.signature.params.map((sig,i)=>{
   const type=method.assembly.typeName(sig);if(type==='System.String'){if(args[i]===null)return 0;const wide=(spec.flags&6)===4||(spec.flags&6)===6;const p=this.heap.string(display(args[i]),wide);allocations.push(p);return p;}
   requireThat(primitiveValues.has(type)&&!['System.Int64','System.UInt64','System.Single','System.Double'].includes(type),'CLR_PINVOKE','Unsupported P/Invoke marshaling type: '+type);return u32(args[i]);
  });
  this.apiCalls++;this.lastApi=spec.dll+'!'+spec.name;
  try{const result=api.fn(...params);requireThat(!result?.call,'CLR_PINVOKE','Native callbacks require reverse P/Invoke support.');return result;}finally{for(const p of allocations)this.heap.free(p);}
 }
 location(){const f=this.frames.at(-1);return f?f.method.owner.name+'.'+f.method.name+' IL_'+f.lastIp.toString(16).padStart(4,'0'):'managed entry';}
 tick(budget=20000,milliseconds=10){
  if(this.status!=='running')return;const end=performance.now()+milliseconds;
  this.forms.poll();
  for(let i=0;i<budget&&this.status==='running';i++){
   const wait=this.waits.at(-1);
   if(wait&&this.frames.length<=wait.depth){const result=wait.check();if(result!==undefined){this.waits.pop();this.waiting=this.waits.at(-1)||null;wait.complete(result);}else if(!this.pendingEvents.length||this.eventActive)return;}
   if(this.pendingEvents.length&&!this.eventActive){const event=this.pendingEvents.shift();this.eventActive=true;this.invokeDelegate(event.delegate,event.args,()=>{this.eventActive=false;});}
   if(!this.frames.length){if(!this.entryDone&&!this.waiting)this.exit(0);return;}
   if(this.waiting&&this.frames.length<=this.waiting.depth)return;
   const frame=this.frames.at(-1),address=(frame.method.rva+frame.ip)>>>0;
   if(this.breakpoints.has(address)){this.pause('CIL breakpoint at '+this.location());return;}
   this.stepIL();
   requireThat(this.cpu.instructions<this.instructionsLimit,'INSTRUCTION_LIMIT','Managed instruction budget exceeded.',{limit:this.instructionsLimit});
   if((i&255)===255&&performance.now()>=end)return;
  }
 }
 stepOne(){if(this.status!=='paused')return;requireThat(!this.waiting||this.frames.length>this.waiting.depth,'CLR_WAITING','Cannot step a blocked managed call.');this.stepIL();this.emit('debug',this.debug());}
 inputEvent(event){if(event.kind==='console'){const text=String(event.text);requireThat(text.length<=65536&&this.managedInput.length<1024,'INPUT_LIMIT','Managed console input limit exceeded.');this.managedInput.push(text);return;}if(event.kind==='dialog'){this.dialogResults.set(event.id,event.result);return;}this.apis.gui.input(event);}
 exit(code=0){this.waits=[];this.waiting=null;super.exit(code);}
 stop(){this.waits=[];this.pendingEvents=[];super.stop();}
 debug(){
  const f=this.frames?.at(-1);return {runtime:'cil',status:this.status,registers:{ASSEMBLY:f?.method.assembly.name||this.assembly?.name,METHOD:f?f.method.owner.name+'.'+f.method.name:'—',TOKEN:f?tokenText(f.method.token):'—',IL:f?'IL_'+f.ip.toString(16).padStart(4,'0'):'—',STACK:String(f?.stack.length||0),FRAMES:String(this.frames?.length||0)},eip:f?tokenText(f.method.rva+f.ip):null,flags:'CIL',instructions:this.cpu.instructions,apiCalls:this.apiCalls,lastApi:this.lastApi,waiting:this.waiting?.reason,committedBytes:this.memory.allocated+(this.managedAllocated||0),managedAllocated:this.managedAllocated,mappings:this.memory.mappings(),modules:[...this.assemblyPaths?.values()||[]].map(a=>({path:a.path,base:'CIL',size:a.image.bytes.length})),callTrace:[...this.callTrace],trace:[...this.managedTrace||[]],managedFrames:(this.frames||[]).map(f=>({assembly:f.method.assembly.name,method:f.method.owner.name+'.'+f.method.name,token:tokenText(f.method.token),offset:f.ip,stack:f.stack.map(v=>display(v).slice(0,100))})),missing:[],notes:['CIL instructions, not x86 instructions. Managed memory is a cumulative allocation budget, not a live CLR heap measurement.']};
 }
 raise(object){
  object=this.nonNull(object);const frames=[...this.frames];let target=null,handler=null;
  for(let i=frames.length-1;i>=0;i--){const f=frames[i],catches=f.body.clauses.filter(c=>c.flags===0&&inside(c,f.lastIp)).sort((a,b)=>a.tryLength-b.tryLength);
   handler=catches.find(c=>this.isA(object,this.resolveType({token:c.classToken,assembly:f.method.assembly})));
   if(handler){target=f;break;}
  }
  const actions=[];
  for(let i=frames.length-1;i>=0;i--){const f=frames[i];
   for(const c of f.body.clauses.filter(c=>(c.flags===2||c.flags===4)&&inside(c,f.lastIp)&&!(f===target&&inside(c,handler.handlerOffset))).sort((a,b)=>a.tryLength-b.tryLength))actions.push({frame:f,clause:c});
   if(f===target)break;
  }
  const trace=frames.map(f=>f.method.owner.name+'.'+f.method.name+' IL_'+f.lastIp.toString(16)).reverse();
  this.transfer({kind:'exception',object,target,handler,actions,trace});
 }
 transfer(t){
  const action=t.actions.shift();
  const keep=action?.frame||t.target;
  while(this.frames.length&&this.frames.at(-1)!==keep){const popped=this.frames.pop();if(popped.initializerType){const error=this.exception('System.TypeInitializationException','The type initializer for '+popped.initializerType.name+' threw an exception.',t.object);this.typeInitializers.set(popped.initializerType,{error});t.object=error;}}
  if(action){const f=action.frame;f.pendingTransfer=t;f.stack=[];f.ip=action.clause.handlerOffset;return;}
  if(t.kind==='leave'){t.target.ip=t.destination;t.target.pendingTransfer=null;return;}
  if(t.target){t.target.stack=[t.object];t.target.ip=t.handler.handlerOffset;t.target.currentException=t.object;t.target.pendingTransfer=null;return;}
  throw new RuntimeFault('CLR_UNHANDLED_EXCEPTION',display(t.object),{exception:t.object.__type?.name,message:t.object.message,managedStack:t.trace});
 }
 leave(frame,target){
  frame.stack=[];const actions=frame.body.clauses.filter(c=>c.flags===2&&inside(c,frame.lastIp)&&!inside(c,target)).sort((a,b)=>a.tryLength-b.tryLength).map(clause=>({frame,clause}));
  this.transfer({kind:'leave',target:frame,destination:target,actions});
 }
 stepIL(){
  const f=this.frames.at(-1);if(!f)return;
  const ins=f.body.instructions.get(f.ip);requireThat(ins,'CLR_INVALID_IL','CIL instruction pointer is outside the method.',{method:f.method.name,offset:f.ip});
  f.lastIp=f.ip;f.ip=ins.next;this.cpu.instructions++;this.cpu.eip=(f.method.rva+f.lastIp)>>>0;
  this.managedTrace.push(this.location()+' '+opcodeName(ins.op));if(this.managedTrace.length>64)this.managedTrace.shift();
  try{this.execute(f,ins);}catch(error){if(error instanceof ManagedException)this.raise(error.object);else throw error;}
 }
 execute(f,ins){
  const {op,operand:x,offset}=ins,s=f.stack,a=f.method.assembly,ctx=f.context;
  const pop=()=>{requireThat(s.length>0,'CLR_INVALID_IL','Evaluation stack underflow.',{method:f.method.name,offset});return s.pop();};
  const push=v=>{requireThat(s.length<f.body.maxStack,'CLR_INVALID_IL','Evaluation stack exceeds declared maxstack.',{method:f.method.name,offset});s.push(v);};
  const slot=(items,n,type)=>{requireThat(n>=0&&n<items.length,'CLR_INVALID_IL','Invalid argument/local index.',{index:n});return new ManagedRef(()=>items[n],v=>{items[n]=copy(v);},type);};
  const local=n=>slot(f.locals,n,f.body.locals[n]);
  const arg=n=>slot(f.args,n,n===0&&f.method.signature.hasThis?null:f.method.signature.params[n-(f.method.signature.hasThis?1:0)]);
  const ts=()=>({token:x,assembly:a});
  if(op>=0x02&&op<=0x05){push(copy(arg(op-2).get()));return;}
  if(op>=0x06&&op<=0x09){push(copy(local(op-6).get()));return;}
  if(op>=0x0a&&op<=0x0d){local(op-0xa).set(pop());return;}
  if(op>=0x15&&op<=0x1e){push(op-0x16);return;}
  if(op>=0x2b&&op<=0x44){const b=op>=0x38?op-0x38:op-0x2b;let take;
   if(b===0)take=true;else if(b===1)take=!truth(pop());else if(b===2)take=truth(pop());else {const right=pop(),left=pop();take=b===3?compare('eq',left,right):b===8?!compare('eq',left,right):compare(({4:'ge',5:'gt',6:'le',7:'lt',9:'ge.un',10:'gt.un',11:'le.un',12:'lt.un'})[b],left,right);}
   if(take)f.ip=ins.next+x;return;
  }
  if(op>=0x46&&op<=0x50){const value=requireRef(pop()).get();const names=['System.SByte','System.Byte','System.Int16','System.UInt16','System.Int32','System.UInt32','System.Int64','System.IntPtr','System.Single','System.Double',null];push(copy(coerce(this,value,names[op-0x46])));return;}
  if(op>=0x51&&op<=0x57||op===0xdf){const v=pop(),r=requireRef(pop());const name=({0x52:'System.SByte',0x53:'System.Int16',0x54:'System.Int32',0x55:'System.Int64',0x56:'System.Single',0x57:'System.Double',0xdf:'System.IntPtr'})[op];r.set(copy(coerce(this,v,name)));return;}
  if(op>=0x58&&op<=0x64||op>=0xd6&&op<=0xdb){const right=pop(),left=pop();push(arithmetic(this,op,left,right));return;}
  if(op>=0x67&&op<=0x6e||op===0x76||op>=0x82&&op<=0x8b||op>=0xb3&&op<=0xba||op>=0xd1&&op<=0xd5||op===0xe0){push(convert(this,op,pop()));return;}
  if(op>=0x90&&op<=0x9a||op===0xa3){const index=pop(),array=pop(),value=this.arrayRef(array,index).get();const names=['System.SByte','System.Byte','System.Int16','System.UInt16','System.Int32','System.UInt32','System.Int64','System.IntPtr','System.Single','System.Double',null];push(copy(coerce(this,value,op===0xa3?this.resolveType(ts(),ctx).name:names[op-0x90])));return;}
  if(op>=0x9b&&op<=0xa2||op===0xa4){const value=pop(),index=pop(),array=pop();const names=['System.IntPtr','System.SByte','System.Int16','System.Int32','System.Int64','System.Single','System.Double',null];this.arrayRef(array,index).set(coerce(this,value,op===0xa4?this.resolveType(ts(),ctx).name:names[op-0x9b]));return;}
  switch(op){
   case 0x00:case 0x01:return;
   case 0x0e:case 0xfe09:push(copy(arg(x).get()));return;
   case 0x0f:case 0xfe0a:push(arg(x));return;
   case 0x10:case 0xfe0b:arg(x).set(pop());return;
   case 0x11:case 0xfe0c:push(copy(local(x).get()));return;
   case 0x12:case 0xfe0d:push(local(x));return;
   case 0x13:case 0xfe0e:local(x).set(pop());return;
   case 0x14:push(null);return;
   case 0x1f:case 0x20:case 0x21:push(x);return;
   case 0x22:case 0x23:push(new Real(x));return;
   case 0x25:{const v=pop();push(v);push(copy(v));return;}
   case 0x26:pop();return;
   case 0x28:case 0x6f:case 0x73:{
    const reference=a.member(x);let method=this.resolveMember(reference);const isNew=op===0x73;
    if((isNew||!method.signature.hasThis)&&method.name!=='.cctor'&&this.ensureInitialized(method.owner,f,offset))return;
    const args=method.signature.params.map(()=>pop()).reverse();let created;
    if(isNew){requireThat(method.name==='.ctor'&&method.signature.hasThis,'CLR_INVALID_IL','newobj must reference an instance constructor.');created=this.newObject(method.owner);args.unshift(this.isValueType(method.owner)?new ManagedRef(()=>created,v=>{created=copy(v);}):created);}
    else if(method.signature.hasThis){let receiver=pop();if(op===0x6f){receiver=this.nonNull(receiver);method=this.virtualMethod(method,receiver);}args.unshift(receiver);}
    f.constrainedType=null;
    this.invoke(method,args,result=>{if(isNew)push(copy(created));else if(method.assembly.typeName(method.signature.ret)!=='System.Void')push(copy(coerce(this,result,method.assembly.typeName(method.signature.ret))));});return;
   }
   case 0x2a:{const ret=f.method.assembly.typeName(f.method.signature.ret),value=ret==='System.Void'?undefined:coerce(this,pop(),ret);requireThat(s.length===0,'CLR_INVALID_IL','Nonempty stack at ret.');this.finishFrame(value);return;}
   case 0x45:{const index=u32(pop());if(index<x.length)f.ip=ins.next+x[index];return;}
   case 0x65:{const v=pop();push(v instanceof Real?new Real(-v.value):typeof v==='bigint'?BigInt.asIntN(64,-v):(-i32(v))|0);return;}
   case 0x66:{const v=pop();push(typeof v==='bigint'?BigInt.asIntN(64,~v):~i32(v));return;}
   case 0x70:{const source=requireRef(pop()),dest=requireRef(pop());dest.set(copy(source.get()));return;}
   case 0x71:push(copy(requireRef(pop()).get()));return;
   case 0x72:push(this.text(a.userString(x)));return;
   case 0x74:case 0x75:{const value=pop(),type=this.resolveType(ts(),ctx);if(value===null){push(null);return;}const match=this.isA(value,type);if(!match&&op===0x74)this.throwException('System.InvalidCastException','Unable to cast object to '+type.name);push(match?value:null);return;}
   case 0x79:case 0xa5:{const boxed=pop(),type=this.resolveType(ts(),ctx);if(!this.isValueType(type)){if(boxed!==null&&!this.isA(boxed,type))this.throwException('System.InvalidCastException','Invalid reference unbox.any.');push(boxed);return;}this.nonNull(boxed);if(!boxed.__boxed||boxed.__type.name!==type.name)this.throwException('System.InvalidCastException','Boxed value has a different type.');push(op===0x79?new ManagedRef(()=>boxed.value,v=>{boxed.value=copy(v);},ts()):copy(boxed.value));return;}
   case 0x7a:{const value=this.nonNull(pop());throw new ManagedException(value);}
   case 0x7b:case 0x7c:case 0x7d:{const field=this.resolveMember(a.member(x)),value=op===0x7d?pop():undefined,obj=pop(),ref=this.fieldRef(field,obj);if(op===0x7d)ref.set(coerce(this,value,a.typeName(field.type)));else push(op===0x7c?ref:copy(ref.get()));return;}
   case 0x7e:case 0x7f:case 0x80:{const field=this.resolveMember(a.member(x));if(this.ensureInitialized(field.owner,f,offset))return;
    if(field.host){requireThat(op===0x7e,'CLR_UNSUPPORTED_API','Writing/addressing intrinsic static fields is not supported.');const v=readIntrinsicField(this,field);requireThat(v!==NOT_HANDLED,'CLR_UNSUPPORTED_API','Unsupported framework field: '+field.owner.name+'.'+field.name);push(v);return;}
    const ref=this.staticRef(field);if(op===0x80)ref.set(coerce(this,pop(),field.assembly.typeName(field.type)));else push(op===0x7f?ref:copy(ref.get()));return;
   }
   case 0x81:{const value=pop();requireRef(pop()).set(copy(value));return;}
   case 0x8c:{const value=pop(),type=this.resolveType(ts(),ctx);if(!this.isValueType(type)){push(value);return;}this.account(48);push({__boxed:true,__type:type,value:copy(coerce(this,value,type.name))});return;}
   case 0x8d:{const len=i32(pop());push(this.array(ts(),len));return;}
   case 0x8e:{const arr=this.nonNull(pop());requireThat(arr.__array,'CLR_INVALID_IL','ldlen requires an array.');push(arr.items.length);return;}
   case 0x8f:{const index=pop(),arr=pop();push(this.arrayRef(arr,index));return;}
   case 0xd0:{const table=x>>>24;push(table===1||table===2||table===27?{__handle:'type',type:this.resolveType(ts(),ctx)}:{__handle:table===4?'field':'method',member:this.resolveMember(a.member(x))});return;}
   case 0xdc:{requireThat(f.pendingTransfer,'CLR_INVALID_IL','endfinally outside an active finally.');const t=f.pendingTransfer;f.pendingTransfer=null;this.transfer(t);return;}
   case 0xdd:case 0xde:this.leave(f,ins.next+x);return;
   case 0xfe01:case 0xfe02:case 0xfe03:case 0xfe04:case 0xfe05:{const b=pop(),v=pop();push(compare(({0xfe01:'eq',0xfe02:'gt',0xfe03:'gt.un',0xfe04:'lt',0xfe05:'lt.un'})[op],v,b)?1:0);return;}
   case 0xfe06:case 0xfe07:{let method=this.resolveMember(a.member(x));if(op===0xfe07)method=this.virtualMethod(method,pop());push({__methodPointer:true,method});return;}
   case 0xfe15:requireRef(pop()).set(this.defaultValue(ts(),ctx));return;
   case 0xfe16:f.constrainedType=this.resolveType(ts(),ctx);return;
   case 0xfe13:case 0xfe14:case 0xfe1e:return; // single-threaded interpreter; no tail-call optimization
   case 0xfe1a:requireThat(f.currentException,'CLR_INVALID_IL','rethrow outside catch.');throw new ManagedException(f.currentException);
   case 0xfe1c:{const type=this.resolveType(ts(),ctx),size=({'System.Boolean':1,'System.Byte':1,'System.SByte':1,'System.Char':2,'System.Int16':2,'System.UInt16':2,'System.Int32':4,'System.UInt32':4,'System.IntPtr':4,'System.UIntPtr':4,'System.Int64':8,'System.UInt64':8,'System.Single':4,'System.Double':8})[type.name];requireThat(size,'CLR_UNSUPPORTED_LAYOUT','sizeof of nonprimitive structures is not implemented.');push(size);return;}
   default:throw new RuntimeFault('CLR_UNSUPPORTED_OPCODE','Unsupported CIL opcode 0x'+op.toString(16)+' at '+this.location(),{method:f.method.owner.name+'.'+f.method.name,token:tokenText(f.method.token),offset,opcode:op});
  }
 }
}
