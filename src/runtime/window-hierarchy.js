import {RuntimeFault} from './errors.js';
export function childRoot(gui,h){
 let w=gui.window(h);const seen=new Set();
 while(w?.style&0x40000000){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);const parent=gui.window(w.parent);if(!parent)break;w=parent;}
 return w?.hwnd||0;
}
export function setWindowOwner(gui,w,owner){
 owner>>>=0;
 if(w.style&0x40000000)throw new RuntimeFault('UNSUPPORTED_GUI','Child-window reparenting through SetWindowLong is not implemented.');
 if(owner&&(owner===w.hwnd||!gui.window(owner)))return gui.api.fail(87);
 const seen=new Set([w.hwnd]);let ancestor=gui.window(owner);
 while(ancestor){if(seen.has(ancestor.hwnd))throw new RuntimeFault('UNSUPPORTED_GUI','Cyclic window ownership is not implemented.');seen.add(ancestor.hwnd);ancestor=gui.window(ancestor.parent);}
 const old=w.parent;w.parent=owner;if(old!==owner)gui.notify(w);
 if(!owner)gui.p.setError(1400);return old;
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
