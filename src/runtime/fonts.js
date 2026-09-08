import {ansiDecode} from './memory.js';
import {sbcsTables} from './sbcs-tables.js';
import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
const ansiBestFit=new Map(sbcsTables['1252'].encode[0]);
// Windows converts each UTF-16 unit independently, including surrogate pairs.
function ansiFontName(face){return Uint8Array.from({length:face.length},(_,i)=>ansiBestFit.get(face.charCodeAt(i))??63);}

function faceOf(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let face='';for(let i=28;i<92;i+=2){const c=view.getUint16(i,true);if(!c)break;face+=String.fromCharCode(c);}return face;}
function putFace(bytes,face){const view=new DataView(bytes.buffer);for(let i=0;i<Math.min(32,face.length);i++)view.setUint16(28+i*2,face.charCodeAt(i),true);}
export function fontDescription(object){
  if(object.logfont)return object.logfont;
  const bytes=new Uint8Array(92),view=new DataView(bytes.buffer);view.setInt32(0,object.height||0,true);view.setInt32(16,object.weight||0,true);putFace(bytes,object.face||'');return bytes;
}
export function getFontObject(gui,object,wide,count,out){
  const size=wide?92:60;if(!out)return size;count>>>=0;
  if(!count||(wide&&(out&1)))return 0;
  if(count>size)throw new RuntimeFault('UNSUPPORTED_GDI','Extended logical font descriptions are not implemented.');
  const source=fontDescription(object);let bytes=source,copied=count;
  if(!wide){bytes=new Uint8Array(60);bytes.set(source.subarray(0,28));const name=ansiFontName(faceOf(source));bytes.set(name.subarray(0,32),28);if(count===60)copied=28+Math.min(32,name.length+1);}
  checkBuffer(gui.m,out,copied);gui.m.write(out,bytes.subarray(0,copied));return count;
}
export function installFonts(gui){
  const m=gui.m,create=bytes=>{
    const v=new DataView(bytes.buffer),face=faceOf(bytes);
    return gui.p.handle('gdi',{kind:'font',logfont:bytes,height:v.getInt32(0,true),weight:v.getInt32(16,true),italic:!!bytes[20],face});
  };
  for(const wide of [false,true]){
    const suffix=wide?'W':'A';
    gui.api.add('gdi32.dll','CreateFontIndirect'+suffix,1,input=>{
      if(!input)return 0;checkBuffer(m,input,wide?92:60,'r');const bytes=new Uint8Array(92);
      for(let i=0;i<(wide?92:28);i++)bytes[i]=m.u8(input+i);
      if(!wide){const name=[];for(let i=0;i<31;i++){const c=m.u8(input+28+i);if(!c)break;name.push(c);}putFace(bytes,ansiDecode(name));}
      return create(bytes);
    });
    gui.api.add('gdi32.dll','CreateFont'+suffix,14,(...args)=>{
      const bytes=new Uint8Array(92),v=new DataView(bytes.buffer);for(let i=0;i<5;i++)v.setInt32(i*4,args[i],true);for(let i=0;i<8;i++)bytes[20+i]=args[5+i];
      const ptr=args[13];let face='';if(ptr){const chars=[];for(let i=0;i<31;i++){const c=wide?m.u16(ptr+2*i):m.u8(ptr+i);if(!c)break;chars.push(c);}face=wide?String.fromCharCode(...chars):ansiDecode(chars);}putFace(bytes,face);return create(bytes);
    });
  }
}
