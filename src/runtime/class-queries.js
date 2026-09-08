import {RuntimeFault} from './errors.js';
import {sbcsTables} from './sbcs-tables.js';
const menuBestFit=new Map(sbcsTables[1252].encode[0]);
function menuPointer(gui,cls,wide){
 if(cls.menu<65536)return cls.menu;
 const key=wide?'W':'A';cls.menuBuffers??={};
 if(cls.menuBuffers[key])return cls.menuBuffers[key];
 const text=cls.menuName,m=gui.m,pointer=gui.p.heap.alloc((text.length+1)*(wide?2:1));
 if(wide)m.string(pointer,text,true,text.length+1);
 else {for(let i=0;i<text.length;i++)m.w8(pointer+i,menuBestFit.get(text.charCodeAt(i))??63);m.w8(pointer+text.length,0);}
 cls.menuBuffers[key]=pointer;return pointer;
}
const fields=new Map([[-32,'atom'],[-26,'style'],[-20,'classExtra'],[-18,'windowExtra'],[-16,'instance'],[-14,'icon'],[-12,'cursor'],[-10,'background'],[-34,'smallIcon']]);
// Native queries hide internal style bits; setters still return the raw stored value.
const visibleClassStyles=0x37bff;
function extraLong(cls,index,size=4){let value=0;for(let i=0;i<size;i++)value|=(cls.extraBytes?.get(index+i)||0)<<(i*8);return value>>>0;}
export function installClassQueries(gui){
 const {api,p}=gui;
 for(const write of [false,true])api.add('user32.dll',write?'SetClassWord':'GetClassWord',write?3:2,(hwnd,index,value)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;if(!write&&index===-32)return cls.atom;
  if(index<0||index+2>cls.classExtra)return api.fail(1413);
  const old=extraLong(cls,index,2);
  if(write){cls.extraBytes??=new Map();cls.extraBytes.set(index,value&255);cls.extraBytes.set(index+1,(value>>>8)&255);}
  return old;
 });
 for(const wide of [false,true])api.add('user32.dll','GetClassLong'+(wide?'W':'A'),2,(hwnd,index)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;
  if(index>=0){if(index+4>cls.classExtra)return api.fail(1413);return extraLong(cls,index);}
  if(fields.has(index)){const value=cls[fields.get(index)];return index===-26?(value&visibleClassStyles):value;}
  if(index===-24){if(wide!==cls.wide)throw new RuntimeFault('UNSUPPORTED_GUI','Cross-encoding class procedure thunks are not implemented.');return cls.proc;}
  if(index===-8)return menuPointer(gui,cls,wide);
  if(index===-7)return cls.atom;
  return api.fail(1413);
 });
 for(const suffix of ['A','W'])api.add('user32.dll','SetClassLong'+suffix,3,(hwnd,index,value)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;value>>>=0;
  if(index>=0){if(index+4>cls.classExtra)return api.fail(1413);const old=extraLong(cls,index);cls.extraBytes??=new Map();for(let i=0;i<4;i++)cls.extraBytes.set(index+i,(value>>>(i*8))&255);return old;}
  if(index===-20)return api.fail(87);
  if(index===-18){const old=cls.windowExtra;cls.windowExtra=value;return old;}
  if(index===-16){const old=cls.instance;cls.instance=value;return old;}
  if(index===-12){const old=cls.cursor;cls.cursor=value&&p.object(value,'cursor')?value:0;if(value&&!cls.cursor)p.setError(1402);return old;}
  if(index===-10){const old=cls.background;cls.background=value;return old;}
  if(index===-26){if(value&0x10000)return api.fail(13);const old=cls.style;cls.style=value;return old;}
  if(index===-24){if((suffix==='W')!==cls.wide)throw new RuntimeFault('UNSUPPORTED_GUI','Cross-encoding class procedure thunks are not implemented.');const old=cls.proc;cls.proc=value;return old;}
  if(fields.has(index)||index===-24||index===-8)throw new RuntimeFault('UNSUPPORTED_GUI','This class metadata mutation is not implemented.');
  return api.fail(1413);
 });
}
