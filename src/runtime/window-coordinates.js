import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
export function windowOrigin(gui,h){
  let w=gui.window(h);if(!w)return null;let x=0,y=0;const seen=new Set();
  while(w){if(seen.has(w.hwnd))throw new RuntimeFault('WINDOW_HIERARCHY','Cyclic window ancestry.');seen.add(w.hwnd);if(w.exStyle&0x400000)throw new RuntimeFault('UNSUPPORTED_GUI','Mirrored coordinate mapping is not implemented.');x=(x+w.x)|0;y=(y+w.y)|0;if(!(w.style&0x40000000))break;w=gui.window(w.parent);}
  return [x,y];
}
export function installWindowCoordinates(gui){
 const {api,m}=gui,u=(n,c,f)=>api.add('user32.dll',n,c,f);
 const origin=h=>windowOrigin(gui,h);
 u('GetWindowPlacement',2,(h,out)=>{const w=gui.window(h);if(!w)return api.fail(1400);if(!out||m.u32(out)!==44)return api.fail(87);checkBuffer(m,out,44);m.fill(out,44,0);m.w32(out,44);m.w32(out+8,w.visible?1:0);m.w32(out+12,0xffffffff);m.w32(out+16,0xffffffff);m.w32(out+20,0xffffffff);m.w32(out+24,0xffffffff);[w.x,w.y,w.x+w.width,w.y+w.height].forEach((v,i)=>m.w32(out+28+i*4,v));return 1;});
 for(const screen of [false,true])u(screen?'GetWindowRect':'GetClientRect',2,(h,out)=>{
  const w=gui.window(h);if(!w||!out)return api.fail(1400);
  const [x,y]=screen?origin(h):[0,0];checkBuffer(m,out,16);
  [x,y,x+w.width,y+w.height].forEach((v,i)=>m.w32(out+i*4,v));return 1;
 });
 const translate=(input,count,dx,dy)=>{if(count>1048576)throw new RuntimeFault('GUI_LIMIT','Too many points to map.');if(!count)return;checkBuffer(m,input,count*8,'r');checkBuffer(m,input,count*8);for(let i=0;i<count;i++){const p=input+i*8;m.w32(p,m.i32(p)+dx);m.w32(p+4,m.i32(p+4)+dy);}};
 for(const inverse of [false,true])u(inverse?'ScreenToClient':'ClientToScreen',2,(h,input)=>{const o=origin(h);if(!o||!input)return api.fail(1400);translate(input,1,o[0]*(inverse?-1:1),o[1]*(inverse?-1:1));return 1;});
 u('MapWindowPoints',4,(from,to,input,count)=>{const a=from?origin(from):[0,0],b=to?origin(to):[0,0];if(!a||!b)return api.fail(1400);const dx=(a[0]-b[0])|0,dy=(a[1]-b[1])|0;translate(input,count>>>0,dx,dy);return ((dx&65535)|((dy&65535)<<16))>>>0;});
}
