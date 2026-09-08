import {checkBuffer} from './files.js';

// Windows consumes the second continuation byte before rejecting an overlong,
// surrogate, or out-of-range prefix. WHATWG TextDecoder differs in this case.
function decode(bytes,strict){
  const parts=[];let chunk='';
  const append=c=>{chunk+=String.fromCodePoint(c);if(chunk.length>=4096){parts.push(chunk);chunk='';}};
  for(let i=0;i<bytes.length;){
    const first=bytes[i++];if(first<128){append(first);continue;}
    const n=first>=0xc2&&first<=0xdf?2:first>=0xe0&&first<=0xef?3:first>=0xf0&&first<=0xf4?4:0;
    let value=first&(n===2?31:n===3?15:7),valid=!!n;
    for(let j=1;valid&&j<n;j++){
      const next=bytes[i];if(next===undefined||(next&0xc0)!==0x80){valid=false;break;}
      i++;value=(value<<6)|(next&63);
      if(j===1&&((first===0xe0&&next<0xa0)||(first===0xed&&next>=0xa0)||(first===0xf0&&next<0x90)||(first===0xf4&&next>=0x90)))valid=false;
    }
    if(!valid){if(strict)return null;append(0xfffd);}else append(value);
  }
  parts.push(chunk);return parts.join('');
}
export function utf8ToWide(api,flags,src,count,out,capacity){
  const m=api.m;count|=0;capacity|=0;
  if(flags!==0&&flags!==8)return api.fail(1004);
  if(!src||!count||capacity<0||(capacity&&(!out||src===out)))return api.fail(87);
  if(count<0)count=m.cstr(src).length+1;
  const text=decode(m.read(src,count),!!flags);if(text===null)return api.fail(1113);
  if(!capacity)return text.length;if(capacity<text.length)return api.fail(122);
  checkBuffer(m,out,text.length*2);for(let i=0;i<text.length;i++)m.w16(out+i*2,text.charCodeAt(i));return text.length;
}
export function wideToUtf8(api,flags,src,count,out,capacity,defaultChar,usedDefault){
  const m=api.m;count|=0;capacity|=0;
  if(flags!==0&&flags!==0x80)return api.fail(1004);
  if(!src||!count||capacity<0||defaultChar||usedDefault||(capacity&&(!out||src===out)))return api.fail(87);
  if(count<0)count=m.wstr(src).length+1;checkBuffer(m,src,count*2,'r');
  const parts=[];for(let start=0;start<count;start+=4096){const units=[];for(let i=start;i<Math.min(start+4096,count);i++)units.push(m.u16(src+i*2));parts.push(String.fromCharCode(...units));}
  const text=parts.join('');
  if(flags)for(let i=0;i<text.length;i++){
    const c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return api.fail(1113);}
    else if(c>=0xdc00&&c<=0xdfff)return api.fail(1113);
  }
  const bytes=new TextEncoder().encode(text);if(!capacity)return bytes.length;if(capacity<bytes.length)return api.fail(122);
  checkBuffer(m,out,bytes.length);m.write(out,bytes);return bytes.length;
}
