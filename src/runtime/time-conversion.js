import {checkBuffer} from './files.js';
import {writeFileTime} from './file-info.js';

const EPOCH_MS=11644473600000n;
export function installTimeConversions(api){
  const m=api.m,k=(name,fn)=>api.add('kernel32.dll',name,2,fn);
  const read=address=>{checkBuffer(m,address,8,'r');return BigInt(m.u32(address))|(BigInt(m.u32(address+4))<<32n);};
  k('CompareFileTime',(a,b)=>{const x=read(a),y=read(b);return x<y?-1:x>y?1:0;});
  api.add('kernel32.dll','DosDateTimeToFileTime',3,(packedDate,packedTime,out)=>{
    const year=1980+((packedDate>>>9)&127),month=(packedDate>>>5)&15,day=packedDate&31;
    const hour=(packedTime>>>11)&31,minute=(packedTime>>>5)&63,second=(packedTime&31)*2;
    if(!month||month>12||!day||hour>23||minute>59||second>59)return api.fail(87);
    const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
    if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return api.fail(87);
    checkBuffer(m,out,8);writeFileTime(m,out,(BigInt(date.getTime())+EPOCH_MS)*10000n);return 1;
  });
  api.add('kernel32.dll','FileTimeToDosDateTime',3,(input,dateOut,timeOut)=>{
    const value=read(input);
    // Native Windows rounds upward to the next two-second boundary before
    // checking the DOS year range, including sub-millisecond FILETIME ticks.
    const rounded=(value+19999999n)/20000000n*20000000n;
    const date=new Date(Number(rounded/10000n-EPOCH_MS)),year=date.getUTCFullYear();
    if(year<1980||year>2107)return api.fail(87);
    const packedDate=((year-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate();
    const packedTime=(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>>1);
    checkBuffer(m,dateOut,2);checkBuffer(m,timeOut,2);m.w16(dateOut,packedDate);m.w16(timeOut,packedTime);return 1;
  });
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
