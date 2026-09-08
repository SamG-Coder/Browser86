import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
const fields=['clipRegion','brushOrgX','brushOrgY','miterLimitBits','polyFillMode','textColor','background','bkMode','x','y','pen','brush','font','fontSize','align','dcPenColor','dcBrushColor'];
export function installDCState(gui){
  const api=gui.api,m=gui.m,g=(name,n,fn)=>api.add('gdi32.dll',name,n,fn);
  g('GetBrushOrgEx',2,(handle,out)=>{
    const dc=gui.dc(handle);if(!dc||!out)return api.fail(87);
    checkBuffer(m,out,8);m.w32(out,dc.brushOrgX);m.w32(out+4,dc.brushOrgY);return 1;
  });
  g('SetBrushOrgEx',4,(handle,x,y,out)=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(6);
    if(out){checkBuffer(m,out,8);m.w32(out,dc.brushOrgX);m.w32(out+4,dc.brushOrgY);}
    dc.brushOrgX=x|0;dc.brushOrgY=y|0;return 1;
  });
  g('GetMiterLimit',2,(handle,out)=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(87);if(!out)return 0;
    checkBuffer(m,out,4);m.w32(out,dc.miterLimitBits);return 1;
  });
  g('SetMiterLimit',3,(handle,bits,out)=>{
    const dc=gui.dc(handle);if(!dc)return api.fail(6);
    const view=new DataView(new ArrayBuffer(4));view.setUint32(0,bits,true);
    if(view.getFloat32(0,true)<1)return api.fail(87);
    if(out){checkBuffer(m,out,4);m.w32(out,dc.miterLimitBits);}dc.miterLimitBits=bits>>>0;return 1;
  });
  for(const [kind,field] of [['Pen','dcPenColor'],['Brush','dcBrushColor']]){
    g('GetDC'+kind+'Color',1,handle=>{const dc=gui.dc(handle);return dc?dc[field]:api.fail(87,0xffffffff);});
    g('SetDC'+kind+'Color',2,(handle,color)=>{const dc=gui.dc(handle);if(!dc)return api.fail(87,0xffffffff);const old=dc[field];dc[field]=color>>>0;return old;});
  }
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
    if(gui.p.object(handle,'gdi')?.extended)return 11;
    return {pen:1,brush:2,font:6,region:8}[gui.p.object(handle,'gdi')?.kind]??0;
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
