// ECMA-335 evaluation-stack arithmetic. Integers are not implemented as lossy JS doubles.
import {Real,raw,i32,u32} from './values.js';
import {RuntimeFault,requireThat} from '../errors.js';
const over=p=>p.throwException('System.OverflowException','Arithmetic operation resulted in an overflow.');
const zero=p=>p.throwException('System.DivideByZeroException','Attempted to divide by zero.');
const intLike=v=>typeof v==='number'&&Number.isInteger(v)||typeof v==='bigint';
function ints(p,a,b,unsigned){requireThat(intLike(a)&&intLike(b),'CLR_INVALID_IL','Expected integer operands.');requireThat(typeof a===typeof b,'CLR_INVALID_IL','Mixed int32/int64 arithmetic.');if(typeof a==='bigint')return [unsigned?BigInt.asUintN(64,a):BigInt.asIntN(64,a),unsigned?BigInt.asUintN(64,b):BigInt.asIntN(64,b),64];return [BigInt(unsigned?u32(a):i32(a)),BigInt(unsigned?u32(b):i32(b)),32];}
export function arithmetic(p,op,a,b){
 if(a instanceof Real||b instanceof Real){requireThat(a instanceof Real&&b instanceof Real,'CLR_INVALID_IL','Mixed floating-point/integer arithmetic.');const x=a.value,y=b.value;switch(op){case 0x58:return new Real(x+y);case 0x59:return new Real(x-y);case 0x5a:return new Real(x*y);case 0x5b:return new Real(x/y);case 0x5d:return new Real(x%y);default:throw new RuntimeFault('CLR_INVALID_IL','Integer-only operation on floating point values.');}}
 if(op>=0x62&&op<=0x64){requireThat(intLike(a)&&typeof b==='number','CLR_INVALID_IL','Invalid shift operands.');if(typeof a==='bigint'){const n=BigInt(i32(b)&63);return BigInt.asIntN(64,op===0x62?a<<n:op===0x63?BigInt.asIntN(64,a)>>n:BigInt.asUintN(64,a)>>n);}return op===0x62?i32(a)<<i32(b):op===0x63?i32(a)>>i32(b):(u32(a)>>>i32(b))|0;}
 const unsigned=[0x5c,0x5e,0xd7,0xd9,0xdb].includes(op),[x,y,bits]=ints(p,a,b,unsigned);let v;
 switch(op){case 0x58:case 0xd6:case 0xd7:v=x+y;break;case 0x59:case 0xda:case 0xdb:v=x-y;break;case 0x5a:case 0xd8:case 0xd9:v=x*y;break;case 0x5b:case 0x5c:if(y===0n)zero(p);v=x/y;if(!unsigned&&x===-(1n<<BigInt(bits-1))&&y===-1n)over(p);break;case 0x5d:case 0x5e:if(y===0n)zero(p);v=x%y;break;case 0x5f:v=x&y;break;case 0x60:v=x|y;break;case 0x61:v=x^y;break;default:throw new RuntimeFault('CLR_OPCODE','Unsupported arithmetic opcode.');}
 if(op>=0xd6){const min=unsigned?0n:-(1n<<BigInt(bits-1)),max=unsigned?(1n<<BigInt(bits))-1n:(1n<<BigInt(bits-1))-1n;if(v<min||v>max)over(p);}
 v=BigInt.asIntN(bits,v);return bits===64?v:Number(v);
}
export function compare(op,a,b){
 const floating=a instanceof Real||b instanceof Real;a=raw(a);b=raw(b);if(op==='eq')return a===b||a==null&&b==null;
 const unsigned=op.endsWith('.un'),base=op.split('.')[0];
 if(typeof a==='number'&&Number.isNaN(a)||typeof b==='number'&&Number.isNaN(b))return unsigned;
 if(unsigned&&!floating){if(typeof a==='bigint'&&typeof b==='bigint'){a=BigInt.asUintN(64,a);b=BigInt.asUintN(64,b);}else if(typeof a==='number'&&typeof b==='number'&&Number.isInteger(a)&&Number.isInteger(b)){a=a>>>0;b=b>>>0;}else if((a===null||typeof a==='object'||typeof a==='string')&&(b===null||typeof b==='object'||typeof b==='string'))return base==='gt'?a!==b&&a!==null:base==='lt'?a===null&&b!==null:base==='ge'?a===b||a!==null:a===b||a===null;}
 return base==='gt'?a>b:base==='lt'?a<b:base==='ge'?a>=b:a<=b;
}
const conversions={0x67:[8,true],0x68:[16,true],0x69:[32,true],0x6a:[64,true],0x6d:[32,false],0x6e:[64,false],0xd1:[16,false],0xd2:[8,false],0xd3:[32,true],0xe0:[32,false],0x82:[8,true,true,true],0x83:[16,true,true,true],0x84:[32,true,true,true],0x85:[64,true,true,true],0x86:[8,false,true,true],0x87:[16,false,true,true],0x88:[32,false,true,true],0x89:[64,false,true,true],0x8a:[32,true,true,true],0x8b:[32,false,true,true],0xb3:[8,true,true],0xb4:[8,false,true],0xb5:[16,true,true],0xb6:[16,false,true],0xb7:[32,true,true],0xb8:[32,false,true],0xb9:[64,true,true],0xba:[64,false,true],0xd4:[32,true,true],0xd5:[32,false,true]};
export function convert(p,op,value){
 if(op===0x6b||op===0x6c||op===0x76){let n=raw(value);if(op===0x76)n=typeof n==='bigint'?BigInt.asUintN(64,n):u32(n);n=Number(n);return new Real(op===0x6b?Math.fround(n):n);}
 const spec=conversions[op];requireThat(spec,'CLR_OPCODE','Unsupported conversion opcode.');const [bits,signed,checked,unsignedSource]=spec;let v=raw(value);
 requireThat(typeof v==='bigint'||typeof v==='number','CLR_INVALID_IL','Numeric conversion on a nonnumeric value.');
 if(value instanceof Real){if(!Number.isFinite(v)){if(checked)over(p);v=0;}v=BigInt(Math.trunc(v));}
 else if(typeof v==='bigint')v=unsignedSource?BigInt.asUintN(64,v):BigInt.asIntN(64,v);
 else v=BigInt(unsignedSource||op===0x6e?u32(v):i32(v));
 if(checked){const min=signed?-(1n<<BigInt(bits-1)):0n,max=signed?(1n<<BigInt(bits-1))-1n:(1n<<BigInt(bits))-1n;if(v<min||v>max)over(p);}
 v=signed?BigInt.asIntN(bits,v):BigInt.asUintN(bits,v);return bits===64?BigInt.asIntN(64,v):bits===32?Number(BigInt.asIntN(32,v)):Number(v);
}
export function coerce(p,value,name){
 switch(name){case 'System.Boolean':return raw(value)?1:0;case 'System.SByte':return (i32(value)<<24)>>24;case 'System.Byte':return u32(value)&255;case 'System.Int16':return (i32(value)<<16)>>16;case 'System.Char':case 'System.UInt16':return u32(value)&65535;case 'System.Int32':case 'System.UInt32':case 'System.IntPtr':case 'System.UIntPtr':return i32(value);case 'System.Int64':case 'System.UInt64':return typeof raw(value)==='bigint'?BigInt.asIntN(64,raw(value)):BigInt(i32(value));case 'System.Single':return new Real(Math.fround(Number(raw(value))));case 'System.Double':return new Real(Number(raw(value)));default:return value;}
}
