import {checkBuffer} from './files.js';
import {ordinalUpper} from './ordinal-table.js';

export function installOrdinalComparison(api){
  const m=api.m;
  const readString=(address,count,ignoreCase)=>{
    if(count===-1)count=m.wstr(address).length;
    checkBuffer(m,address,count*2,'r');const parts=[];
    for(let start=0;start<count;start+=4096){
      const units=[];for(let i=start;i<Math.min(start+4096,count);i++){const c=m.u16(address+i*2);units.push(ignoreCase?(ordinalUpper.get(c)??c):c);}
      parts.push(String.fromCharCode(...units));
    }
    return parts.join('');
  };
  api.add('kernel32.dll','FindStringOrdinal',6,(flags,source,sourceCount,value,valueCount,ignoreCase)=>{
    if(![0,0x400000,0x800000,0x100000,0x200000].includes(flags))return api.fail(1004,-1);
    sourceCount|=0;valueCount|=0;
    if(!source||!value||sourceCount< -1||valueCount< -1||(ignoreCase!==0&&ignoreCase!==1))return api.fail(87,-1);
    const haystack=readString(source,sourceCount,ignoreCase),needle=readString(value,valueCount,ignoreCase);
    let result;
    if(flags===0x100000)result=haystack.startsWith(needle)?0:-1;
    else if(flags===0x200000)result=haystack.endsWith(needle)?haystack.length-needle.length:-1;
    else result=flags===0x800000?haystack.lastIndexOf(needle):haystack.indexOf(needle);
    api.p.setError(0);return result;
  });
  api.add('kernel32.dll','CompareStringOrdinal',5,(a,na,b,nb,ignoreCase)=>{
    na|=0;nb|=0;
    if(!a||!b||na< -1||nb< -1||(ignoreCase!==0&&ignoreCase!==1))return api.fail(87);
    if(na===-1)na=m.wstr(a).length;if(nb===-1)nb=m.wstr(b).length;
    checkBuffer(m,a,na*2,'r');checkBuffer(m,b,nb*2,'r');
    for(let i=0;i<Math.min(na,nb);i++){
      let x=m.u16(a+i*2),y=m.u16(b+i*2);
      if(ignoreCase){x=ordinalUpper.get(x)??x;y=ordinalUpper.get(y)??y;}
      if(x!==y)return x<y?1:3;
    }
    return na===nb?2:na<nb?1:3;
  });
}
