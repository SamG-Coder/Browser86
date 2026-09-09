// Typed evaluation-stack values and managed exceptions. MIT — samgcoder.
import {RuntimeFault,requireThat} from '../errors.js';
export class FloatValue {constructor(value){this.value=Number(value);}}
export const floating=x=>x instanceof FloatValue;
export const number=x=>floating(x)?x.value:typeof x==='bigint'?Number(x):Number(x);
export const unref=x=>x?.tag==='ref'?x.get():x;
export const ref=(get,set,type)=>({tag:'ref',get,set,type});
export const clone=x=>x?.valueType?{...x,fields:new Map([...x.fields||[]].map(([k,v])=>[k,clone(v)])),props:x.props?{...x.props}:undefined}:x;
export function truth(x){x=unref(x);return x!==null&&x!==undefined&&x!==0&&x!==0n&&(!floating(x)||x.value!==0);}
export function text(x){x=unref(x);if(x===null||x===undefined)return '';if(x?.tag==='box')return x.type?.fullName==='System.Boolean'?(truth(x.value)?'True':'False'):x.type?.fullName==='System.Char'?String.fromCharCode(number(x.value)):text(x.value);if(floating(x))return String(x.value);if(x?.exception)return x.type.fullName+': '+x.message;if(x?.tag==='array')return x.type?.fullName||'System.Array';if(typeof x==='object')return x.type?.fullName||'System.Object';return String(x);}
export function managedError(type,message){return {tag:'object',exception:true,type:{fullName:type.startsWith('System.')?type:'System.'+type},message,fields:new Map()};}
export class ManagedException extends Error {constructor(value){super(value?.message||text(value));this.value=value||managedError('NullReferenceException','Object reference not set to an instance of an object.');}}
export function raise(type,message){throw new ManagedException(managedError(type,message));}
export function nonnull(x){x=unref(x);if(x===null||x===undefined)raise('NullReferenceException','Object reference not set to an instance of an object.');return x;}
export function arrayIndex(array,index){array=nonnull(array);requireThat(array.tag==='array','CLR_TYPE','Array instruction requires a managed array.');const n=number(index);if(!Number.isInteger(n)||n<0||n>=array.values.length)raise('IndexOutOfRangeException','Index was outside the bounds of the array.');return n;}
export function convert(value,kind,{checked=false,unsigned=false}={}){
  let v=unref(value);if(v?.tag==='box')v=v.value;
  if(kind==='r4'||kind==='r8')return new FloatValue(kind==='r4'?Math.fround(unsigned&&!floating(v)?Number(typeof v==='bigint'?BigInt.asUintN(64,v):v>>>0):number(v)):unsigned&&!floating(v)?Number(typeof v==='bigint'?BigInt.asUintN(64,v):v>>>0):number(v));
  const bits=kind==='i8'||kind==='u8'?64:kind==='i1'||kind==='u1'?8:kind==='i2'||kind==='u2'?16:32,signed=kind[0]==='i';
  let wide;
  if(typeof v==='bigint')wide=unsigned?BigInt.asUintN(64,v):v;
  else {let n=number(v);if(unsigned&&!floating(v))n=n>>>0;if(!Number.isFinite(n)){if(checked)raise('OverflowException','Value was either too large or too small.');n=0;}wide=BigInt(Math.trunc(n));}
  const low=signed?-(1n<<BigInt(bits-1)):0n,high=(1n<<BigInt(signed?bits-1:bits))-1n;
  if(checked&&(wide<low||wide>high))raise('OverflowException','Arithmetic operation resulted in an overflow.');
  const out=signed?BigInt.asIntN(bits,wide):BigInt.asUintN(bits,wide);return bits===64?BigInt.asIntN(64,out):bits===32?Number(BigInt.asIntN(32,out)):Number(out);
}
export function binary(op,a,b,{unsigned=false,checked=false}={}){
  if(floating(a)||floating(b)){
    const x=number(a),y=number(b);switch(op){case 'add':return new FloatValue(x+y);case 'sub':return new FloatValue(x-y);case 'mul':return new FloatValue(x*y);case 'div':return new FloatValue(x/y);case 'rem':return new FloatValue(x%y);default:throw new RuntimeFault('CLR_TYPE','Bitwise operations require integer values.');}
  }
  const bits=typeof a==='bigint'?64:32;requireThat(typeof a==='number'||typeof a==='bigint','CLR_TYPE','Arithmetic requires numeric operands.');
  const shift=['shl','shr'].includes(op);requireThat(shift||typeof a===typeof b,'CLR_TYPE','Arithmetic operand categories differ.');
  let x=BigInt(a),y=BigInt(b);if(unsigned){x=BigInt.asUintN(bits,x);if(!shift)y=BigInt.asUintN(bits,y);}
  let result;
  switch(op){case 'add':result=x+y;break;case 'sub':result=x-y;break;case 'mul':result=x*y;break;
    case 'div':case 'rem':if(y===0n)raise('DivideByZeroException','Attempted to divide by zero.');if(!unsigned&&op==='div'&&x===-(1n<<BigInt(bits-1))&&y===-1n)raise('OverflowException','Arithmetic operation resulted in an overflow.');result=op==='div'?x/y:x%y;break;
    case 'and':result=x&y;break;case 'or':result=x|y;break;case 'xor':result=x^y;break;case 'shl':result=x<<(y&BigInt(bits-1));break;case 'shr':result=x>>(y&BigInt(bits-1));break;default:throw new RuntimeFault('CLR_OPCODE','Unknown arithmetic operation.');}
  if(checked){const low=unsigned?0n:-(1n<<BigInt(bits-1)),high=(1n<<BigInt(unsigned?bits:bits-1))-1n;if(result<low||result>high)raise('OverflowException','Arithmetic operation resulted in an overflow.');}
  result=BigInt.asIntN(bits,result);return bits===64?result:Number(result);
}
export function compare(op,a,b,unsigned=false){
  a=unref(a);b=unref(b);if(floating(a)||floating(b)){a=number(a);b=number(b);if(Number.isNaN(a)||Number.isNaN(b))return op==='ne'||(unsigned&&op!=='eq');}
  else if(unsigned&&typeof a==='number'&&typeof b==='number'){a>>>=0;b>>>=0;}
  else if(unsigned&&typeof a==='bigint'&&typeof b==='bigint'){a=BigInt.asUintN(64,a);b=BigInt.asUintN(64,b);}
  switch(op){case 'eq':return a===b;case 'ne':return a!==b;case 'gt':return a>b;case 'ge':return a>=b;case 'lt':return a<b;case 'le':return a<=b;}
}
