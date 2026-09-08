import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';

export function installPolygons(gui){
  const g=(name,n,fn)=>gui.api.add('gdi32.dll',name,n,fn);
  for(const to of [false,true])g(to?'PolyBezierTo':'PolyBezier',3,(h,input,count)=>{
    const dc=gui.dc(h);if(!dc)return gui.api.fail(6);count>>>=0;
    if(count<(to?3:4)||(count-(to?0:1))%3)return gui.api.fail(87);
    if(!input)return 0;if(count>1048576)throw new RuntimeFault('GDI_LIMIT','Bezier point count exceeds the runtime limit.');
    checkBuffer(gui.m,input,count*8,'r');const points=to?[[dc.x,dc.y]]:[];
    for(let i=0;i<count;i++)points.push([gui.m.i32(input+i*8),gui.m.i32(input+i*8+4)]);
    const result=gui.draw(h,{op:'bezier',points,pen:gui.drawingObject(dc,dc.pen)});if(to&&result)[dc.x,dc.y]=points.at(-1);return result;
  });
  g('GetPolyFillMode',1,h=>gui.dc(h)?.polyFillMode??0);
  for(const closed of [false,true])g(closed?'PolyPolygon':'PolyPolyline',4,(h,input,countsAddress,groups)=>{
    const dc=gui.dc(h);if(!dc)return gui.api.fail(6);groups=closed?groups|0:groups>>>0;
    if(groups<0)return gui.api.fail(87);
    if(!groups||!input||!countsAddress)return 0;
    if(groups>524288)throw new RuntimeFault('GDI_LIMIT','Polyline group count exceeds the runtime limit.');
    checkBuffer(gui.m,countsAddress,groups*4,'r');const counts=[];let total=0;
    for(let i=0;i<groups;i++){const count=closed?gui.m.i32(countsAddress+i*4):gui.m.u32(countsAddress+i*4);if(count<0)return 0;if(count<2)return gui.api.fail(87);total+=count;counts.push(count);}
    if(total>1048576)throw new RuntimeFault('GDI_LIMIT','Polyline point count exceeds the runtime limit.');
    checkBuffer(gui.m,input,total*8,'r');let offset=0;const paths=counts.map(count=>Array.from({length:count},()=>{const point=[gui.m.i32(input+offset),gui.m.i32(input+offset+4)];offset+=8;return point;}));
    const pen=gui.drawingObject(dc,dc.pen);
    if(closed)return gui.draw(h,{op:'polypolygon',paths,pen,brush:gui.drawingObject(dc,dc.brush),fillMode:dc.polyFillMode});
    for(const points of paths)gui.draw(h,{op:'polyline',points,pen,brush:null});return 1;
  });
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
