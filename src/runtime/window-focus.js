import {RuntimeFault} from './errors.js';
export function setKeyboardFocus(gui,h,done=value=>value){
 h>>>=0;const old=gui.focus;
 if(h){let w=gui.window(h);if(!w)return done(gui.api.fail(1400));const seen=new Set();
  while(w){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);if(w.style&0x08000000)return done(gui.api.fail(87));if(!(w.style&0x40000000))break;w=gui.window(w.parent);}
 }
 if(old===h)return done(old);gui.focus=h;
 const gained=()=>{const target=gui.window(h);return gui.focus===h&&target?.proc?gui.p.call(target.proc,[h,7,old,0],()=>done(old)):done(old);};
 const previous=gui.window(old);return previous?.proc?gui.p.call(previous.proc,[old,8,h,0],gained):gained();
}
export function installWindowFocus(gui){
 gui.api.add('user32.dll','SetFocus',1,h=>setKeyboardFocus(gui,h));
 gui.api.add('user32.dll','GetFocus',0,()=>gui.focus);
}
