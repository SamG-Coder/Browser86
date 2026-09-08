import {ansiEncode} from './memory.js';
import {checkBuffer} from './files.js';

// OEM 437, matching GetOEMCP; ordinary A APIs continue to use ACP 1252.
const oemHigh='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const oemMap=new Map([...oemHigh].map((c,i)=>[c,i+128]));
const oemEncode=text=>Uint8Array.from(text,c=>c.charCodeAt(0)<128?c.charCodeAt(0):oemMap.get(c)??63);
export function installEnvironment(api){
  const p=api.p,m=api.m,blocks=new Map(),k=(name,n,fn)=>api.add('kernel32.dll',name,n,fn);
  for(const wide of [false,true]){
    const suffix=wide?'W':'A',str=ptr=>api.str(ptr,wide);
    const length=text=>wide?text.length:ansiEncode(text).length;
    const write=(out,text)=>{checkBuffer(m,out,(length(text)+1)*(wide?2:1));m.string(out,text,wide);};
    k('GetEnvironmentVariable'+suffix,3,(name,out,size)=>{
      const value=p.environment.get(str(name).toUpperCase());if(value===undefined)return api.fail(203);
      const count=length(value);
      if(size<=count){if(size&&out){checkBuffer(m,out,wide?2:1);wide?m.w16(out,0):m.w8(out,0);}return count+1;}
      if(!out)return api.fail(87);write(out,value);return count;
    });
    k('SetEnvironmentVariable'+suffix,2,(name,value)=>{
      const key=str(name).toUpperCase();if(!key||key.includes('='))return api.fail(87);
      if(value)p.environment.set(key,str(value));else p.environment.delete(key);return 1;
    });
    const getBlock=()=>{
      const text=[...p.environment].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>key+'='+value).join('\0')+'\0\0';
      let bytes;
      if(wide){bytes=new Uint8Array(text.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),true);}
      else bytes=oemEncode(text);
      const ptr=p.heap.alloc(bytes.length);m.write(ptr,bytes);blocks.set(ptr,wide);return ptr;
    };
    k('GetEnvironmentStrings'+suffix,0,getBlock);if(!wide)k('GetEnvironmentStrings',0,getBlock);
    k('FreeEnvironmentStrings'+suffix,1,ptr=>{
      if(!blocks.has(ptr)||blocks.get(ptr)!==wide)return api.fail(87);
      if(!p.heap.free(ptr)){blocks.delete(ptr);return api.fail(87);}blocks.delete(ptr);return 1;
    });
    k('ExpandEnvironmentStrings'+suffix,3,(src,out,size)=>{
      if(!src)return api.fail(87);
      const text=str(src).replace(/%([^%]+)%/g,(all,key)=>p.environment.get(key.toUpperCase())??all),needed=length(text)+1;
      if(size>=needed){if(!out)return api.fail(87);write(out,text);}return needed;
    });
  }
}
