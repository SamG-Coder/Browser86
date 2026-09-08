import {RuntimeFault} from './errors.js';
import {setKeyboardFocus} from './window-focus.js';
export function installWindowState(gui){
 const {api,p}=gui,u=(n,c,f)=>api.add('user32.dll',n,c,f);
 u('IsWindowEnabled',1,h=>{const w=gui.window(h);return w?(w.style&0x08000000?0:1):api.fail(1400);});
 u('IsWindowVisible',1,h=>{
  let w=gui.window(h);if(!w)return api.fail(1400);const seen=new Set();
  while(w){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);if(!(w.style&0x10000000))return 0;if(!(w.style&0x40000000))return 1;w=gui.window(w.parent);}
  return 0;
 });
 u('EnableWindow',2,(h,enabled)=>{
  const w=gui.window(h);if(!w)return api.fail(1400);enabled=!!enabled;const wasDisabled=!!(w.style&0x08000000);
  const change=()=>{
   if(!gui.window(h))return wasDisabled?1:0;
   const changed=!!(w.style&0x08000000)===enabled;
   w.style=(enabled?w.style&~0x08000000:w.style|0x08000000)>>>0;w.enabled=enabled;
   if(changed){gui.notify(w);if(w.proc)return p.call(w.proc,[h,10,enabled?1:0,0],()=>wasDisabled?1:0);}
   return wasDisabled?1:0;
  };
  const cancelled=()=>!enabled&&gui.focus===h?setKeyboardFocus(gui,0,change):change();
  return !enabled&&w.proc?p.call(w.proc,[h,31,0,0],cancelled):cancelled();
 });
}
