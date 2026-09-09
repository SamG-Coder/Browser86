// Explicit, bounded Framework compatibility methods. Not Microsoft's framework DLLs.
import {RuntimeFault,requireThat} from '../errors.js';
import {FloatValue,floating,number,unref,ref,clone,truth,text,managedError,raise,nonnull,convert,arrayIndex} from './values.js';
import {ManagedForms} from './forms.js';
const utf8=new TextEncoder(),decode=new TextDecoder();
const nothing=Symbol('not implemented');
const primitiveNames=new Set(['System.Boolean','System.Char','System.SByte','System.Byte','System.Int16','System.UInt16','System.Int32','System.UInt32','System.Int64','System.UInt64','System.Single','System.Double','System.IntPtr','System.UIntPtr']);
const numKind={'System.SByte':'i1','System.Byte':'u1','System.Int16':'i2','System.UInt16':'u2','System.Int32':'i4','System.UInt32':'u4','System.Int64':'i8','System.UInt64':'u8','System.IntPtr':'i4','System.UIntPtr':'u4'};
function bounds(start,count,length){if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<0||start+count>length)raise('ArgumentOutOfRangeException','Index and count must refer to a location within the collection.');}
export class FrameworkLibrary {
  constructor(vm){this.vm=vm;this.p=vm.p;this.forms=new ManagedForms(vm);this.emptyEvent={tag:'object',type:{fullName:'System.EventArgs'},fields:new Map()};}
  boundedString(value){requireThat(value.length<=1048576,'CLR_STRING_LIMIT','String exceeds the one-million-character limit.');this.vm.allocate(value.length*2+24);return value;}
  formatValue(value,format=''){value=unref(value);if(!format)return text(value);if(value?.tag==='box')value=value.value;const n=number(value),m=/^([dDxXfFnNgG])([0-9]{0,2})$/.exec(format);if(!m)raise('FormatException','Unsupported format specifier: '+format);const precision=m[2]?Number(m[2]):undefined;switch(m[1].toLowerCase()){
    case 'd':return (n<0?'-':'')+(typeof value==='bigint'?(value<0n?-value:value).toString():String(Math.abs(Math.trunc(n)))).padStart(precision||1,'0');
    case 'x':{let out=(typeof value==='bigint'?BigInt.asUintN(64,value):n>>>0).toString(16).padStart(precision||1,'0');return m[1]==='X'?out.toUpperCase():out;}
    case 'f':return n.toFixed(precision??2);case 'n':return n.toLocaleString('en-US',{minimumFractionDigits:precision??2,maximumFractionDigits:precision??2});case 'g':return precision?n.toPrecision(precision):text(value);
  }}
  format(pattern,values){let i=0,out='';while(i<pattern.length){if(pattern[i]==='{'&&pattern[i+1]==='{'){out+='{';i+=2;continue;}if(pattern[i]==='}'&&pattern[i+1]==='}'){out+='}';i+=2;continue;}if(pattern[i]==='{'){const end=pattern.indexOf('}',i+1);if(end<0)raise('FormatException','Unclosed format item.');const m=/^(\d+)(?:,\s*(-?\d+))?(?::([^{}]*))?$/.exec(pattern.slice(i+1,end));if(!m||Number(m[1])>=values.length)raise('FormatException','Invalid composite format item.');let s=this.formatValue(values[Number(m[1])],m[3]||'');if(m[2]){const width=Number(m[2]);if(Math.abs(width)>100000)raise('FormatException','Format width too large.');s=width<0?s.padEnd(-width):s.padStart(width);}out+=s;i=end+1;}else{if(pattern[i]==='}')raise('FormatException','Unexpected closing brace.');out+=pattern[i++];}requireThat(out.length<=1048576,'CLR_STRING_LIMIT','Formatted string exceeds the limit.');}return this.boundedString(out);}
  paramText(value,type){if(type.fullName==='System.UInt32'||type.fullName==='System.UIntPtr')return String(number(value)>>>0);if(type.fullName==='System.UInt64')return BigInt.asUintN(64,value).toString();if(type.fullName==='System.Char')return String.fromCharCode(number(value));if(type.fullName==='System.Boolean')return truth(value)?'True':'False';return text(value);}
  staticField(field){const t=field.type.fullName,n=field.name;if(t==='System.String'&&n==='Empty')return '';if(t==='System.EventArgs'&&n==='Empty')return this.emptyEvent;if((t==='System.IntPtr'||t==='System.UIntPtr')&&n==='Zero')return 0;if(t==='System.Reflection.Missing'&&n==='Value')return {tag:'missing'};return undefined;}
  io(action){try{return action();}catch(e){if(e.code?.startsWith('VFS_')){const type=e.code==='VFS_NOT_FOUND'?'IO.FileNotFoundException':e.code==='VFS_PATH'?'ArgumentException':'IO.IOException';raise(type,e.message);}throw e;}}
  invoke(method,args){
    const t=method.type.fullName,n=method.name,sig=method.signature,instance=sig.hasThis?nonnull(args[0]):null,a=sig.hasThis?args.slice(1):args;
    if(t.startsWith('System.Windows.Forms.')||t.startsWith('System.Drawing.')||instance?.host?.startsWith('forms:')||instance?.host?.startsWith('drawing:')){const result=this.forms.invoke(method,instance,a);if(result!==nothing&&result!==ManagedForms.NOT_HANDLED)return result;}
    if(n==='.ctor'&&(t==='System.Object'||t==='System.ValueType'||t==='System.EventArgs')&&a.length===0)return;
    if(n==='.ctor'&&(/Exception$/.test(t))){instance.exception=true;instance.message=a.length?text(a[0]):t;instance.inner=a[1]||null;return;}
    if(instance?.exception){if(n==='get_Message')return instance.message;if(n==='get_InnerException')return instance.inner||null;if(n==='ToString')return text(instance);}
    if((t==='System.EventHandler'||/EventHandler$/.test(t)||t==='System.Action'||/^System.Action`/.test(t)||/^System.Func`/.test(t))&&n==='.ctor'&&a.length===2){requireThat(a[1]?.tag==='function','CLR_DELEGATE','Delegate constructor requires an ldftn target.');instance.host='delegate';instance.target=a[0];instance.method=a[1].method;instance.invocations=[instance];return;}
    if(t==='System.Delegate'||t==='System.MulticastDelegate'){
      if(n==='Combine'&&a.length===2){if(!a[0])return a[1];if(!a[1])return a[0];return {host:'delegate',type:a[0].type,invocations:[...(a[0].invocations||[a[0]]),...(a[1].invocations||[a[1]])]};}
      if(n==='Remove'&&a.length===2){if(!a[0]||!a[1])return a[0];const list=[...(a[0].invocations||[a[0]])],other=a[1].invocations||[a[1]];for(let i=list.length-other.length;i>=0;i--)if(other.every((v,j)=>v.method?.token===list[i+j].method?.token&&v.method?.asm===list[i+j].method?.asm&&v.target===list[i+j].target)){list.splice(i,other.length);break;}return list.length?{...a[0],invocations:list}:null;}
    }
    if(t==='System.Console'){
      if(n==='Write'||n==='WriteLine'){const values=a.length>1?(a[1]?.tag==='array'?a[1].values:a.slice(1)):[];const message=a.length>1?this.format(text(a[0]),values):a.length?this.paramText(a[0],sig.params[0]):'';this.p.emit('stdout',{stream:'stdout',text:message+(n==='WriteLine'?'\r\n':'')});return;}
      if(n==='ReadLine'){const read=()=>{const end=this.p.input.indexOf(10);if(end<0)return undefined;const bytes=this.p.input.splice(0,end+1);if(bytes.at(-1)===10)bytes.pop();if(bytes.at(-1)===13)bytes.pop();return new TextDecoder('windows-1252').decode(Uint8Array.from(bytes));};const value=read();return value===undefined?{wait:read,reason:'Managed console input'}:value;}
      if(n==='get_Title')return this.p.exePath.split('/').at(-1);if(n==='set_Title'){this.p.emit('title',{text:text(a[0])});return;}
    }
    if(t==='System.String'){
      const s=instance===null?null:text(instance);
      if(n==='Concat'){const vals=a.length===1&&a[0]?.tag==='array'?a[0].values:a;return this.boundedString(vals.map(text).join(''));}
      if(n==='Format'&&a.length>=2&&typeof a[0]==='string')return this.format(a[0],a[1]?.tag==='array'?a[1].values:a.slice(1));
      if(n==='IsNullOrEmpty')return a[0]===null||a[0]==='';if(n==='IsNullOrWhiteSpace')return a[0]===null||/^\s*$/.test(a[0]);
      if(n==='op_Equality'||n==='Equals')return sig.hasThis?s===a[0]:a[0]===a[1];if(n==='op_Inequality')return a[0]!==a[1];
      if(n==='get_Length')return s.length;if(n==='get_Chars'){bounds(number(a[0]),1,s.length);return s.charCodeAt(number(a[0]));}
      if(n==='ToString'&&a.length===0)return s;
      if(n==='Substring'){const start=number(a[0]),length=a.length>1?number(a[1]):s.length-start;bounds(start,length,s.length);return s.slice(start,start+length);}
      if(n==='Trim'&&a.length===0)return s.trim();if(n==='TrimStart'&&a.length===0)return s.trimStart();if(n==='TrimEnd'&&a.length===0)return s.trimEnd();
      if((n==='ToUpperInvariant'||n==='ToLowerInvariant')&&a.length===0)return this.boundedString(n==='ToUpperInvariant'?s.toUpperCase():s.toLowerCase());
      if(n==='Contains'&&a.length===1)return s.includes(text(nonnull(a[0])));if(n==='StartsWith'&&a.length===1)return s.startsWith(text(nonnull(a[0])));if(n==='EndsWith'&&a.length===1)return s.endsWith(text(nonnull(a[0])));
      if((n==='IndexOf'||n==='LastIndexOf')&&(a.length===1||a.length===2)){const value=sig.params[0].fullName==='System.Char'?String.fromCharCode(number(a[0])):text(nonnull(a[0]));return n==='IndexOf'?s.indexOf(value,a.length>1?number(a[1]):0):s.lastIndexOf(value,a.length>1?number(a[1]):undefined);}
      if(n==='Replace'&&a.length===2){const old=sig.params[0].fullName==='System.Char'?String.fromCharCode(number(a[0])):text(nonnull(a[0])),value=sig.params[1].fullName==='System.Char'?String.fromCharCode(number(a[1])):text(a[1]);if(!old.length)raise('ArgumentException','Old value cannot be empty.');return this.boundedString(s.split(old).join(value));}
      if(n==='ToCharArray'&&a.length===0)return this.vm.array({fullName:'System.Char'},Array.from({length:s.length},(_,i)=>s.charCodeAt(i)));
      if(n==='Join'&&a.length===2&&a[1]?.tag==='array')return this.boundedString(a[1].values.map(text).join(text(a[0])));
      if(n==='Split'&&a.length===1&&a[0]?.tag==='array'){const separators=a[0].values.map(x=>String.fromCharCode(number(x)));let pieces=[s];for(const sep of separators)pieces=pieces.flatMap(v=>v.split(sep));return this.vm.array({fullName:'System.String'},pieces);}
    }
    if(primitiveNames.has(t)){
      const value=instance?.tag==='box'?instance.value:instance;
      if(n==='ToString'){if(t==='System.Char')return String.fromCharCode(number(value));if(t==='System.Boolean')return truth(value)?'True':'False';return this.formatValue(t==='System.UInt32'||t==='System.UIntPtr'?number(value)>>>0:t==='System.UInt64'?BigInt.asUintN(64,value):value,a[0]||'');}
      if(n==='Equals'&&a.length===1)return number(value)===number(a[0]?.tag==='box'?a[0].value:a[0]);
      if(n==='CompareTo'&&a.length===1)return number(value)<number(a[0])?-1:number(value)>number(a[0])?1:0;
      if((n==='Parse'&&a.length===1)||(n==='TryParse'&&a.length===2)){
        const s=a[0]===null?'':text(a[0]).trim(),isInt=!!numKind[t];let valid=isInt?/^[+-]?\d+$/.test(s):/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s),parsed;
        try{if(!valid)raise('FormatException','Input string was not in a correct format.');parsed=isInt?convert(BigInt(s),numKind[t],{checked:true}):new FloatValue(Number(s));}
        catch(e){if(n==='Parse')throw e;valid=false;parsed=isInt&&numKind[t].endsWith('8')?0n:0;}
        if(n==='TryParse'){requireThat(a[1]?.tag==='ref','CLR_TYPE','TryParse requires an output reference.');a[1].set(parsed);return valid;}return parsed;
      }
      if(n==='get_Size'&&(t==='System.IntPtr'||t==='System.UIntPtr'))return 4;
    }
    if(t==='System.Convert'&&a.length===1){
      if(n==='ToString')return text(a[0]);if(n==='ToBoolean')return typeof a[0]==='string'?a[0].toLowerCase()==='true':truth(a[0]);
      const targets={ToInt16:'i2',ToUInt16:'u2',ToInt32:'i4',ToUInt32:'u4',ToInt64:'i8',ToUInt64:'u8',ToByte:'u1',ToSByte:'i1'};
      if(targets[n]){let value=unref(a[0]);if(value?.tag==='box')value=value.value;if(value===null)value=0;if(typeof value==='string'){if(!/^[+-]?\d+$/.test(value.trim()))raise('FormatException','Input string was not in a correct format.');value=BigInt(value.trim());}else if(floating(value)){const v=value.value,base=Math.floor(v),frac=v-base;value=frac===0.5?(base%2?base+1:base):Math.round(v);}return convert(value,targets[n],{checked:true});}
      if(n==='ToDouble'||n==='ToSingle')return new FloatValue(number(a[0]?.tag==='box'?a[0].value:a[0]));
    }
    if(t==='System.Math'){
      const arity={Abs:1,Sqrt:1,Sin:1,Cos:1,Tan:1,Asin:1,Acos:1,Atan:1,Atan2:2,Ceiling:1,Floor:1,Truncate:1,Exp:1,Log10:1,Pow:2,Min:2,Max:2,Sign:1};
      const fn={Abs:Math.abs,Sqrt:Math.sqrt,Sin:Math.sin,Cos:Math.cos,Tan:Math.tan,Asin:Math.asin,Acos:Math.acos,Atan:Math.atan,Atan2:Math.atan2,Ceiling:Math.ceil,Floor:Math.floor,Truncate:Math.trunc,Exp:Math.exp,Log10:Math.log10,Pow:Math.pow,Min:Math.min,Max:Math.max,Sign:Math.sign}[n];
      if(fn&&a.length===arity[n]){if(n==='Abs'&&!floating(a[0])&&(a[0]===-2147483648||a[0]===-9223372036854775808n))raise('OverflowException','Negating the minimum integer is not representable.');if(typeof a[0]==='bigint'){if(n==='Abs')return a[0]<0n?-a[0]:a[0];if(n==='Min')return a[0]<a[1]?a[0]:a[1];if(n==='Max')return a[0]>a[1]?a[0]:a[1];}return fn(...a.map(number));}
    }
    if(t==='System.Text.StringBuilder'){
      if(n==='.ctor'&&(a.length===0||a.length===1)){instance.host='builder';instance.value=typeof a[0]==='string'?a[0]:'';return;}
      if(n==='Append'&&a.length===1){instance.value=this.boundedString(instance.value+this.paramText(a[0],sig.params[0]));return instance;}
      if(n==='AppendLine'&&a.length<=1){instance.value=this.boundedString(instance.value+text(a[0])+'\r\n');return instance;}
      if(n==='ToString'&&a.length===0)return instance.value;if(n==='get_Length')return instance.value.length;if(n==='Clear'){instance.value='';return instance;}
      if(n==='AppendFormat'&&a.length>=2){instance.value=this.boundedString(instance.value+this.format(text(a[0]),a[1]?.tag==='array'?a[1].values:a.slice(1)));return instance;}
    }
    if(t.startsWith('System.Collections.Generic.List`')||t==='System.Collections.ArrayList'){
      if(n==='.ctor'&&a.length===0){instance.host='list';instance.items=[];return;}
      if(n==='Add'&&a.length===1){this.vm.allocate(16);instance.items.push(clone(a[0]));return instance.items.length-1;}
      if(n==='get_Count')return instance.items.length;if(n==='get_Item'){bounds(number(a[0]),1,instance.items.length);return clone(instance.items[number(a[0])]);}
      if(n==='set_Item'){bounds(number(a[0]),1,instance.items.length);instance.items[number(a[0])]=clone(a[1]);return;}
      if(n==='Clear'){instance.items.length=0;return;}if(n==='Contains')return instance.items.includes(a[0]);if(n==='IndexOf')return instance.items.indexOf(a[0]);
      if(n==='Remove'){const i=instance.items.indexOf(a[0]);if(i<0)return false;instance.items.splice(i,1);return true;}
      if(n==='RemoveAt'){bounds(number(a[0]),1,instance.items.length);instance.items.splice(number(a[0]),1);return;}
      if(n==='ToArray')return this.vm.array(method.type.typeArgs?.[0]||{fullName:'System.Object'},instance.items);
      if(n==='GetEnumerator')return {tag:'object',host:'enumerator',type:{fullName:'System.Collections.Generic.List`1+Enumerator'},items:instance.items,index:-1};
    }
    if(t.startsWith('System.Collections.Generic.Dictionary`')){
      if(n==='.ctor'&&a.length===0){instance.host='dictionary';instance.items=new Map();return;}
      if(n==='Add'||n==='set_Item'){if(a[0]===null)raise('ArgumentNullException','Key cannot be null.');if(n==='Add'&&instance.items.has(a[0]))raise('ArgumentException','An item with the same key has already been added.');this.vm.allocate(32);instance.items.set(a[0],clone(a[1]));return;}
      if(n==='get_Count')return instance.items.size;if(n==='ContainsKey')return instance.items.has(a[0]);
      if(n==='get_Item'){if(!instance.items.has(a[0]))raise('Collections.Generic.KeyNotFoundException','The given key was not present in the dictionary.');return clone(instance.items.get(a[0]));}
      if(n==='TryGetValue'){const yes=instance.items.has(a[0]);a[1].set(yes?clone(instance.items.get(a[0])):0);return yes;}
      if(n==='Remove')return instance.items.delete(a[0]);if(n==='Clear'){instance.items.clear();return;}
    }
    if(instance?.host==='enumerator'){
      if(n==='MoveNext'){instance.index++;return instance.index<instance.items.length;}if(n==='get_Current'){bounds(instance.index,1,instance.items.length);return clone(instance.items[instance.index]);}if(n==='Dispose')return;
    }
    if(t==='System.Array'||instance?.tag==='array'){
      if(n==='get_Length')return instance.values.length;if(n==='get_Rank')return 1;
      if(n==='GetLength'&&a[0]===0)return instance.values.length;
      if(n==='GetValue')return clone(instance.values[arrayIndex(instance,a[0])]);
      if(n==='SetValue'){instance.values[arrayIndex(instance,a[1])]=clone(a[0]);return;}
      if(n==='Clear'&&a.length===3){const arr=nonnull(a[0]),start=number(a[1]),count=number(a[2]);bounds(start,count,arr.values.length);for(let i=start;i<start+count;i++)arr.values[i]=this.vm.defaultValue(arr.element);return;}
      if(n==='Copy'&&(a.length===3||a.length===5)){const src=nonnull(a[0]),dest=nonnull(a.length===3?a[1]:a[2]),start=a.length===3?0:number(a[1]),to=a.length===3?0:number(a[3]),count=number(a.at(-1));bounds(start,count,src.values.length);bounds(to,count,dest.values.length);const copy=src.values.slice(start,start+count).map(clone);for(let i=0;i<count;i++)dest.values[to+i]=copy[i];return;}
    }
    if(t==='System.IO.File'){
      if(n==='Exists')return a[0]!==null&&!!this.p.vfs.get(text(a[0]))&&!this.p.vfs.get(text(a[0])).directory;
      if(n==='ReadAllText'&&a.length===1)return this.io(()=>decode.decode(this.p.vfs.readFile(text(nonnull(a[0])))));
      if((n==='WriteAllText'||n==='AppendAllText')&&a.length===2)return this.io(()=>{const path=text(nonnull(a[0])),old=n==='AppendAllText'&&this.p.vfs.exists(path)?decode.decode(this.p.vfs.readFile(path)):'';this.p.vfs.writeFile(path,utf8.encode(this.boundedString(old+text(a[1]))));});
      if(n==='ReadAllBytes'&&a.length===1)return this.io(()=>this.vm.array({fullName:'System.Byte'},Array.from(this.p.vfs.readFile(text(a[0])))));
      if(n==='WriteAllBytes'&&a.length===2)return this.io(()=>this.p.vfs.writeFile(text(a[0]),Uint8Array.from(nonnull(a[1]).values)));
      if(n==='Delete'&&a.length===1)return this.io(()=>{this.p.vfs.remove(text(a[0]));});
      if(n==='Copy'&&(a.length===2||a.length===3))return this.io(()=>{if(this.p.vfs.exists(text(a[1]))&&!truth(a[2]))raise('IO.IOException','Destination file exists.');this.p.vfs.writeFile(text(a[1]),this.p.vfs.readFile(text(a[0])).slice());});
      if(n==='Move'&&a.length===2)return this.io(()=>this.p.vfs.rename(text(a[0]),text(a[1])));
    }
    if(t==='System.IO.Directory'){
      if(n==='Exists')return !!this.p.vfs.get(text(a[0]))?.directory;
      if(n==='CreateDirectory')return this.io(()=>{this.p.vfs.mkdir(text(a[0]));return {tag:'object',host:'directoryInfo',type:{fullName:'System.IO.DirectoryInfo'},path:this.p.vfs.path(text(a[0]))};});
      if(n==='GetCurrentDirectory')return this.p.vfs.cwd.replaceAll('/','\\');
      if(n==='SetCurrentDirectory')return this.io(()=>{const node=this.p.vfs.get(text(a[0]));if(!node?.directory)raise('IO.DirectoryNotFoundException','Directory does not exist.');this.p.vfs.cwd=node.path;});
      if(n==='GetFiles'&&a.length===1)return this.io(()=>this.vm.array({fullName:'System.String'},this.p.vfs.list(text(a[0])).filter(x=>!x.directory).map(x=>x.path.replaceAll('/','\\'))));
    }
    if(t==='System.IO.Path'){
      const path=text(a[0]).replaceAll('\\','/');if(n==='GetFileName')return path.split('/').at(-1);if(n==='GetFileNameWithoutExtension'){const name=path.split('/').at(-1),i=name.lastIndexOf('.');return i<0?name:name.slice(0,i);}if(n==='GetExtension'){const name=path.split('/').at(-1),i=name.lastIndexOf('.');return i<0?'':name.slice(i);}if(n==='GetDirectoryName')return path.includes('/')?path.slice(0,path.lastIndexOf('/')).replaceAll('/','\\'):'';
      if(n==='GetFullPath')return this.p.vfs.path(path).replaceAll('/','\\');if(n==='Combine'){const parts=a.length===1&&a[0]?.tag==='array'?a[0].values:a;let out='';for(const part of parts){const s=text(nonnull(part)).replaceAll('\\','/');if(/^(?:[a-z]:|\/)/i.test(s))out=s;else out=out?out.replace(/\/$/,'')+'/'+s:s;}return out.replaceAll('/','\\');}if(n==='GetTempPath')return 'C:\\Temp\\';
    }
    if(t==='System.Environment'){
      if(n==='get_NewLine')return '\r\n';if(n==='get_TickCount')return (performance.now()-this.p.started)|0;if(n==='get_CurrentDirectory')return this.p.vfs.cwd.replaceAll('/','\\');if(n==='GetCommandLineArgs')return this.vm.array({fullName:'System.String'},[this.p.exePath.replaceAll('/','\\'),...this.vm.args.values]);if(n==='get_CommandLine')return this.p.commandLine;
      if(n==='GetEnvironmentVariable')return this.p.environment.get(text(a[0]).toUpperCase())??null;
      if(n==='Exit'){this.p.exit(number(a[0]));return;}
    }
    if(t==='System.Diagnostics.Debug'||t==='System.Diagnostics.Trace'){if(n==='WriteLine'||n==='Write'){this.p.emit('log',{level:'debug',message:a.map(text).join(' ')});return;}}
    if(t==='Microsoft.VisualBasic.CompilerServices.Conversions'){if(n==='ToString'&&a.length===1)return text(a[0]);if(n==='ToInteger'&&a.length===1)return convert(typeof a[0]==='string'?BigInt(a[0]):a[0],'i4',{checked:true});}
    if(t==='Microsoft.VisualBasic.CompilerServices.ProjectData'){if(n==='SetProjectError'||n==='ClearProjectError')return;}
    if(t==='Microsoft.VisualBasic.CompilerServices.Operators'&&n==='CompareString'){const x=text(a[0]),y=text(a[1]),left=truth(a[2])?x.toLowerCase():x,right=truth(a[2])?y.toLowerCase():y;return left===right?0:left<right?-1:1;}
    if(t==='System.Type'&&n==='GetTypeFromHandle'){const h=a[0];requireThat(h?.tag==='handle','CLR_TYPE','Expected RuntimeTypeHandle.');return {tag:'object',type:{fullName:'System.RuntimeType'},reflected:h.asm.type(h.token)};}
    if(instance?.reflected){if(n==='get_FullName')return instance.reflected.fullName;if(n==='get_Name')return instance.reflected.name;if(n==='ToString')return instance.reflected.fullName;}
    if(t==='System.Object'||t==='System.ValueType'){
      if(n==='ToString'&&a.length===0)return text(instance);if(n==='ReferenceEquals'&&a.length===2)return a[0]===a[1];if(n==='Equals')return sig.hasThis?instance===a[0]:a[0]===a[1];if(n==='GetType'&&a.length===0)return {tag:'object',type:{fullName:'System.RuntimeType'},reflected:instance?.type||{fullName:typeof instance==='string'?'System.String':'System.Object'}};
    }
    throw new RuntimeFault('CLR_UNSUPPORTED_BCL',`Framework method is not implemented: ${t}::${n}(${sig.params.map(x=>x.fullName).join(', ')}).`,{assembly:method.type.assemblyName||method.type.asm?.assemblyName,type:t,method:n,signature:sig.params.map(x=>x.fullName),location:this.vm.lastInstruction});
  }
}
