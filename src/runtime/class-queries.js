import {RuntimeFault} from './errors.js';
const fields=new Map([[-32,'atom'],[-26,'style'],[-20,'classExtra'],[-18,'windowExtra'],[-16,'instance'],[-14,'icon'],[-12,'cursor'],[-10,'background'],[-34,'smallIcon']]);
export function installClassQueries(gui){
 const {api,p}=gui;
 for(const wide of [false,true])api.add('user32.dll','GetClassLong'+(wide?'W':'A'),2,(hwnd,index)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);
  const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class metadata is not implemented.');
  index|=0;
  if(index>=0){if(index+4>cls.classExtra)return api.fail(1413);return 0;}
  if(fields.has(index)){const value=cls[fields.get(index)];return index===-16?(value||p.main.base):value;}
  if(index===-24){if(wide!==cls.wide)throw new RuntimeFault('UNSUPPORTED_GUI','Cross-encoding class procedure thunks are not implemented.');return cls.proc;}
  if(index===-8){if(cls.menu>=65536)throw new RuntimeFault('UNSUPPORTED_GUI','Class menu string pointer lifetime is not implemented.');return cls.menu;}
  if(index===-7)return cls.atom;
  return api.fail(1413);
 });
}
