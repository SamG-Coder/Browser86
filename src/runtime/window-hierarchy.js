import {RuntimeFault} from './errors.js';
export function childRoot(gui,h){
 let w=gui.window(h);const seen=new Set();
 while(w?.style&0x40000000){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);const parent=gui.window(w.parent);if(!parent)break;w=parent;}
 return w?.hwnd||0;
}
export function installWindowHierarchy(gui){
 const {api}=gui,u=(n,c,f)=>api.add('user32.dll',n,c,f);
 u('GetParent',1,h=>{const w=gui.window(h);if(!w)return api.fail(1400);return w.style&0xc0000000?w.parent||0:0;});
 u('IsChild',2,(parent,child)=>{
  if(!gui.window(parent)||!gui.window(child))return api.fail(1400);
  const seen=new Set();let w=gui.window(child);
  while(w?.style&0x40000000){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);if(w.parent===(parent>>>0))return 1;w=gui.window(w.parent);}
  return 0;
 });
}
