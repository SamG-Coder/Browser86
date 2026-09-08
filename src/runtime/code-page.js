import {checkBuffer} from './files.js';

const profiles=new Map([
  [1252,{max:1,unicode:63,name:'1252  (ANSI - Latin I)'}],
  [437,{max:1,unicode:63,name:'437   (OEM - United States)'}],
  [65001,{max:4,unicode:0xfffd,name:'65001 (UTF-8)'}],
]);
export function installCodePageInfo(api){
  const m=api.m,k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  const resolve=cp=>cp===0||cp===3?1252:cp===1?437:cp;
  k('IsValidCodePage',1,cp=>profiles.has(cp)?1:0);
  const write=(cp,out,wide,extended,flags=0)=>{
    cp=resolve(cp);const info=profiles.get(cp);if(!info)return api.fail(87);
    // Observed UTF-8 queries ignore reserved flags; SBCS queries reject them.
    if(flags&&cp!==65001)return api.fail(1004);
    const size=extended?(wide?544:284):20;checkBuffer(m,out,size);m.fill(out,size);
    m.w32(out,info.max);m.w8(out+4,63);
    if(extended){m.w16(out+18,info.unicode);m.w32(out+20,cp);m.string(out+24,info.name,wide);}
    return 1;
  };
  k('GetCPInfo',2,(cp,out)=>write(cp,out,false,false));
  for(const wide of [false,true])k('GetCPInfoEx'+(wide?'W':'A'),3,(cp,flags,out)=>write(cp,out,wide,true,flags));
}
