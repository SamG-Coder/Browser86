import {checkBuffer} from './files.js';
import {RuntimeFault} from './errors.js';

export function installGDIObjects(gui){
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
