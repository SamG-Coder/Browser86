import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';

export function installGDIObjects(gui){
  const g=(name,count,fn)=>gui.api.add('gdi32.dll',name,count,fn),m=gui.m;
  const createPen=(style,width,color)=>{
    // CreatePen normalizes unrecognized styles to PS_SOLID.
    style>>>=0;if(style>6)style=0;
    if(style!==0&&style!==5)throw new RuntimeFault('UNSUPPORTED_GDI','Dashed, dotted and inside-frame pens are not implemented.');
    const logicalWidth=style===5?1:Math.abs(width|0);
    return gui.p.handle('gdi',{kind:'pen',color:style===5?0:color,logicalWidth,width:Math.max(1,logicalWidth),null:style===5});
  };
  g('CreatePen',3,createPen);
  g('CreatePenIndirect',1,input=>{
    checkBuffer(m,input,16,'r');return createPen(m.u32(input),m.i32(input+4),m.u32(input+12));
  });
  g('CreateBrushIndirect',1,input=>{
    checkBuffer(m,input,12,'r');const style=m.u32(input),color=m.u32(input+4);
    if(style>9)return 0;
    if(style>1)throw new RuntimeFault('UNSUPPORTED_GDI','Hatched, pattern and DIB brushes are not implemented.');
    return gui.p.handle('gdi',{kind:'brush',color:style===1?0:color,null:style===1});
  });
  for(const suffix of ['A','W'])gui.api.add('gdi32.dll','GetObject'+suffix,3,(handle,count,out)=>{
    const object=gui.p.object(handle,'gdi');if(!object)return 0;
    if(!['pen','brush'].includes(object.kind))throw new RuntimeFault('UNSUPPORTED_GDI','GetObject currently supports pens and brushes; font descriptions are not implemented.');
    const pen=object.kind==='pen',size=pen?16:12;
    if(!out)return size;
    count>>>=0;if((out&3)||!count||(pen&&count<size))return 0;
    const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
    view.setUint32(0,object.null?(pen?5:1):0,true);
    if(pen){view.setUint32(4,object.logicalWidth??object.width,true);view.setUint32(12,object.null?0:object.color,true);}
    else view.setUint32(4,object.null?0:object.color,true);
    const copied=Math.min(count,size);checkBuffer(gui.m,out,copied);gui.m.write(out,bytes.subarray(0,copied));return size;
  });
}
