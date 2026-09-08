import {checkBuffer} from './files.js';
import {characterTypeRanges} from './character-type-table.js';

const tables=new Map(Object.entries(characterTypeRanges).map(([mode,ranges])=>{
  const table=new Uint16Array(65536);for(const [start,end,value] of ranges)table.fill(value,start,end);return [Number(mode),table];
}));
export function installCharacterTypes(api){
  const m=api.m;
  api.add('kernel32.dll','GetStringTypeW',4,(mode,src,count,out)=>{
    const table=tables.get(mode);if(!table)return api.fail(1004);
    count|=0;if(!src||!out||!count||src===out)return api.fail(87);
    if(count<0)count=m.wstr(src).length+1;
    checkBuffer(m,src,count*2,'r');checkBuffer(m,out,count*2);
    const result=new Uint16Array(count);for(let i=0;i<count;i++)result[i]=table[m.u16(src+i*2)];
    for(let i=0;i<count;i++)m.w16(out+i*2,result[i]);return 1;
  });
}
