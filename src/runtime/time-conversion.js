import {checkBuffer} from './files.js';
import {writeFileTime} from './file-info.js';

const EPOCH_MS=11644473600000n;
export function installTimeConversions(api){
  const m=api.m,k=(name,fn)=>api.add('kernel32.dll',name,2,fn);
  const read=address=>{checkBuffer(m,address,8,'r');return BigInt(m.u32(address))|(BigInt(m.u32(address+4))<<32n);};
  k('CompareFileTime',(a,b)=>{const x=read(a),y=read(b);return x<y?-1:x>y?1:0;});
  k('FileTimeToSystemTime',(input,out)=>{
    const value=read(input);if(value>=0x8000000000000000n)return api.fail(87);
    // Truncate 100ns fractions before converting to Number, keeping all whole
    // milliseconds exact throughout the supported FILETIME range.
    const date=new Date(Number(value/10000n-EPOCH_MS));
    const fields=[date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDay(),date.getUTCDate(),date.getUTCHours(),date.getUTCMinutes(),date.getUTCSeconds(),date.getUTCMilliseconds()];
    checkBuffer(m,out,16);fields.forEach((value,i)=>m.w16(out+i*2,value));return 1;
  });
  k('SystemTimeToFileTime',(input,out)=>{
    checkBuffer(m,input,16,'r');const [year,month,weekday,day,hour,minute,second,millis]=Array.from({length:8},(_,i)=>m.u16(input+i*2));
    if(year<1601||year>30827||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59||millis>999)return api.fail(87);
    const date=new Date(Date.UTC(year,month-1,day,hour,minute,second,millis));
    if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return api.fail(87);
    const value=(BigInt(date.getTime())+EPOCH_MS)*10000n;
    checkBuffer(m,out,8);writeFileTime(m,out,value);return 1;
  });
}
