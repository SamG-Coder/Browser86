import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
const fields=['textColor','background','bkMode','x','y','pen','brush','font','fontSize','align'];
export function installDCState(gui){
  const api=gui.api,m=gui.m,g=(name,n,fn)=>api.add('gdi32.dll',name,n,fn);
  for(const [name,field,failure] of [['GetTextColor','textColor',0xffffffff],['GetBkColor','background',0xffffffff],['GetBkMode','bkMode',0],['GetTextAlign','align',0xffffffff]]){
    g(name,1,handle=>gui.dc(handle)?.[field]??failure);
  }
  g('GetCurrentObject',2,(handle,type)=>{
    const field={1:'pen',2:'brush',6:'font'}[type];
    if(!field&&![5,7,14].includes(type))return api.fail(87);
    const dc=gui.dc(handle);if(!dc)return 0;
    if(!field)throw new RuntimeFault('UNSUPPORTED_GDI','Palette, bitmap and color-space selections are not implemented.');
    return dc[field];
  });
  g('GetObjectType',1,handle=>{
    if(!handle)return api.fail(6);
    if(gui.dc(handle))return 3;
    return {pen:1,brush:2,font:6}[gui.p.object(handle,'gdi')?.kind]??0;
  });
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
