import {ansiDecode} from './memory.js';
import {ordinalUpper} from './ordinal-table.js';
import {sbcsTables} from './sbcs-tables.js';
import {checkBuffer} from './files.js';
const ansiBestFit=new Map(sbcsTables[1252].encode[0]);
export function installLocalAtoms(api){installAtomTable(api,false);}
export function installGlobalAtoms(api){installAtomTable(api,true);}
function installAtomTable(api,global){
 const {m}=api,atoms=new Map(),names=new Map(),k=(n,c,f)=>api.add('kernel32.dll',(global?'Global':'')+n,c,f);
 // JavaScript Map manages buckets; this Windows sizing hint never resets entries.
 if(!global)k('InitAtomTable',1,()=>1);
 const read=(pointer,wide,add)=>{
  pointer>>>=0;if(pointer<65536)return pointer<0xc000?{integer:pointer}:{error:87};
  const units=[];let ended=false;for(let i=0;i<=255;i++){const c=wide?m.u16(pointer+i*2):m.u8(pointer+i);if(!c){ended=true;break;}units.push(c);}
  if(!ended)return {error:add||global?87:2};if(!units.length)return {error:123};
  const text=wide?String.fromCharCode(...units):ansiDecode(units);
  if(/^#[0-9]+$/.test(text)){const n=Number(text.slice(1));return n>0&&n<0xc000?{integer:n}:{error:87};}
  const key=Array.from({length:text.length},(_,i)=>String.fromCharCode(ordinalUpper.get(text.charCodeAt(i))??text.charCodeAt(i))).join('');return {text,key};
 };
 const addName=name=>{
  if(name.integer!==undefined)return name.integer;
  const existing=names.get(name.key);if(existing){if(!existing.pinned){if(existing.refs===65535)existing.pinned=true;else existing.refs++;}return existing.id;}
  let id=0xc000;while(atoms.has(id)&&id<=0xffff)id++;if(id>0xffff)return api.fail(8);
  const atom={id,key:name.key,text:name.text,refs:1};atoms.set(id,atom);names.set(name.key,atom);return id;
 };
 const drop=id=>{id&=65535;if(id<0xc000)return 0;const atom=atoms.get(id);if(!atom)return api.fail(6);if(!atom.pinned&&--atom.refs===0){atoms.delete(id);names.delete(atom.key);}return 0;};
 if(global)api.globalAtoms={atoms,names,read,add:addName,drop};
 for(const wide of [false,true]){
  for(const add of [false,true])k((add?'Add':'Find')+'Atom'+(wide?'W':'A'),1,pointer=>{
   const name=read(pointer,wide,add);if(name.error)return api.fail(name.error);if(name.integer!==undefined)return name.integer;
   return add?addName(name):names.get(name.key)?.id??api.fail(2);
  });
  k('GetAtomName'+(wide?'W':'A'),3,(id,out,size)=>{
   id&=65535;size>>>=0;if(!size)return api.fail(234);if(!id)return api.fail(87);
   const text=id<0xc000?'#'+id:atoms.get(id)?.text;if(text===undefined)return api.fail(6);
   if(global){const count=Math.min(text.length,wide?size:size-1),terminate=count<size;checkBuffer(m,out,(count+(terminate?1:0))*(wide?2:1));for(let i=0;i<count;i++)if(wide)m.w16(out+i*2,text.charCodeAt(i));else m.w8(out+i,ansiBestFit.get(text.charCodeAt(i))??63);if(terminate){if(wide)m.w16(out+count*2,0);else m.w8(out+count,0);}return !wide&&text.length>=size?api.fail(234):count;}
   if(size===1)return api.fail(122);
   const count=Math.min(text.length,size-1);checkBuffer(m,out,(count+1)*(wide?2:1));
   for(let i=0;i<count;i++)if(wide)m.w16(out+i*2,text.charCodeAt(i));else m.w8(out+i,ansiBestFit.get(text.charCodeAt(i))??63);
   if(wide)m.w16(out+count*2,0);else m.w8(out+count,0);return count;
  });
 }
 k('DeleteAtom',1,drop);
}
