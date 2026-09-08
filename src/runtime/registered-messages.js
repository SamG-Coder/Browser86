import {ansiDecode} from './memory.js';
import {ordinalUpper} from './ordinal-table.js';
export function installRegisteredMessages(api){
 const names=new Map();let next=0xc000;
 for(const wide of [false,true])api.add('user32.dll','RegisterWindowMessage'+(wide?'W':'A'),1,pointer=>{
  if(!pointer)return api.fail(87);const units=[];let ended=false;
  for(let i=0;i<=255;i++){const c=wide?api.m.u16(pointer+i*2):api.m.u8(pointer+i);if(!c){ended=true;break;}units.push(c);}
  if(!ended)return api.fail(234);if(!units.length)return 0;
  const text=wide?String.fromCharCode(...units):ansiDecode(units);
  if(/^#[0-9]+$/.test(text)){const value=Number(text.slice(1));return value>0&&value<0xc000?value:api.fail(87);}
  const key=Array.from({length:text.length},(_,i)=>String.fromCharCode(ordinalUpper.get(text.charCodeAt(i))??text.charCodeAt(i))).join('');
  if(names.has(key))return names.get(key);if(next>0xffff)return api.fail(8);const id=next++;names.set(key,id);return id;
 });
}
