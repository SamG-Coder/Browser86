import {ansiDecode} from './memory.js';
import {ordinalUpper} from './ordinal-table.js';
import {RuntimeFault} from './errors.js';
export function installWindowProperties(gui){
 const {api,m}=gui,u=(n,c,f)=>api.add('user32.dll',n,c,f);
 const key=(pointer,wide)=>{
  pointer>>>=0;if(pointer<65536)return {value:pointer};
  const units=[];let ended=false;
  for(let i=0;i<=255;i++){const c=wide?m.u16(pointer+i*2):m.u8(pointer+i);if(!c){ended=true;break;}units.push(c);}
  if(!ended)return {error:87};if(!units.length)return {error:123};
  const text=wide?String.fromCharCode(...units):ansiDecode(units);
  if(/^#[0-9]+$/.test(text)){const n=Number(text.slice(1));return n>0&&n<0xc000?{value:n}:{error:87};}
  return {text,value:Array.from({length:text.length},(_,i)=>String.fromCharCode(ordinalUpper.get(text.charCodeAt(i))??text.charCodeAt(i))).join('')};
 };
 for(const wide of [false,true])for(const op of ['Set','Get','Remove'])u(op+'Prop'+(wide?'W':'A'),op==='Set'?3:2,(h,name,data)=>{
  const w=gui.window(h);if(!w)return api.fail(1400);const k=key(name,wide);if(k.error)return api.fail(k.error);
  if(k.value===0)return op==='Set'?api.fail(87):0;
  if(op==='Set'){
   w.properties??=new Map();if(!w.properties.has(k.value)&&w.properties.size>=4096)throw new RuntimeFault('GUI_LIMIT','Too many window properties.');
   if(typeof k.value==='string'){
    w.propertyNames??=new Map();if(!w.propertyNames.has(k.value)){const existing=[...gui.windows.values()].find(other=>other.propertyNames?.has(k.value));w.propertyNames.set(k.value,existing?.propertyNames.get(k.value)??k.text);}
   }
   w.properties.set(k.value,data>>>0);return 1;
  }
  if(typeof k.value==='string'&&![...gui.windows.values()].some(other=>other.properties?.has(k.value)))return api.fail(2);
  const value=w.properties?.get(k.value)??0;if(op==='Remove'){w.properties?.delete(k.value);w.propertyNames?.delete(k.value);}return value;
 });
 for(const wide of [false,true])for(const extended of [false,true])u('EnumProps'+(extended?'Ex':'')+(wide?'W':'A'),extended?3:2,(h,callback,param)=>{
  const w=gui.window(h);if(!w)return api.fail(1400,-1);
  const entries=[...(w.properties||[])].map(([key,data])=>({key,data,name:w.propertyNames?.get(key)??key}));
  if(!entries.length)return -1;if(!callback)throw new RuntimeFault('CALLBACK_POINTER','Window property enumeration requires a callback.');
  let i=0;const next=last=>{
   if(i===entries.length)return last;const entry=entries[i++];let name=entry.key,allocated=0;
   if(typeof name==='string'){allocated=api.p.heap.alloc((entry.name.length+1)*(wide?2:1));name=allocated;m.string(name,entry.name,wide,entry.name.length+1);}
   const args=[h,name,entry.data];if(extended)args.push(param>>>0);
   return api.p.call(callback,args,result=>{if(allocated)api.p.heap.free(allocated);return (result>>>0)===0?0:next(result|0);});
  };return next(-1);
 });
}
