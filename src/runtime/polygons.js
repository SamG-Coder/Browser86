import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';

export function installPolygons(gui){
  const g=(name,n,fn)=>gui.api.add('gdi32.dll',name,n,fn);
  g('GetPolyFillMode',1,h=>gui.dc(h)?.polyFillMode??0);
  g('SetPolyFillMode',2,(h,mode)=>{const dc=gui.dc(h);if(!dc)return gui.api.fail(6);const old=dc.polyFillMode;dc.polyFillMode=mode|0;return old;});
  g('PolylineTo',3,(h,input,count)=>{
    const dc=gui.dc(h);if(!dc)return gui.api.fail(6);count>>>=0;
    if(!count)return 1;if(!input)return 0;
    if(count>1048576)throw new RuntimeFault('GDI_LIMIT','Polyline point count exceeds the runtime limit.');
    checkBuffer(gui.m,input,count*8,'r');const points=[[dc.x,dc.y]];
    for(let i=0;i<count;i++)points.push([gui.m.i32(input+i*8),gui.m.i32(input+i*8+4)]);
    const result=gui.draw(h,{op:'polyline',points,pen:gui.drawingObject(dc,dc.pen),brush:null});
    if(result)[dc.x,dc.y]=points.at(-1);return result;
  });
  for(const closed of [false,true])g(closed?'Polygon':'Polyline',3,(h,input,count)=>{
    const dc=gui.dc(h);if(!dc)return gui.api.fail(6);
    count|=0;if(count<0||!input)return 0;if(count<2)return gui.api.fail(87);
    if(count>1048576)throw new RuntimeFault('GDI_LIMIT','Polygon point count exceeds the runtime limit.');
    checkBuffer(gui.m,input,count*8,'r');const points=Array.from({length:count},(_,i)=>[gui.m.i32(input+i*8),gui.m.i32(input+i*8+4)]);
    return gui.draw(h,{op:closed?'polygon':'polyline',points,fillMode:dc.polyFillMode,pen:gui.drawingObject(dc,dc.pen),brush:closed?gui.drawingObject(dc,dc.brush):null});
  });
}
