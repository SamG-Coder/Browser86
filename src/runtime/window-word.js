import {RuntimeFault} from './errors.js';
export function installWindowWord(gui){
 const {api}=gui;
 for(const write of [false,true])api.add('user32.dll',write?'SetWindowWord':'GetWindowWord',write?3:2,(hwnd,index,value)=>{
  const w=gui.window(hwnd);if(!w)return api.fail(1400);index|=0;
  if(index>=0)return gui.windowExtra(w,index,write?(value&65535):undefined,2);
  if(index===-21){const old=(w.userData||0)&65535;if(write)w.userData=(((w.userData||0)&0xffff0000)|(value&65535))>>>0;return old;}
  if([-6,-8,-12].includes(index)||(write&&index===-16))throw new RuntimeFault('UNSUPPORTED_GUI','Legacy WORD window metadata translation is not implemented.');
  return api.fail(1413);
 });
}
