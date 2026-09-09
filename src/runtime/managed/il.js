// CIL decoder records real instruction boundaries so branches cannot land in operands.
import {RuntimeFault,requireThat} from '../errors.js';
const operand=new Map();
for(const op of [0x0e,0x0f,0x10,0x11,0x12,0x13,0xfe12,0xfe19])operand.set(op,'u1');
for(const op of [0x1f,...Array.from({length:13},(_,i)=>0x2b+i),0xde])operand.set(op,'i1');
for(const op of [0xfe09,0xfe0a,0xfe0b,0xfe0c,0xfe0d,0xfe0e])operand.set(op,'u2');
for(const op of [0x20,...Array.from({length:13},(_,i)=>0x38+i),0xdd])operand.set(op,'i4');
for(const op of [0x27,0x28,0x29,0x6f,0x70,0x71,0x72,0x73,0x74,0x75,0x79,0x7b,0x7c,0x7d,0x7e,0x7f,0x80,0x81,0x8c,0x8d,0x8f,0xa3,0xa4,0xa5,0xc2,0xc6,0xd0,0xfe06,0xfe07,0xfe15,0xfe16,0xfe1c])operand.set(op,'u4');
operand.set(0x21,'i8');operand.set(0x22,'r4');operand.set(0x23,'r8');operand.set(0x45,'switch');
const valid=new Set([...Array.from({length:0x24},(_,i)=>i),...Array.from({length:0x54},(_,i)=>i+0x25),...Array.from({length:0x2e},(_,i)=>i+0x79),...Array.from({length:8},(_,i)=>i+0xb3),0xc2,0xc3,0xc6,...Array.from({length:0x11},(_,i)=>i+0xd0),...Array.from({length:8},(_,i)=>0xfe00+i),...Array.from({length:7},(_,i)=>0xfe09+i),...Array.from({length:14},(_,i)=>0xfe11+i)]);
export function decodeIL(body){
 if(body.instructions)return body.instructions;
 const d=body.view,code=body.code,map=new Map();let p=0;
 const check=n=>requireThat(p+n<=code.length,'CLR_INVALID_IL','Truncated CIL instruction.',{offset:p});
 const read=kind=>{const n=({u1:1,i1:1,u2:2,i4:4,u4:4,i8:8,r4:4,r8:8})[kind];check(n);const at=p;p+=n;return ({u1:()=>d.getUint8(at),i1:()=>d.getInt8(at),u2:()=>d.getUint16(at,true),i4:()=>d.getInt32(at,true),u4:()=>d.getUint32(at,true),i8:()=>d.getBigInt64(at,true),r4:()=>d.getFloat32(at,true),r8:()=>d.getFloat64(at,true)})[kind]();};
 while(p<code.length){const offset=p;let op=read('u1');if(op===0xfe)op=0xfe00|read('u1');requireThat(valid.has(op),'CLR_OPCODE','Unknown CIL opcode 0x'+op.toString(16),{offset});let value=null;const kind=operand.get(op);
  if(kind==='switch'){const count=read('u4');requireThat(count<=65536,'CLR_INVALID_IL','Oversized switch.');check(count*4);value=Array.from({length:count},()=>read('i4'));}
  else if(kind)value=read(kind);
  map.set(offset,{offset,op,operand:value,next:p});
 }
 for(const ins of map.values()){
  const branches=ins.op===0x45?ins.operand:(ins.op>=0x2b&&ins.op<=0x44||ins.op===0xdd||ins.op===0xde)?[ins.operand]:[];
  for(const delta of branches)requireThat(map.has(ins.next+delta),'CLR_INVALID_IL','Branch target is not an instruction boundary.',{offset:ins.offset,target:ins.next+delta});
 }
 for(const c of body.clauses){for(const at of [c.tryOffset,c.handlerOffset])requireThat(map.has(at),'CLR_INVALID_IL','Exception region is not on an instruction boundary.');for(const at of [c.tryOffset+c.tryLength,c.handlerOffset+c.handlerLength])requireThat(at===code.length||map.has(at),'CLR_INVALID_IL','Exception region ends inside an instruction.');}
 body.instructions=map;return map;
}
export function opcodeName(op){return ({0:'nop',0x28:'call',0x2a:'ret',0x6f:'callvirt',0x72:'ldstr',0x73:'newobj',0x7a:'throw',0xdc:'endfinally',0xdd:'leave',0xde:'leave.s',0xfe1a:'rethrow'})[op]||'IL_0x'+op.toString(16);}
