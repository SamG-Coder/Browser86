// The virtual Windows profile currently uses en-US, independently of the host browser.
export function installLocaleInfo(api){
  const m=api.m,values=new Map([[1,'0409'],[2,'English (United States)'],[3,'ENU'],[4,'English'],[5,'1'],[6,'United States'],[7,'USA'],[8,'United States'],[0xe,'.'],[0xf,','],[0x10,'3;0'],[0x11,'2'],[0x12,'1'],[0x13,'0123456789'],[0x14,'$'],[0x15,'USD'],[0x1d,'/'],[0x1e,':'],[0x1f,'M/d/yyyy'],[0x20,'dddd, MMMM d, yyyy'],[0x28,'AM'],[0x29,'PM'],[0x5c,'en-US'],[0x1003,'h:mm:ss tt'],[0x1004,'1252']]);
  const numeric=new Map([[1,0x409],[5,1],[0x11,2],[0x12,1],[0x1004,1252]]);
  for(const wide of [false,true])api.add('kernel32.dll','GetLocaleInfo'+(wide?'W':'A'),4,(locale,type,out,count)=>{
    count|=0;if(![0x409,0x400,0x800].includes(locale)||count<0||count&&!out)return api.fail(87);
    const kind=type&0xffff;if(type&0x1fff0000)return api.fail(1004);
    const asNumber=!!(type&0x20000000),value=asNumber?numeric.get(kind):values.get(kind);if(value===undefined)return api.fail(1004);
    const needed=asNumber?(wide?2:4):value.length+1;if(!count)return needed;if(count<needed)return api.fail(122);
    if(asNumber)m.w32(out,value);else m.string(out,value,wide,count);return needed;
  });
}
