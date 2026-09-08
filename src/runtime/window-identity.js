import {checkBuffer} from './files.js';
export function installWindowIdentity(gui){
 const {api,m}=gui;
 api.add('user32.dll','IsWindowUnicode',1,h=>{const w=gui.window(h);return w?(w.wide?1:0):api.fail(1400);});
 api.add('user32.dll','GetWindowThreadProcessId',2,(h,out)=>{
  if(!gui.window(h))return api.fail(1400);
  // Every guest HWND currently belongs to the runtime's one process and thread.
  if(out){checkBuffer(m,out,4);m.w32(out,api.lookup('kernel32.dll','GetCurrentProcessId').fn());}
  return api.lookup('kernel32.dll','GetCurrentThreadId').fn();
 });
}
