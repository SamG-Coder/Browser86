import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';
import {getFontObject} from './fonts.js';

export function installGDIObjects(gui){
  const g=(name,count,fn)=>gui.api.add('gdi32.dll',name,count,fn),m=gui.m;
  g('ExtCreatePen',5,(style,width,brush,styleCount,styles)=>{
    const type=style&0xf0000,cap=style&0xf00,join=style&0xf000,pattern=style&15;
    if((style&~0x1ff0f)||![0,0x10000].includes(type)||cap>0x200||join>0x2000||pattern>8)return gui.api.fail(87);
    if(pattern!==7&&(styleCount||styles))return gui.api.fail(87);
    if(!brush)return 0;checkBuffer(m,brush,12,'r');const brushStyle=m.u32(brush),color=m.u32(brush+4),hatch=m.u32(brush+8);
    if(type===0&&width!==1)return gui.api.fail(87);
    let dash=[];if(pattern===7){if(!styleCount)return 0;if(styleCount>16||!styles)return gui.api.fail(87);checkBuffer(m,styles,styleCount*4,'r');dash=Array.from({length:styleCount},(_,i)=>m.u32(styles+4*i));if(dash.some(n=>n>0x7fffffff)||!dash.some(n=>n))return gui.api.fail(87);if(type!==0x10000)throw new RuntimeFault('UNSUPPORTED_GDI','Cosmetic user-style pens are not implemented.');}
    if(![0,7].includes(pattern)||brushStyle!==0)throw new RuntimeFault('UNSUPPORTED_GDI','ExtCreatePen currently supports solid pens with solid brushes.');
    return gui.p.handle('gdi',{kind:'pen',extended:true,dash,style,logicalWidth:width>>>0,width:Math.max(1,width>>>0),color,hatch,geometric:type===0x10000,lineCap:['round','square','butt'][cap>>>8],lineJoin:['round','bevel','miter'][join>>>12]});
  });
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
    if(object.kind==='font')return getFontObject(gui,object,suffix==='W',count,out);
    if(object.extended){
      const dash=object.dash||[],size=24+4*dash.length;if(!out)return size;if((count>>>0)<size||(out&3))return 0;
      checkBuffer(m,out,size);[object.style,object.logicalWidth,0,object.color,object.hatch,dash.length,...dash].forEach((v,i)=>m.w32(out+i*4,v));return size;
    }
    if(!['pen','brush'].includes(object.kind))throw new RuntimeFault('UNSUPPORTED_GDI','This GDI object description is not implemented.');
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
