// Original IA-32 user-mode interpreter. Guest code is never evaluated as JS.
// Only explicitly implemented instructions execute; unsupported encodings fault.
import {RuntimeFault,hex} from './errors.js';
export const EAX=0,ECX=1,EDX=2,EBX=3,ESP=4,EBP=5,ESI=6,EDI=7;
export const CF=1,PF=4,AF=16,ZF=64,SF=128,TF=256,IF=512,DF=1024,OF=2048;
const PARITY=Uint8Array.from({length:256},(_,n)=>{let p=0;for(let i=0;i<8;i++)p^=(n>>>i)&1;return p?0:PF;});
const mask=w=>w===32?0xFFFFFFFF:w===16?0xFFFF:255;
const trunc=(v,w)=>w===32?v>>>0:v&mask(w);
const signed=(v,w)=>w===32?v|0:w===16?v<<16>>16:v<<24>>24;
const signbit=w=>w===32?0x80000000:1<<(w-1);
export class CPU {
  constructor(memory,bridge=null){this.m=memory;this.r=new Uint32Array(8);this.eip=0;this.flags=0x202;this.fs=0;this.gs=0;this.bridge=bridge;this.instructions=0;this.trace=new Uint32Array(128);this.traceAt=0;this.xmm=Array.from({length:8},()=>new Uint8Array(16));this.fpu=[];this.fpuControl=0x37F;this.fpuStatus=0;this.mxcsr=0x1F80;}
  get(i,w=32){return w===8?(i<4?this.r[i]&255:(this.r[i-4]>>>8)&255):w===16?this.r[i]&65535:this.r[i];}
  set(i,v,w=32){v=trunc(v,w);if(w===32)this.r[i]=v;else if(w===16)this.r[i]=(this.r[i]&0xFFFF0000)|v;else if(i<4)this.r[i]=(this.r[i]&0xFFFFFF00)|v;else this.r[i-4]=(this.r[i-4]&0xFFFF00FF)|(v<<8);}
  next8(){const a=this.eip;const b=this.m.page(a,'x').bytes[a&4095];this.eip=(a+1)>>>0;return b;}
  next16(){return this.next8()|(this.next8()<<8);}
  next32(){return (this.next16()|(this.next16()<<16))>>>0;}
  imm(w){return w===8?this.next8():w===16?this.next16():this.next32();}
  push(v,w=32){this.r[ESP]=(this.r[ESP]-(w>>>3))>>>0;this.write(this.r[ESP],v,w);}
  pop(w=32){const v=this.read(this.r[ESP],w);this.r[ESP]=(this.r[ESP]+(w>>>3))>>>0;return v;}
  read(a,w){return w===8?this.m.u8(a):w===16?this.m.u16(a):this.m.u32(a);}
  write(a,v,w){if(w===8)this.m.w8(a,v);else if(w===16)this.m.w16(a,v);else this.m.w32(a,v);}
  operand(w=32){const b=this.next8(),mod=b>>>6,reg=(b>>>3)&7,rm=b&7;let a=0;
    if(mod===3)return {reg,rm,isReg:true,get:()=>this.get(rm,w),set:v=>this.set(rm,v,w)};
    if(this.addr16){const bx=this.get(EBX,16),bp=this.get(EBP,16),si=this.get(ESI,16),di=this.get(EDI,16);const bases=[bx+si,bx+di,bp+si,bp+di,si,di,bp,bx];a=mod===0&&rm===6?this.next16():bases[rm];if(mod===1)a+=signed(this.next8(),8);else if(mod===2)a+=signed(this.next16(),16);a&=65535;}
    else {if(rm===4){const sib=this.next8(),scale=sib>>>6,index=(sib>>>3)&7,base=sib&7;a=index===4?0:Math.imul(this.r[index],1<<scale);a+=base===5&&mod===0?this.next32():this.r[base];}
      else a=rm===5&&mod===0?this.next32():this.r[rm];
      if(mod===1)a+=signed(this.next8(),8);else if(mod===2)a+=this.next32();a>>>=0;}
    const offset=a;a=(a+this.segment)>>>0;return {reg,rm,isReg:false,a,offset,get:()=>this.read(a,w),set:v=>this.write(a,v,w)};
  }
  szp(v,w){v=trunc(v,w);this.flags=(this.flags&~(SF|ZF|PF))|(v===0?ZF:0)|((v&signbit(w))?SF:0)|PARITY[v&255];return v;}
  alu(kind,a,b,w=32){a=trunc(a,w);b=trunc(b,w);let v,c=0,overflow=0,aux=0,carry=(this.flags&CF)?1:0;
    switch(kind){
      case 0:case 2:{const n=a+b+(kind===2?carry:0);v=trunc(n,w);c=n>mask(w)?CF:0;overflow=(~(a^b)&(a^v)&signbit(w))?OF:0;aux=(a^b^v)&AF;break;}
      case 3:case 5:case 7:{const n=a-b-(kind===3?carry:0);v=trunc(n,w);c=n<0?CF:0;overflow=((a^b)&(a^v)&signbit(w))?OF:0;aux=(a^b^v)&AF;break;}
      case 1:v=(a|b)>>>0;break;case 4:v=(a&b)>>>0;break;case 6:v=(a^b)>>>0;break;
      default:throw new RuntimeFault('CPU_INTERNAL','Unknown ALU operation.');
    }
    this.flags=(this.flags&~(CF|OF|AF))|c|overflow|aux;return this.szp(v,w);
  }
  inc(v,w,delta){const cf=this.flags&CF;const out=this.alu(delta>0?0:5,v,1,w);this.flags=(this.flags&~CF)|cf;return out;}
  condition(c){const f=this.flags;switch(c){case 0:return !!(f&OF);case 1:return !(f&OF);case 2:return !!(f&CF);case 3:return !(f&CF);case 4:return !!(f&ZF);case 5:return !(f&ZF);case 6:return !!(f&(CF|ZF));case 7:return !(f&(CF|ZF));case 8:return !!(f&SF);case 9:return !(f&SF);case 10:return !!(f&PF);case 11:return !(f&PF);case 12:return !!(f&SF)!==!!(f&OF);case 13:return !!(f&SF)===!!(f&OF);case 14:return !!(f&ZF)||(!!(f&SF)!==!!(f&OF));case 15:return !(f&ZF)&&(!!(f&SF)===!!(f&OF));}}
  shift(kind,v,count,w){v=trunc(v,w);count&=31;if(!count)return v;const original=v,s=signbit(w);let cf=this.flags&CF;
    if(kind<=3){count%=kind<2?w:w+1;if(!count)return v;for(let i=0;i<count;i++){if(kind===0){cf=(v&s)?1:0;v=trunc(v*2+cf,w);}else if(kind===1){cf=v&1;v=trunc((v>>>1)+(cf?s:0),w);}else if(kind===2){const next=(v&s)?1:0;v=trunc(v*2+cf,w);cf=next;}else{const next=v&1;v=trunc((v>>>1)+(cf?s:0),w);cf=next;}}
      this.flags=(this.flags&~CF)|cf;if(count===1){const ov=kind===0||kind===2?(!!(v&s)!==!!cf):(!!(v&s)!==!!(v&(s>>>1)));this.flags=(this.flags&~OF)|(ov?OF:0);}return v;}
    for(let i=0;i<count;i++){if(kind===4||kind===6){cf=(v&s)?1:0;v=trunc(v*2,w);}else if(kind===5){cf=v&1;v>>>=1;}else if(kind===7){cf=v&1;v=trunc(signed(v,w)>>1,w);}}
    this.flags=(this.flags&~CF)|cf;if(count===1){const ov=kind===4||kind===6?(!!(v&s)!==!!cf):kind===5?!!(original&s):false;this.flags=(this.flags&~OF)|(ov?OF:0);}return this.szp(v,w);
  }
  multiply(a,b,w,signedMode=true){const product=BigInt(signedMode?signed(a,w):a)*BigInt(signedMode?signed(b,w):b);const low=Number(BigInt.asUintN(w,product));const high=Number(BigInt.asUintN(w,product>>BigInt(w)));const overflow=signedMode?product!==BigInt.asIntN(w,product):high!==0;this.flags=(this.flags&~(CF|OF))|(overflow?CF|OF:0);return {low,high};}
  divide(divisor,w,signedMode){let dividend;
    if(w===8)dividend=BigInt(signedMode?this.get(EAX,16)<<16>>16:this.get(EAX,16));
    else {dividend=(BigInt(this.get(EDX,w))<<BigInt(w))|BigInt(this.get(EAX,w));if(signedMode)dividend=BigInt.asIntN(w*2,dividend);}
    const d=BigInt(signedMode?signed(divisor,w):divisor);if(d===0n)throw new RuntimeFault('DIVIDE_ERROR','Guest division by zero.');
    const q=dividend/d,r=dividend%d;if(signedMode?q!==BigInt.asIntN(w,q):q!==BigInt.asUintN(w,q))throw new RuntimeFault('DIVIDE_ERROR','Guest quotient overflow.');
    if(w===8){this.set(0,Number(q),8);this.set(4,Number(r),8);}else{this.set(EAX,Number(q),w);this.set(EDX,Number(r),w);}
  }
  stringInstruction(op,w){const size=w>>>3,aw=this.addr16?16:32;let count=this.rep?this.get(ECX,aw):1;if(!count)return;const iterations=Math.min(count,4096),delta=this.flags&DF?-size:size;let ended=false;
    for(let i=0;i<iterations;i++){
      const si=this.get(ESI,aw),di=this.get(EDI,aw),src=(si+this.segment)>>>0;
      if(op===0xA4||op===0xA5)this.write(di,this.read(src,w),w);
      else if(op===0xA6||op===0xA7)this.alu(7,this.read(src,w),this.read(di,w),w);
      else if(op===0xAA||op===0xAB)this.write(di,this.get(EAX,w),w);
      else if(op===0xAC||op===0xAD)this.set(EAX,this.read(src,w),w);
      else if(op===0xAE||op===0xAF)this.alu(7,this.get(EAX,w),this.read(di,w),w);
      if([0xA4,0xA5,0xA6,0xA7,0xAC,0xAD].includes(op))this.set(ESI,si+delta,aw);
      if(![0xAC,0xAD].includes(op))this.set(EDI,di+delta,aw);
      if(this.rep){this.set(ECX,--count,aw);if([0xA6,0xA7,0xAE,0xAF].includes(op)&&((this.rep===0xF3&&!(this.flags&ZF))||(this.rep===0xF2&&(this.flags&ZF)))){ended=true;break;}}
    }
    if(this.rep&&count>0&&!ended)this.eip=this.start;
  }
  step(){
    this.start=this.eip>>>0;this.trace[this.traceAt++&127]=this.start;
    if(this.bridge?.(this.start)){this.instructions++;return;}
    this.op16=false;this.addr16=false;this.rep=0;this.segment=0;let op, prefixCount=0;
    for(;;){op=this.next8();if(++prefixCount>15)this.unsupported('Instruction exceeds 15 bytes.');
      if(op===0x66)this.op16=true;else if(op===0x67)this.addr16=true;else if(op===0xF2||op===0xF3)this.rep=op;
      else if(op===0x64)this.segment=this.fs;else if(op===0x65)this.segment=this.gs;else if([0x26,0x2E,0x36,0x3E].includes(op))this.segment=0;
      else if(op===0xF0){/* one emulated thread: LOCK does not add concurrency */}
      else break;
    }
    const w=this.op16?16:32;this.instructions++;
    if(op<=0x3D&&(op&7)<=5){const kind=op>>>3,form=op&7,ow=(form===0||form===2||form===4)?8:w;
      if(form<=3){const o=this.operand(ow),a=form<2?o.get():this.get(o.reg,ow),b=form<2?this.get(o.reg,ow):o.get(),v=this.alu(kind,a,b,ow);if(kind!==7){if(form<2)o.set(v);else this.set(o.reg,v,ow);}}
      else{const v=this.alu(kind,this.get(EAX,ow),this.imm(ow),ow);if(kind!==7)this.set(EAX,v,ow);}return;}
    if(op>=0x40&&op<=0x4F){const i=op&7;this.set(i,this.inc(this.get(i,w),w,op<0x48?1:-1),w);return;}
    if(op>=0x50&&op<=0x57){this.push(this.get(op&7,w),w);return;}
    if(op>=0x58&&op<=0x5F){this.set(op&7,this.pop(w),w);return;}
    if(op>=0x70&&op<=0x7F){const delta=signed(this.next8(),8);if(this.condition(op&15))this.eip=(this.eip+delta)>>>0;return;}
    if(op>=0x91&&op<=0x97){const old=this.get(op&7,w);this.set(op&7,this.get(EAX,w),w);this.set(EAX,old,w);return;}
    if(op>=0xB0&&op<=0xB7){this.set(op&7,this.next8(),8);return;}
    if(op>=0xB8&&op<=0xBF){this.set(op&7,this.imm(w),w);return;}
    switch(op){
      case 0x0F:return this.extended(w);
      case 0x60:{const sp=this.get(ESP,w);for(const i of [0,1,2,3])this.push(this.get(i,w),w);this.push(sp,w);for(const i of [5,6,7])this.push(this.get(i,w),w);return;}
      case 0x61:for(const i of [7,6,5])this.set(i,this.pop(w),w);this.pop(w);for(const i of [3,2,1,0])this.set(i,this.pop(w),w);return;
      case 0x68:this.push(this.imm(w),w);return;
      case 0x6A:this.push(signed(this.next8(),8),w);return;
      case 0x69:case 0x6B:{const o=this.operand(w),b=op===0x69?this.imm(w):signed(this.next8(),8);this.set(o.reg,this.multiply(o.get(),b,w).low,w);return;}
      case 0x80:case 0x81:case 0x82:case 0x83:{const ow=op===0x80||op===0x82?8:w,o=this.operand(ow),v=op===0x83?signed(this.next8(),8):this.imm(ow),out=this.alu(o.reg,o.get(),v,ow);if(o.reg!==7)o.set(out);return;}
      case 0x84:case 0x85:{const ow=op===0x84?8:w,o=this.operand(ow);this.alu(4,o.get(),this.get(o.reg,ow),ow);return;}
      case 0x86:case 0x87:{const ow=op===0x86?8:w,o=this.operand(ow),a=o.get(),b=this.get(o.reg,ow);o.set(b);this.set(o.reg,a,ow);return;}
      case 0x88:case 0x89:case 0x8A:case 0x8B:{const ow=(op&1)?w:8,o=this.operand(ow);if(op<0x8A)o.set(this.get(o.reg,ow));else this.set(o.reg,o.get(),ow);return;}
      case 0x8C:{const o=this.operand(16);o.set(o.reg===1?0x1B:o.reg===4?0x3B:0x23);return;}
      case 0x8D:{const o=this.operand(w);if(o.isReg)this.unsupported('LEA requires memory addressing.');this.set(o.reg,o.offset,w);return;}
      case 0x8E:this.unsupported('Loading segment selectors is not implemented.');return;
      case 0x8F:{// POP [ESP+...] computes its effective address after the stack increment.
        const before=this.eip;const peek=this.m.u8(before);if(((peek>>>3)&7)!==0)this.unsupported();
        const value=this.pop(w),o=this.operand(w);o.set(value);return;}
      case 0x90:return;
      case 0x98:if(w===16)this.set(EAX,signed(this.get(EAX,8),8),16);else this.r[EAX]=signed(this.get(EAX,16),16);return;
      case 0x99:this.set(EDX,signed(this.get(EAX,w),w)<0?mask(w):0,w);return;
      case 0x9B:return;
      case 0x9C:this.push(this.flags,w);return;
      case 0x9D:this.flags=(this.flags&~0xCD5)|(this.pop(w)&0xCD5)|0x202;return;
      case 0x9E:this.flags=(this.flags&~0xD5)|(this.get(4,8)&0xD5)|2;return;
      case 0x9F:this.set(4,(this.flags&0xD5)|2,8);return;
      case 0xA0:case 0xA1:case 0xA2:case 0xA3:{const ow=(op&1)?w:8,a=(this.imm(this.addr16?16:32)+this.segment)>>>0;if(op<0xA2)this.set(EAX,this.read(a,ow),ow);else this.write(a,this.get(EAX,ow),ow);return;}
      case 0xA4:case 0xA5:case 0xA6:case 0xA7:case 0xAA:case 0xAB:case 0xAC:case 0xAD:case 0xAE:case 0xAF:this.stringInstruction(op,(op&1)?w:8);return;
      case 0xA8:case 0xA9:{const ow=op===0xA8?8:w;this.alu(4,this.get(EAX,ow),this.imm(ow),ow);return;}
      case 0xC0:case 0xC1:case 0xD0:case 0xD1:case 0xD2:case 0xD3:{const ow=(op&1)?w:8,o=this.operand(ow),count=op<0xD0?this.next8():op<0xD2?1:this.get(ECX,8);o.set(this.shift(o.reg,o.get(),count,ow));return;}
      case 0xC2:{const n=this.next16();this.eip=this.pop(w);this.r[ESP]=(this.r[ESP]+n)>>>0;return;}
      case 0xC3:this.eip=this.pop(w);return;
      case 0xC6:case 0xC7:{const ow=op===0xC6?8:w,o=this.operand(ow);if(o.reg!==0)this.unsupported();o.set(this.imm(ow));return;}
      case 0xC8:{const allocation=this.next16(),nest=this.next8()&31;this.push(this.get(EBP,w),w);const frame=this.get(ESP,w);if(nest){let p=this.get(EBP,w);for(let i=1;i<nest;i++){p=trunc(p-(w>>>3),w);this.push(this.read(p,w),w);}this.push(frame,w);}this.set(EBP,frame,w);this.r[ESP]=(this.r[ESP]-allocation)>>>0;return;}
      case 0xC9:this.r[ESP]=this.r[EBP];this.set(EBP,this.pop(w),w);return;
      case 0xCC:throw new RuntimeFault('BREAKPOINT','Guest executed INT3.',{eip:hex(this.start)});
      case 0xCD:{const vector=this.next8();this.unsupported(`Software interrupt ${hex(vector)} is not exposed. This is a user-mode Win32 runtime, not a DOS/BIOS machine.`);return;}
      case 0xD4:{const base=this.next8();if(!base)throw new RuntimeFault('DIVIDE_ERROR','AAM division by zero.');const a=this.get(EAX,8);this.set(4,Math.floor(a/base),8);this.set(EAX,this.szp(a%base,8),8);return;}
      case 0xD5:{const base=this.next8();this.set(EAX,this.szp(this.get(EAX,8)+this.get(4,8)*base,8),8);this.set(4,0,8);return;}
      case 0xD7:this.set(EAX,this.m.u8((this.get(EBX,this.addr16?16:32)+this.get(EAX,8)+this.segment)>>>0),8);return;
      case 0xD8:case 0xD9:case 0xDA:case 0xDB:case 0xDC:case 0xDD:case 0xDE:case 0xDF:return this.x87(op);
      case 0xE0:case 0xE1:case 0xE2:case 0xE3:{const delta=signed(this.next8(),8),aw=this.addr16?16:32;if(op!==0xE3)this.set(ECX,this.get(ECX,aw)-1,aw);const count=this.get(ECX,aw);const take=op===0xE3?count===0:count!==0&&(op===0xE2||(op===0xE1?!!(this.flags&ZF):!(this.flags&ZF)));if(take)this.eip=(this.eip+delta)>>>0;return;}
      case 0xE8:{const d=signed(this.imm(w),w);this.push(this.eip,w);this.eip=trunc(this.eip+d,w);return;}
      case 0xE9:{const d=signed(this.imm(w),w);this.eip=trunc(this.eip+d,w);return;}
      case 0xEB:{const d=signed(this.next8(),8);this.eip=(this.eip+d)>>>0;return;}
      case 0xF5:this.flags^=CF;return;
      case 0xF6:case 0xF7:{const ow=op===0xF6?8:w,o=this.operand(ow),a=o.get();switch(o.reg){case 0:case 1:this.alu(4,a,this.imm(ow),ow);break;case 2:o.set(~a);break;case 3:o.set(this.alu(5,0,a,ow));break;case 4:case 5:{const {low,high}=this.multiply(this.get(EAX,ow),a,ow,o.reg===5);if(ow===8)this.set(EAX,low|(high<<8),16);else{this.set(EAX,low,ow);this.set(EDX,high,ow);}break;}case 6:case 7:this.divide(a,ow,o.reg===7);break;}return;}
      case 0xF8:this.flags&=~CF;return;case 0xF9:this.flags|=CF;return;
      case 0xFC:this.flags&=~DF;return;case 0xFD:this.flags|=DF;return;
      case 0xFE:case 0xFF:{const ow=op===0xFE?8:w,o=this.operand(ow),a=o.get();if(o.reg===0||o.reg===1)o.set(this.inc(a,ow,o.reg===0?1:-1));else if(op===0xFF&&o.reg===2){this.push(this.eip,w);this.eip=a;}else if(op===0xFF&&o.reg===4)this.eip=a;else if(op===0xFF&&o.reg===6)this.push(a,w);else this.unsupported();return;}
      default:this.unsupported();
    }
  }
  extended(w){const op=this.next8();
    if(op>=0x80&&op<=0x8F){const d=signed(this.imm(w),w);if(this.condition(op&15))this.eip=trunc(this.eip+d,w);return;}
    if(op>=0x90&&op<=0x9F){const o=this.operand(8);o.set(this.condition(op&15)?1:0);return;}
    if(op>=0x40&&op<=0x4F){const o=this.operand(w),v=o.get();if(this.condition(op&15))this.set(o.reg,v,w);return;}
    if(op>=0xC8&&op<=0xCF){const i=op&7,v=this.r[i];this.r[i]=((v&255)<<24)|((v&0xFF00)<<8)|((v>>>8)&0xFF00)|(v>>>24);return;}
    if([0x10,0x11,0x28,0x29,0x2A,0x2C,0x2D,0x2E,0x2F,0x51,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x5C,0x5D,0x5E,0x5F,0x6E,0x6F,0x70,0x7E,0x7F,0xEF].includes(op))return this.sse(op);
    switch(op){
      case 0x0B:this.unsupported('Guest executed UD2 (invalid instruction).');return;
      case 0x1E:if(this.rep===0xF3){const x=this.next8();if(x===0xFB||x===0xFA)return;}this.unsupported();return;
      case 0x1F:this.operand(w);return;
      case 0x31:{const t=BigInt(this.instructions)*1000n;this.r[EAX]=Number(t&0xFFFFFFFFn);this.r[EDX]=Number(t>>32n);return;}
      case 0xA2:{const leaf=this.r[EAX];for(const r of [EAX,EBX,ECX,EDX])this.r[r]=0;if(leaf===0){this.r[EAX]=1;this.r[EBX]=0x756E6547;this.r[EDX]=0x49656E69;this.r[ECX]=0x6C65746E;}else if(leaf===1){this.r[EAX]=0x00000522;this.r[EDX]=0x00000111;}else if(leaf===0x80000000)this.r[EAX]=0x80000000;return;}
      case 0xAF:{const o=this.operand(w);this.set(o.reg,this.multiply(this.get(o.reg,w),o.get(),w).low,w);return;}
      case 0xB6:case 0xB7:case 0xBE:case 0xBF:{const sw=(op&1)?16:8,o=this.operand(sw);this.set(o.reg,op>=0xBE?signed(o.get(),sw):o.get(),w);return;}
      case 0xB0:case 0xB1:{const ow=op===0xB0?8:w,o=this.operand(ow),v=o.get();this.alu(7,this.get(EAX,ow),v,ow);if(this.flags&ZF)o.set(this.get(o.reg,ow));else this.set(EAX,v,ow);return;}
      case 0xC0:case 0xC1:{const ow=op===0xC0?8:w,o=this.operand(ow),a=o.get(),b=this.get(o.reg,ow);o.set(this.alu(0,a,b,ow));this.set(o.reg,a,ow);return;}
      case 0xC7:{const o=this.operand(32);if(o.reg!==1||o.isReg)this.unsupported();const lo=this.m.u32(o.a),hi=this.m.u32(o.a+4);if(lo===this.r[EAX]&&hi===this.r[EDX]){this.flags|=ZF;this.m.w32(o.a,this.r[EBX]);this.m.w32(o.a+4,this.r[ECX]);}else{this.flags&=~ZF;this.r[EAX]=lo;this.r[EDX]=hi;}return;}
      case 0xBC:case 0xBD:{const o=this.operand(w),v=o.get();if(!v)this.flags|=ZF;else{this.flags&=~ZF;this.set(o.reg,op===0xBD?31-Math.clz32(v):31-Math.clz32((v&-v)>>>0),w);}return;}
      case 0xA3:case 0xAB:case 0xB3:case 0xBB:case 0xBA:{const o=this.operand(w);let bit=op===0xBA?this.next8():signed(this.get(o.reg,w),w),kind=op===0xBA?o.reg:op===0xA3?4:op===0xAB?5:op===0xB3?6:7;if(kind<4)this.unsupported();let a=o.a;if(!o.isReg&&op!==0xBA)a=(a+Math.floor(bit/w)*(w>>>3))>>>0;bit&=w-1;let v=o.isReg?o.get():this.read(a,w);this.flags=(this.flags&~CF)|((v>>>bit)&1);if(kind!==4){v=kind===5?v|(1<<bit):kind===6?v&~(1<<bit):v^(1<<bit);o.isReg?o.set(v):this.write(a,v,w);}return;}
      case 0xA4:case 0xA5:case 0xAC:case 0xAD:{const o=this.operand(w),src=this.get(o.reg,w),count=(op&1?this.get(ECX,8):this.next8())&31;if(!count)return;if(count>w)this.unsupported('Undefined double-shift count.');const dest=o.get();let value,cf;if(op<0xAC){value=Number(BigInt.asUintN(w,(BigInt(dest)<<BigInt(count))|(BigInt(src)>>BigInt(w-count))));cf=(dest>>>(w-count))&1;}else{value=Number(BigInt.asUintN(w,(BigInt(dest)>>BigInt(count))|(BigInt(src)<<BigInt(w-count))));cf=(dest>>>(count-1))&1;}this.flags=(this.flags&~CF)|cf;this.szp(value,w);if(count===1)this.flags=(this.flags&~OF)|(((dest^value)&signbit(w))?OF:0);o.set(value);return;}
      case 0xAE:{const byte=this.m.u8(this.eip);if(byte===0xE8||byte===0xF0||byte===0xF8){this.next8();return;}const o=this.operand(32);if(o.isReg)this.unsupported();if(o.reg===2)this.mxcsr=this.m.u32(o.a);else if(o.reg===3)this.m.w32(o.a,this.mxcsr);else this.unsupported('FXSAVE/FXRSTOR is not implemented.');return;}
      default:this.unsupported();
    }
  }
  sse(op){
    // Binary32/64 operations use JS IEEE-754 arithmetic; exception/denormal
    // control and the full SSE instruction set are intentionally not claimed.
    const o=this.operand(32),dst=this.xmm[o.reg],src=o.isReg?this.xmm[o.rm]:null;
    const scalar=this.rep===0xF2||this.rep===0xF3,double=this.rep===0xF2||this.op16,width=double?8:4,n=scalar?width:16;
    const load=k=>o.isReg?src.slice(0,k):this.m.read(o.a,k);
    const put=(data,k=16)=>{if(o.isReg)this.xmm[o.rm].set(data.subarray(0,k));else this.m.write(o.a,data.subarray(0,k));};
    if([0x10,0x28,0x6F].includes(op)){if(op===0x6F&&!this.op16&&this.rep!==0xF3)this.unsupported('MMX is not implemented.');const k=op===0x10?n:16;const data=load(k);if(k<16&&!o.isReg)dst.fill(0);dst.set(data);return;}
    if([0x11,0x29,0x7F].includes(op)){if(op===0x7F&&!this.op16&&this.rep!==0xF3)this.unsupported('MMX is not implemented.');put(dst,op===0x11?n:16);return;}
    if(op===0x6E){if(!this.op16)this.unsupported('MMX is not implemented.');dst.fill(0);new DataView(dst.buffer).setUint32(0,o.get(),true);return;}
    if(op===0x7E){if(this.rep===0xF3){dst.fill(0);dst.set(load(8));}else if(this.op16)o.set(new DataView(dst.buffer).getUint32(0,true));else this.unsupported('MMX is not implemented.');return;}
    if([0x54,0x55,0x56,0x57,0xEF].includes(op)){if(op===0xEF&&!this.op16)this.unsupported('MMX is not implemented.');const data=load(16);for(let i=0;i<16;i++)dst[i]=op===0x54?dst[i]&data[i]:op===0x55?(~dst[i])&data[i]:op===0x56?dst[i]|data[i]:dst[i]^data[i];return;}
    if(op===0x70){if(!this.op16)this.unsupported('Only PSHUFD is implemented for opcode 0F70.');const imm=this.next8(),data=load(16);for(let i=0;i<4;i++)dst.set(data.subarray(((imm>>>(i*2))&3)*4,(((imm>>>(i*2))&3)+1)*4),i*4);return;}
    const dv=new DataView(dst.buffer),readFloat=(d,i)=>double?d.getFloat64(i,true):d.getFloat32(i,true),writeFloat=(d,i,v)=>double?d.setFloat64(i,v,true):d.setFloat32(i,v,true);
    if(op===0x2A){if(!scalar)this.unsupported('Packed integer-to-float conversion is not implemented.');writeFloat(dv,0,o.get()|0);return;}
    if(op===0x2C||op===0x2D){if(!scalar)this.unsupported('MMX conversion is not implemented.');const v=readFloat(new DataView(load(width).buffer),0),q=op===0x2C?Math.trunc(v):this.roundNearest(v);this.r[o.reg]=Number.isFinite(q)&&q>=-2147483648&&q<=2147483647?q:0x80000000;return;}
    if(op===0x2E||op===0x2F){const a=readFloat(dv,0),b=readFloat(new DataView(load(width).buffer),0);this.flags&=~(OF|SF|AF|ZF|PF|CF);this.flags|=Number.isNaN(a)||Number.isNaN(b)?ZF|PF|CF:a===b?ZF:a<b?CF:0;return;}
    if(op===0x5A){if(!scalar)this.unsupported('Packed float-width conversion is not implemented.');const data=load(width),v=readFloat(new DataView(data.buffer),0);if(double)dv.setFloat32(0,v,true);else dv.setFloat64(0,v,true);return;}
    const data=load(n),sv=new DataView(data.buffer);for(let i=0;i<n;i+=width){const a=readFloat(dv,i),b=readFloat(sv,i);let v;if(op===0x51)v=Math.sqrt(b);else if(op===0x58)v=a+b;else if(op===0x59)v=a*b;else if(op===0x5C)v=a-b;else if(op===0x5D)v=Number.isNaN(a)||Number.isNaN(b)||a===b?b:Math.min(a,b);else if(op===0x5E)v=a/b;else if(op===0x5F)v=Number.isNaN(a)||Number.isNaN(b)||a===b?b:Math.max(a,b);else this.unsupported();writeFloat(dv,i,v);}
  }
  roundNearest(v){const n=Math.floor(v),f=v-n;return f===0.5?(n%2===0?n:n+1):Math.round(v);}
  fget(i=0){if(i>=this.fpu.length)throw new RuntimeFault('FPU_STACK','x87 stack underflow.');return this.fpu[i];}
  fpush(v){if(this.fpu.length>=8)throw new RuntimeFault('FPU_STACK','x87 stack overflow.');this.fpu.unshift(v);}
  fpop(){this.fget();return this.fpu.shift();}
  fcompare(a,b,cpuFlags=false){const unordered=Number.isNaN(a)||Number.isNaN(b);if(cpuFlags){this.flags&=~(OF|SF|AF|ZF|PF|CF);this.flags|=unordered?ZF|PF|CF:a===b?ZF:a<b?CF:0;}else{this.fpuStatus&=~0x4500;this.fpuStatus|=unordered?0x4500:a===b?0x4000:a<b?0x100:0;}}
  fround(v){const mode=(this.fpuControl>>>10)&3;return mode===0?this.roundNearest(v):mode===1?Math.floor(v):mode===2?Math.ceil(v):Math.trunc(v);}
  x87(op){const b=this.m.u8(this.eip),sub=(b>>>3)&7,i=b&7;
    if(b>=0xC0){this.next8();
      if(op===0xD9){if(b<0xC8){this.fpush(this.fget(i));return;}if(b<0xD0){const a=this.fget(),v=this.fget(i);this.fpu[0]=v;this.fpu[i]=a;return;}switch(b){case 0xD0:return;case 0xE0:this.fpu[0]=-this.fget();return;case 0xE1:this.fpu[0]=Math.abs(this.fget());return;case 0xE4:this.fcompare(this.fget(),0);return;case 0xE8:this.fpush(1);return;case 0xE9:this.fpush(Math.LOG2E/Math.LOG10E);return;case 0xEA:this.fpush(Math.LOG2E);return;case 0xEB:this.fpush(Math.PI);return;case 0xEC:this.fpush(Math.LOG10E/Math.LOG2E);return;case 0xED:this.fpush(Math.LN2);return;case 0xEE:this.fpush(0);return;case 0xFA:this.fpu[0]=Math.sqrt(this.fget());return;case 0xFC:this.fpu[0]=this.fround(this.fget());return;case 0xFD:this.fpu[0]=this.fget()*2**Math.trunc(this.fget(1));return;case 0xFE:this.fpu[0]=Math.sin(this.fget());return;case 0xFF:this.fpu[0]=Math.cos(this.fget());return;default:this.unsupported('This x87 operation is not implemented.');}}
      if(op===0xDB&&(b===0xE2||b===0xE3)){this.fpuStatus=0;if(b===0xE3){this.fpu=[];this.fpuControl=0x37F;}return;}
      if(op===0xDF&&b===0xE0){this.set(EAX,this.fpuStatus|(((8-this.fpu.length)&7)<<11),16);return;}
      if((op===0xDB||op===0xDF)&&(sub===5||sub===6)){this.fcompare(this.fget(),this.fget(i),true);if(op===0xDF)this.fpop();return;}
      if(op===0xDD){if(sub===2||sub===3){const v=this.fget();if(i>=this.fpu.length)this.unsupported('Sparse x87 register stacks are not implemented.');this.fpu[i]=v;if(sub===3)this.fpop();return;}if(sub===4||sub===5){this.fcompare(this.fget(),this.fget(i));if(sub===5)this.fpop();return;}}
      if(op===0xDE&&b===0xD9){this.fcompare(this.fget(),this.fget(1));this.fpop();this.fpop();return;}
      if(op===0xD8||op===0xDC||op===0xDE){const a=this.fget(),v=this.fget(i);if(op===0xD8&&(sub===2||sub===3)){this.fcompare(a,v);if(sub===3)this.fpop();return;}let out;if(sub===0)out=a+v;else if(sub===1)out=a*v;else if(sub===4)out=a-v;else if(sub===5)out=v-a;else if(sub===6)out=a/v;else if(sub===7)out=v/a;else this.unsupported();this.fpu[op===0xD8?0:i]=out;if(op===0xDE)this.fpop();return;}
      this.unsupported('This x87 register operation is not implemented.');
    }
    const o=this.operand(32),a=o.a;
    const f32=()=>new DataView(this.m.read(a,4).buffer).getFloat32(0,true),f64=()=>new DataView(this.m.read(a,8).buffer).getFloat64(0,true);
    const store=(v,size,float=true)=>{const data=new Uint8Array(size),d=new DataView(data.buffer);if(float){if(size===4)d.setFloat32(0,v,true);else d.setFloat64(0,v,true);}else if(size===2)d.setInt16(0,v,true);else if(size===4)d.setInt32(0,v,true);else d.setBigInt64(0,BigInt(Number.isFinite(v)?v:0),true);this.m.write(a,data);};
    if(op===0xD9){if(sub===0)this.fpush(f32());else if(sub===2||sub===3){store(this.fget(),4);if(sub===3)this.fpop();}else if(sub===5)this.fpuControl=this.m.u16(a);else if(sub===7)this.m.w16(a,this.fpuControl);else this.unsupported();return;}
    if(op===0xDD){if(sub===0)this.fpush(f64());else if(sub===2||sub===3){store(this.fget(),8);if(sub===3)this.fpop();}else if(sub===7)this.m.w16(a,this.fpuStatus);else this.unsupported();return;}
    if(op===0xDB||op===0xDF){const size=op===0xDB?4:2;if(sub===0)this.fpush(size===4?this.m.i32(a):this.m.i16(a));else if(sub===1||sub===2||sub===3){store(sub===1?Math.trunc(this.fget()):this.fround(this.fget()),size,false);if(sub!==2)this.fpop();}else if(op===0xDF&&sub===5)this.fpush(Number(new DataView(this.m.read(a,8).buffer).getBigInt64(0,true)));else if(op===0xDF&&sub===7){store(this.fround(this.fget()),8,false);this.fpop();}else this.unsupported('80-bit x87 storage / BCD is not implemented.');return;}
    const v=op===0xD8?f32():op===0xDC?f64():op===0xDA?this.m.i32(a):this.m.i16(a),x=this.fget();if(sub===2||sub===3){this.fcompare(x,v);if(sub===3)this.fpop();}else this.fpu[0]=sub===0?x+v:sub===1?x*v:sub===4?x-v:sub===5?v-x:sub===6?x/v:v/x;
  }
  unsupported(message='This x86 instruction is not implemented.') {let bytes=[];for(let i=0;i<15;i++){try{bytes.push(this.m.u8((this.start+i)>>>0).toString(16).padStart(2,'0'));}catch{break;}}throw new RuntimeFault('UNSUPPORTED_INSTRUCTION',`${message} At ${hex(this.start)}: ${bytes.join(' ')}.`,{eip:hex(this.start),bytes:bytes.join(' ')});}
  snapshot(){const names=['EAX','ECX','EDX','EBX','ESP','EBP','ESI','EDI'];return {eip:hex(this.eip),flags:hex(this.flags),registers:Object.fromEntries(names.map((n,i)=>[n,hex(this.r[i])])),instructions:this.instructions,trace:Array.from({length:Math.min(this.traceAt,128)},(_,i)=>hex(this.trace[(Math.max(0,this.traceAt-128)+i)&127])),fpu:[...this.fpu]};}
}
