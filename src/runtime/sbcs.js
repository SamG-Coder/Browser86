import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
import {sbcsTables} from './sbcs-tables.js';
import {utf8ToWide,wideToUtf8} from './utf8.js';

const profiles=new Map(Object.entries(sbcsTables).map(([cp,t])=>[Number(cp),{decode:t.decode,encode:new Map(t.encode[0]),exact:new Map(t.encode[1024])}]));
const resolve=cp=>cp===0||cp===3?1252:cp===1?437:cp;
export function installCodePageConversions(api){
  const m=api.m;
  api.add('kernel32.dll','MultiByteToWideChar',6,(cp,flags,src,count,out,capacity)=>{
    if(cp===65001)return utf8ToWide(api,flags,src,count,out,capacity);
    const profile=profiles.get(resolve(cp));if(!profile)return api.fail(87);
    if(flags&~15||(flags&3)===3)return api.fail(1004);
    count|=0;capacity|=0;if(!src||!count||capacity<0||(capacity&&(!out||src===out)))return api.fail(87);
    if(count<0)count=m.cstr(src).length+1;const bytes=m.read(src,count),table=profile.decode[flags&14],units=[];
    for(const b of bytes){const mapped=table[b];if(mapped===null)return api.fail(1113);for(const unit of mapped)units.push(unit);}
    if(!capacity)return units.length;
    if(capacity<units.length){
      let consumed=0,written=0;for(const b of bytes){if(written===capacity)break;written+=Math.min(table[b].length,capacity-written);consumed++;}
      checkBuffer(m,out,written*2);for(let i=0;i<written;i++)m.w16(out+i*2,units[i]);
      return consumed===bytes.length?written:api.fail(122);
    }
    checkBuffer(m,out,units.length*2);units.forEach((unit,i)=>m.w16(out+i*2,unit));return units.length;
  });
  api.add('kernel32.dll','WideCharToMultiByte',8,(cp,flags,src,count,out,capacity,defaultChar,usedDefault)=>{
    if(cp===65001)return wideToUtf8(api,flags,src,count,out,capacity,defaultChar,usedDefault);
    const profile=profiles.get(resolve(cp));if(!profile)return api.fail(87);
    if(flags&~0x670||(!(flags&0x200)&&(flags&0x70)))return api.fail(1004);
    if(flags&0x200)throw new RuntimeFault('UNSUPPORTED_NLS','SBCS composite checking and nonspacing fallback modes are not implemented.');
    count|=0;capacity|=0;if(!src||!count||capacity<0||(capacity&&(!out||src===out)))return api.fail(87);
    if(count<0)count=m.wstr(src).length+1;checkBuffer(m,src,count*2,'r');
    const fallback=defaultChar?m.u8(defaultChar):63,table=flags&0x400?profile.exact:profile.encode,bytes=new Uint8Array(count);let used=0;
    for(let i=0;i<count;i++){const mapped=table.get(m.u16(src+i*2));bytes[i]=mapped??fallback;if(mapped===undefined)used=1;}
    if(usedDefault)checkBuffer(m,usedDefault,4);
    if(!capacity){if(usedDefault)m.w32(usedDefault,used);return count;}
    if(capacity<count){
      checkBuffer(m,out,capacity);let partialUsed=0;for(let i=0;i<capacity;i++)if(!table.has(m.u16(src+i*2)))partialUsed=1;
      m.write(out,bytes.subarray(0,capacity));if(usedDefault)m.w32(usedDefault,partialUsed);return api.fail(122);
    }
    checkBuffer(m,out,count);m.write(out,bytes);if(usedDefault)m.w32(usedDefault,used);return count;
  });
}
