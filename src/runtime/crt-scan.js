import {requireThat} from './errors.js';

const white=ch=>ch===' '||ch>='\t'&&ch<='\r';
export function scanCRT(m,text,format,args){
  let cursor=0,assigned=0,argument=args;
  const failure=()=>assigned||(cursor>=text.length?-1:0);
  for(let i=0;i<format.length;i++){
    if(white(format[i])){while(white(text[cursor]))cursor++;continue;}
    if(format[i]!=='%'){if(text[cursor]!==format[i])return failure();cursor++;continue;}
    i++;if(format[i]==='%'){if(text[cursor]!=='%')return failure();cursor++;continue;}
    const suppress=format[i]==='*';if(suppress)i++;
    let width='';while(/[0-9]/.test(format[i]||''))width+=format[i++];const limit=width?Number(width):0x100000;
    let length='';if(format.slice(i,i+3)==='I64'){length='ll';i+=3;}else while('hlL'.includes(format[i]||'\0'))length+=format[i++];
    const type=format[i];let value,bytes=null;
    if(type!=='c'&&type!=='['&&type!=='n')while(white(text[cursor]))cursor++;
    const tail=text.slice(cursor,cursor+limit);let consumed=0;
    if(type==='n')value=cursor;
    else if('diuxXo'.includes(type||'\0')){
      const pattern=type==='d'||type==='u'?/^[+-]?\d+/:type==='o'?/^[+-]?[0-7]+/:type==='i'?/^[+-]?(?:0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)/:/^[+-]?(?:0[xX])?[0-9a-fA-F]+/;
      const match=tail.match(pattern);if(!match)return failure();const token=match[0];consumed=token.length;const negative=token[0]==='-',digits=token.replace(/^[+-]/,'');let radix=type==='o'?8:type==='x'||type==='X'?16:type==='i'?/^0x/i.test(digits)?16:digits[0]==='0'?8:10:10;
      const clean=radix===16?digits.replace(/^0x/i,''):digits;value=BigInt((radix===16?'0x':radix===8?'0o':'')+(clean||'0'))*(negative?-1n:1n);
    }else if('fFeEgG'.includes(type||'\0')){
      requireThat(!/^[+-]?0x/i.test(tail),'CRT_SCAN','Hexadecimal floating-point input is not implemented.');
      const match=tail.match(/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|inf(?:inity)?|nan)/i);if(!match)return failure();consumed=match[0].length;value=/^[+-]?inf/i.test(match[0])?(match[0][0]==='-'?-Infinity:Infinity):Number(match[0]);
    }else if(type==='s'){while(consumed<tail.length&&!white(tail[consumed]))consumed++;if(!consumed)return failure();bytes=tail.slice(0,consumed);}
    else if(type==='c'){consumed=Math.min(width?limit:1,tail.length);if(!consumed)return failure();bytes=tail.slice(0,consumed);}
    else if(type==='['){let inverse=false;if(format[i+1]==='^'){inverse=true;i++;}let set='';if(format[i+1]===']')set+=format[++i];while(i+1<format.length&&format[i+1]!==']')set+=format[++i];requireThat(format[++i]===']','CRT_SCAN','Unterminated scanf scanset.');const allowed=new Set();for(let k=0;k<set.length;k++){if(k+2<set.length&&set[k+1]==='-'&&set.charCodeAt(k)<=set.charCodeAt(k+2)){for(let ch=set.charCodeAt(k);ch<=set.charCodeAt(k+2);ch++)allowed.add(String.fromCharCode(ch));k+=2;}else allowed.add(set[k]);}while(consumed<tail.length&&allowed.has(tail[consumed])!==inverse)consumed++;if(!consumed)return failure();bytes=tail.slice(0,consumed);}
    else requireThat(false,'CRT_SCAN','Unsupported scanf conversion.',{type,length});
    if(!suppress){const out=m.u32(argument);argument+=4;
      if(bytes!==null){requireThat(!length||length==='h','CRT_SCAN','Wide scanf string output is not implemented.');const data=Uint8Array.from(bytes,ch=>ch.charCodeAt(0));m.write(out,data);if(type!=='c')m.w8(out+data.length,0);}
      else if('fFeEgG'.includes(type||'\0')){requireThat(!length||length==='l','CRT_SCAN','Long double scanf output is not implemented.');const buffer=new ArrayBuffer(length==='l'?8:4),view=new DataView(buffer);length==='l'?view.setFloat64(0,value,true):view.setFloat32(0,value,true);m.write(out,new Uint8Array(buffer));}
      else {const integer=BigInt(value);if(length==='ll'){m.w32(out,Number(BigInt.asUintN(32,integer)));m.w32(out+4,Number(BigInt.asUintN(32,integer>>32n)));}else if(length==='h')m.w16(out,Number(BigInt.asUintN(16,integer)));else if(length==='hh')m.w8(out,Number(BigInt.asUintN(8,integer)));else m.w32(out,Number(BigInt.asUintN(32,integer)));}
      if(type!=='n')assigned++;
    }
    cursor+=consumed;
  }
  return assigned;
}
