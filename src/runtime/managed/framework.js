// Explicit .NET Framework intrinsic surface. Unknown members fail, never pretend success.
// This is not mscorlib/System.dll and does not load Microsoft framework implementation DLLs.
import {NOT_HANDLED,Real,ManagedRef,raw,number,i32,u32,copy,deref,unbox,display,requireRef} from './values.js';
import {RuntimeFault,requireThat} from '../errors.js';
import {coerce} from './numeric.js';
import {normalizePath} from '../vfs.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8');
const integerNames=new Set(['System.SByte','System.Byte','System.Int16','System.UInt16','System.Int32','System.UInt32','System.Int64','System.UInt64','System.IntPtr','System.UIntPtr']);
function valueText(value,type=''){
 value=deref(value);if(value?.__boxed)return valueText(value.value,value.__type.name);
 if(type==='System.Char')return String.fromCharCode(number(value));
 if(type==='System.Boolean')return raw(value)?'True':'False';
 if(type==='System.UInt32'||type==='System.UIntPtr')return String(u32(value));
 if(type==='System.UInt64')return String(BigInt.asUintN(64,raw(value)));
 return display(value);
}
function str(p,v,name='value'){if(v===null||v===undefined)p.throwException('System.ArgumentNullException',name);requireThat(typeof v==='string','CLR_INVALID_IL','Expected a string.');return v;}
function index(p,n,length,allowEnd=false){n=number(n);if(!Number.isInteger(n)||n<0||n>(allowEnd?length:length-1))p.throwException('System.ArgumentOutOfRangeException','Index was out of range.');return n;}
function formatNumber(p,value,format=''){
 if(!format)return valueText(value);const v=unbox(value),r=raw(v),m=/^([dDxXfFnNgGeE])(\d{0,2})$/.exec(format);
 if(!m)throw new RuntimeFault('CLR_FORMAT','Unsupported numeric format: '+format);
 const f=m[1].toLowerCase(),precision=m[2]?Number(m[2]):f==='d'||f==='x'?1:2;
 if(f==='d'||f==='x'){let n=typeof r==='bigint'?r:BigInt(Math.trunc(Number(r)));if(f==='x'&&n<0n)n=BigInt.asUintN(typeof r==='bigint'?64:32,n);let text=(n<0n?-n:n).toString(f==='x'?16:10).padStart(precision,'0');if(n<0n)text='-'+text;return m[1]==='X'?text.toUpperCase():text;}
 const n=Number(r);if(f==='f')return n.toFixed(precision);if(f==='e')return n.toExponential(precision);if(f==='g')return m[2]?n.toPrecision(precision):String(n);if(f==='n'){const [a,b]=n.toFixed(precision).split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b===undefined?'':'.'+b);}return String(n);
}
function format(p,pattern,args){
 pattern=str(p,pattern,'format');let result='';
 for(let i=0;i<pattern.length;){const c=pattern[i++];if(c==='{'&&pattern[i]==='{'){result+='{';i++;continue;}if(c==='}'&&pattern[i]==='}'){result+='}';i++;continue;}
  if(c==='}'){p.throwException('System.FormatException','Unescaped closing brace.');}
  if(c!=='{'){result+=c;continue;}
  const end=pattern.indexOf('}',i);if(end<0)p.throwException('System.FormatException','Unclosed format item.');const spec=pattern.slice(i,end),m=/^(\d+)(?:,\s*(-?\d+))?(?::([^{}]*))?$/.exec(spec);
  if(!m||Number(m[1])>=args.length)p.throwException('System.FormatException','Invalid format item.');let text=m[3]?formatNumber(p,args[Number(m[1])],m[3]):valueText(args[Number(m[1])]);
  if(m[2]){const width=Number(m[2]);requireThat(Math.abs(width)<=1024*1024,'CLR_STRING_LIMIT','Excessive format alignment.');text=width<0?text.padEnd(-width):text.padStart(width);}
  result+=text;i=end+1;requireThat(result.length<=4*1024*1024,'CLR_STRING_LIMIT','Formatted string is too long.');
 }
 return p.text(result);
}
function parseNumber(p,text,type){
 text=str(p,text).trim();if(type==='System.Single'||type==='System.Double'){if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&!['NaN','Infinity','-Infinity'].includes(text))p.throwException('System.FormatException','Input string was not in a correct format.');const n=Number(text);return new Real(type==='System.Single'?Math.fround(n):n);}
 if(!/^[+-]?\d+$/.test(text))p.throwException('System.FormatException','Input string was not in a correct format.');const n=BigInt(text),bits=type.includes('64')?64:type.includes('16')?16:type.endsWith('Byte')?8:32,unsigned=type.includes('UInt')||type==='System.Byte';const min=unsigned?0n:-(1n<<BigInt(bits-1)),max=(1n<<BigInt(unsigned?bits:bits-1))-1n;
 if(n<min||n>max)p.throwException('System.OverflowException','Value was outside the range of '+type);return bits===64?BigInt.asIntN(64,n):Number(n);
}
function io(p,fn){try{return fn();}catch(e){if(e instanceof RuntimeFault&&e.code?.startsWith('VFS_'))p.throwException(e.code==='VFS_NOT_FOUND'?'System.IO.FileNotFoundException':'System.IO.IOException',e.message);throw e;}}
function filePath(p,path){return io(p,()=>p.vfs.path(str(p,path,'path')));}
function ensureParent(p,path){const parent=path.slice(0,path.lastIndexOf('/'))||'C:/';if(!p.vfs.get(parent)?.directory)p.throwException('System.IO.DirectoryNotFoundException','Directory not found: '+parent);}
function writeFile(p,path,data,append=false){path=filePath(p,path);ensureParent(p,path);if(append&&p.vfs.exists(path)){const old=io(p,()=>p.vfs.readFile(path));requireThat(old.length+data.length<=p.vfs.limit,'CLR_FILE_LIMIT','File exceeds virtual disk limit.');const merged=new Uint8Array(old.length+data.length);merged.set(old);merged.set(data,old.length);data=merged;}p.account(data.length);return io(p,()=>p.vfs.writeFile(path,data));}
function bytes(p,data){return p.array({name:'System.Byte'},Array.from(data));}
function managedType(p,type){const obj=p.newObject(p.hostType('System.Type'));obj.reflectedType=type;return obj;}
function isDelegate(p,type){for(let t=type,n=0;t&&n<64;t=p.baseType(t),n++)if(t.name==='System.Delegate'||t.name==='System.MulticastDelegate')return true;return false;}
function combine(p,a,b){if(!a)return b;if(!b)return a;const invocations=[...(a.invocations||[a]),...(b.invocations||[b])];requireThat(invocations.length<=1024,'CLR_DELEGATE_LIMIT','Delegate invocation list is too long.');p.account(64+invocations.length*8);return {...a,invocations};}
function removeDelegate(a,b){if(!a||!b)return a;const list=[...(a.invocations||[a])],sub=b.invocations||[b];for(let i=list.length-sub.length;i>=0;i--){if(sub.every((v,j)=>v.method===list[i+j].method&&v.target===list[i+j].target)){list.splice(i,sub.length);return list.length?{...a,invocations:list}:null;}}return a;}
export function readIntrinsicField(p,f){const name=f.owner.name,key=f.name;if(name==='System.String'&&key==='Empty')return '';if(name==='System.EventArgs'&&key==='Empty')return p.emptyEventArgs??=p.newObject(p.hostType(name));if((name==='System.IntPtr'||name==='System.UIntPtr')&&key==='Zero')return 0;return NOT_HANDLED;}
export function invokeIntrinsic(p,m,all){
 const owner=m.owner.name,name=m.name,instance=m.signature.hasThis,self=instance?deref(all[0]):null,args=instance?all.slice(1):all;
 const param=i=>m.assembly.typeName(m.signature.params[i]),ret=m.assembly.typeName(m.signature.ret);
 if(isDelegate(p,m.owner)){
  if(name==='.ctor'&&args.length===2){requireThat(args[1]?.__methodPointer,'CLR_DELEGATE','Delegate constructor requires a method pointer.');self.method=args[1].method;self.target=args[0];return;}
  if(name==='Invoke')return {delegateCall:self,args};
 }
 if(owner==='System.Delegate'||owner==='System.MulticastDelegate'){
  if(name==='Combine'&&args.length===2)return combine(p,args[0],args[1]);if(name==='Remove'&&args.length===2)return removeDelegate(args[0],args[1]);
  if(name==='op_Equality')return args[0]===args[1]?1:0;if(name==='op_Inequality')return args[0]!==args[1]?1:0;
 }
 if(owner==='System.Object'){
  if(name==='.ctor'&&args.length===0)return;
  if(name==='ToString'&&args.length===0)return valueText(self);
  if(name==='Equals')return raw(unbox(instance?self:args[0]))===raw(unbox(instance?args[0]:args[1]))?1:0;
  if(name==='ReferenceEquals')return args[0]===args[1]?1:0;
  if(name==='GetHashCode')return typeof self==='string'?Array.from(self).reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0)|0,0):self?.__id||i32(raw(self));
  if(name==='GetType')return managedType(p,self?.__type||p.hostType(typeof self==='string'?'System.String':self?.__array?'System.Array':'System.Int32'));
  if(name==='MemberwiseClone'){p.account(64);return {...self,__id:p.nextObjectId++,fields:new Map(self.fields)};}
 }
 if(owner==='System.EventArgs'&&name==='.ctor')return;
 if(owner.endsWith('Exception')){
  if(name==='.ctor'){self.message=typeof args[0]==='string'?args[0]:"Exception of type '"+self.__type.name+"' was thrown.";self.innerException=args[1]||null;return;}
  if(name==='get_Message')return self.message||'';if(name==='get_InnerException')return self.innerException||null;if(name==='ToString')return display(self);
 }
 if(owner==='System.Console'){
  if((name==='Write'||name==='WriteLine')&&args.length<=4){let text='';if(args.length>1&&param(0)==='System.String')text=format(p,args[0],args.length===2&&args[1]?.__array?args[1].items:args.slice(1));else if(args.length)text=valueText(args[0],param(0));p.emit('stdout',{text:text+(name==='WriteLine'?'\r\n':''),stream:'stdout'});return;}
  if(name==='ReadLine'&&args.length===0){if(p.managedInput.length)return p.managedInput.shift();return {wait:()=>p.managedInput.length?p.managedInput.shift():undefined,reason:'Console.ReadLine — enter a line'};}
  if(name==='get_Out'||name==='get_Error'){const obj=p.newObject(p.hostType('System.IO.TextWriter'));obj.consoleStream=name==='get_Error'?'stderr':'stdout';return obj;}
 }
 if(owner==='System.String'){
  if(name==='.ctor'&&args.length===2&&param(0)==='System.Char'){const count=index(p,args[1],4*1024*1024,true);self.stringValue=p.text(String.fromCharCode(number(args[0])).repeat(count));throw new RuntimeFault('CLR_UNSUPPORTED_API','String(char,count) allocation is not yet represented as an immutable primitive.');}
  if(name==='Concat'){const values=args.length===1&&args[0]?.__array?args[0].items:args;return p.text(values.map(v=>valueText(v)).join(''));}
  if(name==='Format'&&param(0)==='System.String')return format(p,args[0],args.length===2&&args[1]?.__array?args[1].items:args.slice(1));
  if(name==='op_Equality')return args[0]===args[1]?1:0;if(name==='op_Inequality')return args[0]!==args[1]?1:0;
  if(name==='IsNullOrEmpty')return args[0]===null||args[0]===''?1:0;if(name==='IsNullOrWhiteSpace')return args[0]===null||/^\s*$/.test(args[0])?1:0;
  if(name==='Equals'&&args.length<3)return (instance?self:args[0])===(instance?args[0]:args[1])?1:0;
  if(name==='Join'&&args[1]?.__array)return p.text(args[1].items.map(v=>valueText(v)).join(args[0]||''));
  if(instance){const text=str(p,self);
   switch(name){case 'get_Length':return text.length;case 'get_Chars':return text.charCodeAt(index(p,args[0],text.length));case 'ToString':return text;
    case 'Trim':if(!args.length)return p.text(text.trim());break;case 'TrimStart':if(!args.length||args[0]?.items.length===0)return p.text(text.trimStart());break;case 'TrimEnd':if(!args.length||args[0]?.items.length===0)return p.text(text.trimEnd());break;
    case 'ToUpperInvariant':return p.text(text.toUpperCase());case 'ToLowerInvariant':return p.text(text.toLowerCase());
    case 'Contains':if(args.length===1)return text.includes(str(p,args[0]))?1:0;break;
    case 'StartsWith':case 'EndsWith':if(args.length===1)return text[name==='StartsWith'?'startsWith':'endsWith'](str(p,args[0]))?1:0;break;
    case 'Substring':{const start=index(p,args[0],text.length,true),len=args.length===1?text.length-start:number(args[1]);if(!Number.isInteger(len)||len<0||start+len>text.length)p.throwException('System.ArgumentOutOfRangeException','Substring range is invalid.');return p.text(text.slice(start,start+len));}
    case 'IndexOf':case 'LastIndexOf':if(args.length<=2){const needle=param(0)==='System.Char'?String.fromCharCode(number(args[0])):str(p,args[0]);const start=args.length>1?index(p,args[1],text.length,true):name==='IndexOf'?0:text.length;return text[name==='IndexOf'?'indexOf':'lastIndexOf'](needle,start);}break;
    case 'Replace':if(args.length===2){const old=param(0)==='System.Char'?String.fromCharCode(number(args[0])):str(p,args[0]),next=param(1)==='System.Char'?String.fromCharCode(number(args[1])):args[1]||'';if(old==='')p.throwException('System.ArgumentException','Old value cannot be empty.');return p.text(text.split(old).join(next));}break;
    case 'ToCharArray':if(!args.length)return p.array({name:'System.Char'},Array.from({length:text.length},(_,i)=>text.charCodeAt(i)));break;
    case 'Split':if(args.length===1&&args[0]?.__array){const separators=args[0].items.map(v=>String.fromCharCode(number(v))),out=[];let part='';for(const c of text){if(separators.includes(c)){out.push(part);part='';}else part+=c;}out.push(part);return p.array({name:'System.String'},out);}break;
   }
  }
 }
 if(integerNames.has(owner)||owner==='System.Single'||owner==='System.Double'||owner==='System.Boolean'||owner==='System.Char'){
  if(name==='ToString'&&instance&&args.length<=1){if(args.length&&typeof args[0]==='string')return p.text(formatNumber(p,unbox(self),args[0]));if(!args.length)return p.text(valueText(unbox(self),owner));}
  if(name==='Parse'&&args.length===1){if(owner==='System.Boolean'){const t=str(p,args[0]).trim().toLowerCase();if(t!=='true'&&t!=='false')p.throwException('System.FormatException','Invalid boolean.');return t==='true'?1:0;}return parseNumber(p,args[0],owner);}
  if(name==='TryParse'&&args.length===2){try{const v=parseNumber(p,args[0],owner);requireRef(args[1]).set(v);return 1;}catch(e){if(e.object&&['System.FormatException','System.OverflowException','System.ArgumentNullException'].includes(e.object.__type.name)){requireRef(args[1]).set(owner.includes('64')?0n:0);return 0;}throw e;}}
  if(name==='Equals'&&args.length===1)return raw(unbox(self))===raw(unbox(args[0]))?1:0;
  if(name==='CompareTo'&&args.length===1){const a=raw(unbox(self)),b=raw(unbox(args[0]));return a===b?0:a<b?-1:1;}
  if(name==='IsNaN')return Number.isNaN(number(args[0]))?1:0;if(name==='IsInfinity')return Math.abs(number(args[0]))===Infinity?1:0;
 }
 if(owner==='System.Convert'&&args.length===1){
  if(name==='ToString')return p.text(valueText(args[0],param(0)));
  if(name==='ToBoolean'){const v=unbox(args[0]);if(typeof v==='string'){const t=v.trim().toLowerCase();if(t!=='true'&&t!=='false')p.throwException('System.FormatException','Invalid boolean.');return t==='true'?1:0;}return raw(v)?1:0;}
  if(name.startsWith('To')&&(integerNames.has('System.'+name.slice(2))||name==='ToSingle'||name==='ToDouble')){const target='System.'+name.slice(2),v=unbox(args[0]);if(typeof v==='string')return parseNumber(p,v,target);if(v===null)return target.includes('64')?0n:0;const n=raw(v);if(v instanceof Real&&integerNames.has(target)){const floor=Math.floor(n),frac=n-floor,rounded=frac===0.5?(floor%2===0?floor:floor+1):Math.round(n);return parseNumber(p,String(rounded),target);}return target==='System.Single'||target==='System.Double'?coerce(p,v,target):parseNumber(p,String(n),target);}
 }
 if(owner==='System.Math'){
  const values=args.map(number);if(name==='Abs'&&args.length===1){const v=raw(args[0]);if(typeof v==='bigint'){if(v===-9223372036854775808n)p.throwException('System.OverflowException','Absolute value overflow.');return v<0n?-v:v;}if(param(0)==='System.Int32'&&v===-2147483648)p.throwException('System.OverflowException','Absolute value overflow.');return coerce(p,Math.abs(v),ret);}
  const unary={Sqrt:Math.sqrt,Sin:Math.sin,Cos:Math.cos,Tan:Math.tan,Asin:Math.asin,Acos:Math.acos,Atan:Math.atan,Floor:Math.floor,Ceiling:Math.ceil,Truncate:Math.trunc,Exp:Math.exp,Log10:Math.log10,Sign:Math.sign};
  if(unary[name]&&args.length===1)return coerce(p,unary[name](values[0]),ret);
  if((name==='Max'||name==='Min')&&args.length===2)return (name==='Max'?raw(args[0])>=raw(args[1]):raw(args[0])<=raw(args[1]))?args[0]:args[1];
  if(name==='Pow'&&args.length===2)return new Real(Math.pow(...values));if(name==='Atan2'&&args.length===2)return new Real(Math.atan2(...values));
  if(name==='Log'&&(args.length===1||args.length===2))return new Real(Math.log(values[0])/(args.length===2?Math.log(values[1]):1));
  if(name==='Round'&&args.length<=2){const digits=args.length===2?number(args[1]):0;if(digits<0||digits>15)p.throwException('System.ArgumentOutOfRangeException','Rounding precision.');const scale=10**digits,x=values[0]*scale,f=Math.floor(x),r=x-f===0.5?(f%2===0?f:f+1):Math.round(x);return new Real(r/scale);}
 }
 if(owner==='System.Text.StringBuilder'){
  if(name==='.ctor'){self.text=typeof args[0]==='string'?args[0]:'';return;}
  if(name==='Append'&&args.length===1){const next=self.text+valueText(args[0],param(0));self.text=p.text(next);return self;}
  if(name==='AppendLine'&&args.length<=1){self.text=p.text(self.text+(args.length?args[0]||'':'')+'\r\n');return self;}
  if(name==='AppendFormat'&&param(0)==='System.String'){self.text=p.text(self.text+format(p,args[0],args.length===2&&args[1]?.__array?args[1].items:args.slice(1)));return self;}
  if(name==='ToString'&&!args.length)return p.text(self.text);if(name==='get_Length')return self.text.length;
  if(name==='Clear'){self.text='';return self;}
  if(name==='set_Length'){const n=index(p,args[0],4*1024*1024,true);self.text=p.text(self.text.slice(0,n).padEnd(n,'\0'));return;}
 }
 if(owner==='System.Array'){
  if(name==='get_Length'||name==='get_LongLength')return name==='get_Length'?self.items.length:BigInt(self.items.length);
  if(name==='get_Rank')return 1;if(name==='GetLength'&&number(args[0])===0)return self.items.length;
  if(name==='GetValue'&&args.length===1)return copy(p.arrayRef(self,args[0]).get());
  if(name==='SetValue'&&args.length===2){p.arrayRef(self,args[1]).set(unbox(args[0]));return;}
  if(name==='Empty'&&!args.length&&m.methodArgs?.length)return p.array(m.methodArgs[0],0);
  if(name==='Copy'&&(args.length===3||args.length===5)){const src=p.nonNull(args[0]),dst=p.nonNull(args[args.length===3?1:2]),si=args.length===3?0:number(args[1]),di=args.length===3?0:number(args[3]),len=number(args.at(-1));if(si<0||di<0||len<0||si+len>src.items.length||di+len>dst.items.length)p.throwException('System.ArgumentException','Invalid array copy range.');const data=src.items.slice(si,si+len).map(copy);for(let i=0;i<len;i++)dst.items[di+i]=data[i];return;}
  if(name==='Clear'&&args.length===3){const arr=p.nonNull(args[0]),start=number(args[1]),len=number(args[2]);if(start<0||len<0||start+len>arr.items.length)p.throwException('System.IndexOutOfRangeException','Invalid array clear range.');for(let i=start;i<start+len;i++)arr.items[i]=p.defaultValue(arr.element);return;}
 }
 if(owner==='System.Runtime.CompilerServices.RuntimeHelpers'&&name==='InitializeArray'){
  const arr=p.nonNull(args[0]),field=args[1]?.member;requireThat(field?.rva,'CLR_FIELD_DATA','InitializeArray requires FieldRVA data.');const sizes={'System.Byte':1,'System.SByte':1,'System.Boolean':1,'System.Int16':2,'System.UInt16':2,'System.Char':2,'System.Int32':4,'System.UInt32':4,'System.Single':4,'System.Int64':8,'System.UInt64':8,'System.Double':8},size=sizes[arr.elementName];requireThat(size,'CLR_FIELD_DATA','Unsupported array element layout.');const offset=field.assembly.image.rva(field.rva,arr.items.length*size),view=new DataView(field.assembly.image.bytes.buffer,field.assembly.image.bytes.byteOffset+offset,arr.items.length*size);
  for(let i=0;i<arr.items.length;i++){const at=i*size;arr.items[i]=size===1?view.getUint8(at):size===2?view.getUint16(at,true):arr.elementName==='System.Single'?new Real(view.getFloat32(at,true)):arr.elementName==='System.Double'?new Real(view.getFloat64(at,true)):size===8?view.getBigInt64(at,true):view.getInt32(at,true);}return;
 }
 if(owner==='System.Collections.Generic.List`1'||owner==='System.Collections.ArrayList'){
  if(name==='.ctor'){self.items=[];self.version=0;if(args[0]?.__array)self.items=args[0].items.map(copy);return;}
  if(name==='Add'&&args.length===1){requireThat(self.items.length<2*1024*1024,'CLR_COLLECTION_LIMIT','List size limit.');p.account(16);self.items.push(copy(args[0]));self.version++;return owner.endsWith('ArrayList')?self.items.length-1:undefined;}
  if(name==='get_Count')return self.items.length;if(name==='get_Item')return copy(self.items[index(p,args[0],self.items.length)]);
  if(name==='set_Item'){self.items[index(p,args[0],self.items.length)]=copy(args[1]);self.version++;return;}
  if(name==='Clear'){self.items=[];self.version++;return;}
  if(name==='Contains')return self.items.some(v=>raw(v)===raw(args[0]))?1:0;if(name==='IndexOf')return self.items.findIndex(v=>raw(v)===raw(args[0]));
  if(name==='RemoveAt'){self.items.splice(index(p,args[0],self.items.length),1);self.version++;return;}
  if(name==='Remove'){const at=self.items.findIndex(v=>raw(v)===raw(args[0]));if(at<0)return 0;self.items.splice(at,1);self.version++;return 1;}
  if(name==='ToArray')return p.array(m.typeArgs?.[0]||self.__type.genericArgs?.[0]||{name:'System.Object'},self.items);
  if(name==='GetEnumerator'){const e=p.newObject(p.hostType('System.Collections.Generic.List`1+Enumerator'));e.list=self;e.position=-1;e.version=self.version;return e;}
 }
 if(owner==='System.Collections.Generic.List`1+Enumerator'){
  if(name==='MoveNext'){if(self.version!==self.list.version)p.throwException('System.InvalidOperationException','Collection was modified.');return ++self.position<self.list.items.length?1:0;}
  if(name==='get_Current')return copy(self.list.items[index(p,self.position,self.list.items.length)]);if(name==='Dispose')return;
 }
 if(owner==='System.Collections.Generic.Dictionary`2'){
  if(name==='.ctor'&&!args.length){self.map=new Map();return;}
  if(name==='Add'||name==='set_Item'){const k=p.nonNull(args[0]);if(name==='Add'&&self.map.has(k))p.throwException('System.ArgumentException','An item with the same key has already been added.');p.account(48);self.map.set(k,copy(args[1]));return;}
  if(name==='get_Item'){if(!self.map.has(args[0]))p.throwException('System.Collections.Generic.KeyNotFoundException','The given key was not present in the dictionary.');return copy(self.map.get(args[0]));}
  if(name==='ContainsKey')return self.map.has(args[0])?1:0;if(name==='get_Count')return self.map.size;if(name==='Remove')return self.map.delete(args[0])?1:0;if(name==='Clear'){self.map.clear();return;}
  if(name==='TryGetValue'){const found=self.map.has(args[0]);requireRef(args[1]).set(found?copy(self.map.get(args[0])):p.defaultValue(m.typeArgs?.[1]||{name:'System.Object'}));return found?1:0;}
 }
 if(owner==='System.IO.File'){
  if(name==='Exists'){try{const node=p.vfs.get(args[0]);return node&&!node.directory&&!node.deletePending?1:0;}catch{return 0;}}
  if(name==='ReadAllText'&&args.length===1)return p.text(decoder.decode(io(p,()=>p.vfs.readFile(filePath(p,args[0])))).replace(/^\uFEFF/,''));
  if((name==='WriteAllText'||name==='AppendAllText')&&args.length===2){writeFile(p,args[0],encoder.encode(args[1]||''),name==='AppendAllText');return;}
  if(name==='ReadAllBytes'&&args.length===1)return bytes(p,io(p,()=>p.vfs.readFile(filePath(p,args[0]))));
  if(name==='WriteAllBytes'&&args.length===2){writeFile(p,args[0],Uint8Array.from(p.nonNull(args[1]).items.map(number)));return;}
  if(name==='ReadAllLines'&&args.length===1){let lines=decoder.decode(io(p,()=>p.vfs.readFile(filePath(p,args[0])))).replace(/^\uFEFF/,'').split(/\r\n|\r|\n/);if(lines.at(-1)==='')lines.pop();return p.array({name:'System.String'},lines);}
  if(name==='WriteAllLines'&&args.length===2&&args[1]?.__array){writeFile(p,args[0],encoder.encode(args[1].items.map(v=>valueText(v)+'\r\n').join('')));return;}
  if(name==='Delete'&&args.length===1){io(p,()=>p.vfs.remove(filePath(p,args[0])));return;}
  if(name==='Copy'&&args.length<=3){const src=filePath(p,args[0]),dst=filePath(p,args[1]);if(p.vfs.exists(dst)&&!raw(args[2]))p.throwException('System.IO.IOException','Destination file exists.');writeFile(p,dst,io(p,()=>p.vfs.readFile(src)));return;}
  if(name==='Move'&&args.length===2){io(p,()=>p.vfs.rename(filePath(p,args[0]),filePath(p,args[1])));return;}
 }
 if(owner==='System.IO.Directory'){
  if(name==='CreateDirectory'&&args.length===1){const path=filePath(p,args[0]);io(p,()=>p.vfs.mkdir(path));const obj=p.newObject(p.hostType('System.IO.DirectoryInfo'));obj.path=path;return obj;}
  if(name==='Exists'){try{return p.vfs.get(args[0])?.directory?1:0;}catch{return 0;}}
  if(name==='GetCurrentDirectory')return p.vfs.cwd.replaceAll('/','\\');
  if(name==='SetCurrentDirectory'){const path=filePath(p,args[0]);if(!p.vfs.get(path)?.directory)p.throwException('System.IO.DirectoryNotFoundException',path);p.vfs.cwd=path;return;}
  if((name==='GetFiles'||name==='GetDirectories')&&args.length===1){const path=filePath(p,args[0]);if(!p.vfs.get(path)?.directory)p.throwException('System.IO.DirectoryNotFoundException',path);return p.array({name:'System.String'},p.vfs.list(path).filter(x=>name==='GetDirectories'?x.directory:!x.directory).map(x=>x.path.replaceAll('/','\\')));}
  if(name==='Delete'&&args.length===1){io(p,()=>p.vfs.remove(filePath(p,args[0])));return;}
 }
 if(owner==='System.IO.Path'){
  const path=typeof args[0]==='string'?args[0].replaceAll('\\','/'):args[0];
  if(name==='Combine'&&args.length>=2&&args.length<=4){let result='';for(const part of args){str(p,part,'path');result=/^(?:[a-z]:[\\/]|[\\/])/i.test(part)?part:result?result.replace(/[\\/]$/,'')+'\\'+part:part;}return result.replaceAll('/','\\');}
  if(name==='GetFileName')return path===null?null:path.slice(path.lastIndexOf('/')+1);
  if(name==='GetDirectoryName'){if(path===null)return null;const at=path.lastIndexOf('/');return at<0?'':path.slice(0,at).replaceAll('/','\\');}
  if(name==='GetExtension'){if(path===null)return null;const name=path.slice(path.lastIndexOf('/')+1),i=name.lastIndexOf('.');return i<0?'':name.slice(i);}
  if(name==='GetFileNameWithoutExtension'){if(path===null)return null;const n=path.slice(path.lastIndexOf('/')+1),i=n.lastIndexOf('.');return i<0?n:n.slice(0,i);}
  if(name==='GetFullPath')return filePath(p,args[0]).replaceAll('/','\\');if(name==='GetTempPath')return 'C:\\Temp\\';
  if(name==='IsPathRooted')return typeof path==='string'&&/^(?:[a-z]:|\/)/i.test(path)?1:0;
 }
 if(owner==='System.IO.DirectoryInfo'||owner==='System.IO.FileInfo'){
  if(name==='.ctor'){self.path=filePath(p,args[0]);return;}if(name==='get_FullName')return self.path.replaceAll('/','\\');if(name==='get_Name')return self.path.slice(self.path.lastIndexOf('/')+1);if(name==='get_Exists')return p.vfs.exists(self.path)?1:0;if(name==='get_Length')return BigInt(io(p,()=>p.vfs.readFile(self.path)).length);
 }
 if(owner==='System.Text.Encoding'||owner==='System.Text.UTF8Encoding'){
  if(name==='get_UTF8'||name==='get_Unicode'||name==='get_ASCII'){const obj=p.newObject(p.hostType('System.Text.Encoding'));obj.encoding=name.slice(4);return obj;}
  if(name==='.ctor'){self.encoding='UTF8';return;}
  if(name==='GetBytes'&&args.length===1){const text=str(p,args[0]);if(self.encoding==='Unicode'){const out=new Uint8Array(text.length*2);for(let i=0;i<text.length;i++){out[2*i]=text.charCodeAt(i)&255;out[2*i+1]=text.charCodeAt(i)>>8;}return bytes(p,out);}if(self.encoding==='ASCII')return bytes(p,Uint8Array.from(Array.from(text,c=>c.charCodeAt(0)>127?63:c.charCodeAt(0))));return bytes(p,encoder.encode(text));}
  if(name==='GetString'&&args.length===1){const data=Uint8Array.from(p.nonNull(args[0]).items.map(number));return p.text(new TextDecoder(self.encoding==='Unicode'?'utf-16le':self.encoding==='ASCII'?'utf-8':'utf-8').decode(data));}
 }
 if(owner==='System.Environment'){
  if(name==='get_NewLine')return '\r\n';if(name==='get_ExitCode')return p.exitCode|0;if(name==='set_ExitCode'){p.exitCode=i32(args[0]);return;}
  if(name==='Exit'){p.exit(i32(args[0]));return;}if(name==='get_TickCount')return (performance.now()-p.started)|0;if(name==='get_ProcessorCount')return 1;
  if(name==='GetCommandLineArgs')return p.array({name:'System.String'},[p.exePath.replaceAll('/','\\'),...p.argv]);
  if(name==='get_CurrentDirectory')return p.vfs.cwd.replaceAll('/','\\');
 }
 if(owner==='System.Threading.Thread'&&name==='Sleep'&&args.length===1&&param(0)==='System.Int32'){
  const duration=i32(args[0]);if(duration< -1)p.throwException('System.ArgumentOutOfRangeException','Invalid timeout.');const until=duration===-1?Infinity:performance.now()+duration;return {wait:()=>performance.now()>=until?0:undefined,reason:'Thread.Sleep('+duration+')'};
 }
 if(owner==='System.Threading.Interlocked'){
  if(name==='CompareExchange'&&args.length===3){const ref=requireRef(args[0]),old=ref.get();if(raw(old)===raw(args[2]))ref.set(args[1]);return old;}
  if(name==='Exchange'&&args.length===2){const ref=requireRef(args[0]),old=ref.get();ref.set(args[1]);return old;}
  if((name==='Increment'||name==='Decrement')&&args.length===1){const r=requireRef(args[0]),v=r.get(),next=typeof v==='bigint'?BigInt.asIntN(64,v+BigInt(name==='Increment'?1:-1)):(i32(v)+(name==='Increment'?1:-1))|0;r.set(next);return next;}
 }
 if(owner==='System.GC'&&name==='KeepAlive')return;
 if(owner==='System.Type'){
  if(name==='GetTypeFromHandle')return managedType(p,args[0].type);
  if(name==='get_FullName')return self.reflectedType.name;if(name==='get_Name')return self.reflectedType.name.split('.').at(-1);if(name==='get_IsValueType')return p.isValueType(self.reflectedType)?1:0;
  if(name==='op_Equality')return args[0]?.reflectedType===args[1]?.reflectedType?1:0;
 }
 if(owner==='Microsoft.VisualBasic.CompilerServices.Conversions'){
  if(name==='ToString')return p.text(valueText(args[0],param(0)));if(name==='ToInteger')return typeof args[0]==='string'?parseNumber(p,args[0],'System.Int32'):i32(args[0]);if(name==='ToDouble')return typeof args[0]==='string'?parseNumber(p,args[0],'System.Double'):new Real(number(args[0]));
 }
 if(owner==='Microsoft.VisualBasic.CompilerServices.ProjectData'){
  if(name==='SetProjectError'){p.vbError=args[0];return;}if(name==='ClearProjectError'){p.vbError=null;return;}
 }
 if(owner==='Microsoft.VisualBasic.CompilerServices.Operators'){
  if(name==='CompareString'){const a=args[0]||'',b=args[1]||'';requireThat(!raw(args[2]),'CLR_UNSUPPORTED_API','VB culture-dependent text comparison is not implemented.');return a===b?0:a<b?-1:1;}
  if(name==='ConcatenateObject')return p.text(valueText(args[0])+valueText(args[1]));
 }
 if(owner==='System.IDisposable'&&name==='Dispose'){if(self?.dispose){self.dispose();return;}return p.forms.invoke(m,all);}
 return NOT_HANDLED;
}
