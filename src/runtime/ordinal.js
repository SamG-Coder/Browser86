import {checkBuffer} from './files.js';
import {ordinalUpper} from './ordinal-table.js';

export function installOrdinalComparison(api){
  const m=api.m;
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
