import {requireThat} from './errors.js';

export function installGDIPlus(api){
  const p=api.p,m=api.m,g=(name,argc,fn)=>api.add('gdiplus.dll',name,argc,fn);
  g('GdiplusStartup',3,(out,input,output)=>{
    if(!out||!input)return 2;
    if(m.u32(input)!==1)return 17;
    requireThat(!m.u32(input+8),'GDIPLUS_STARTUP','GDI+ caller-managed background notification hooks are not implemented.');
    m.w32(out,p.handle('gdiplus-token',{}));return 0;
  });
  g('GdiplusShutdown',1,token=>{if(p.object(token,'gdiplus-token'))p.releaseHandle(token);return 0;});
  g('GdipAlloc',1,size=>p.heap.alloc(size));
  g('GdipFree',1,address=>{if(address)p.heap.free(address);return 0;});
}
