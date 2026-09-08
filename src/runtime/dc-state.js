import {checkBuffer} from './files.js';
const fields=['textColor','background','bkMode','x','y','pen','brush','font','fontSize','align'];
export function installDCState(gui){
  const api=gui.api,m=gui.m,g=(name,n,fn)=>api.add('gdi32.dll',name,n,fn);
  g('SaveDC',1,handle=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(6);
    const stack=dc.savedStates??=[];stack.push(Object.fromEntries(fields.map(key=>[key,dc[key]])));return stack.length;
  });
  g('RestoreDC',2,(handle,level)=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(6);level|=0;
    const stack=dc.savedStates||[],index=level<0?stack.length+level:level-1;
    if(!level||index<0||index>=stack.length)return api.fail(87);
    Object.assign(dc,stack[index]);stack.length=index;return 1;
  });
  g('GetCurrentPositionEx',2,(handle,out)=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(6);if(!out)return api.fail(87);
    checkBuffer(m,out,8);m.w32(out,dc.x);m.w32(out+4,dc.y);return 1;
  });
}
export function dcSelectsObject(dc,handle){return [dc,...(dc.savedStates||[])].some(state=>[state.pen,state.brush,state.font].includes(handle));}
