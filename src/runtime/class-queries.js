import {RuntimeFault} from './errors.js';
const fields=new Map([[-32,'atom'],[-26,'style'],[-20,'classExtra'],[-18,'windowExtra'],[-16,'instance'],[-14,'icon'],[-12,'cursor'],[-10,'background'],[-34,'smallIcon']]);
function extraLong(cls,index){let value=0;for(let i=0;i<4;i++)value|=(cls.extraBytes?.get(index+i)||0)<<(i*8);return value>>>0;}
export function installClassQueries(gui){
 const {api,p}=gui;
 for(const wide of [false,true])api.add('user32.dll','GetClassLong'+(wide?'W':'A'),2,(hwnd,index)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;
  if(index>=0){if(index+4>cls.classExtra)return api.fail(1413);return extraLong(cls,index);}
  if(fields.has(index)){const value=cls[fields.get(index)];return index===-16?(value||p.main.base):value;}
  if(index===-24){if(wide!==cls.wide)throw new RuntimeFault('UNSUPPORTED_GUI','Cross-encoding class procedure thunks are not implemented.');return cls.proc;}
  if(index===-8){if(cls.menu>=65536)throw new RuntimeFault('UNSUPPORTED_GUI','Class menu string pointer lifetime is not implemented.');return cls.menu;}
  if(index===-7)return cls.atom;
  return api.fail(1413);
 });
 for(const suffix of ['A','W'])api.add('user32.dll','SetClassLong'+suffix,3,(hwnd,index,value)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;value>>>=0;
  if(index>=0){if(index+4>cls.classExtra)return api.fail(1413);const old=extraLong(cls,index);cls.extraBytes??=new Map();for(let i=0;i<4;i++)cls.extraBytes.set(index+i,(value>>>(i*8))&255);return old;}
  if(index===-10){const old=cls.background;cls.background=value;return old;}
  if(fields.has(index)||index===-24||index===-8)throw new RuntimeFault('UNSUPPORTED_GUI','This class metadata mutation is not implemented.');
  return api.fail(1413);
 });
}
