import {requireThat} from './errors.js';

export function installBufferedPaint(api){
  const p=api.p,m=api.m,gui=api.gui,u=(n,a,f)=>api.add('uxtheme.dll',n,a,f);let references=0;
  u('BufferedPaintInit',0,()=>{references++;return 0;});
  u('BufferedPaintUnInit',0,()=>{if(!references)return 0x80004005;references--;return 0;});
  u('BeginBufferedPaint',5,(target,rect,format,params,out)=>{
    if(out)m.w32(out,0);if(!references||!gui.dc(target)||!rect||!out)return 0;
    requireThat(format===0&&!params,'BUFFERED_PAINT','Only compatible bitmap buffers without custom paint parameters are implemented.');
    const bounds=[m.i32(rect),m.i32(rect+4),m.i32(rect+8),m.i32(rect+12)];if(bounds[2]<=bounds[0]||bounds[3]<=bounds[1])return 0;
    const dc=gui.newDC(gui.dc(target).hwnd),object=gui.dc(dc);object.bufferedCommands=[];object.clipRegion={rect:bounds};
    const handle=p.handle('paint-buffer',{target,dc});m.w32(out,dc);return handle;
  });
  u('EndBufferedPaint',2,(handle,update)=>{const buffer=p.object(handle,'paint-buffer');if(!buffer)return 0x80070057;const commands=gui.dc(buffer.dc).bufferedCommands;if(update)for(const command of commands)gui.draw(buffer.target,command);p.releaseHandle(buffer.dc);p.releaseHandle(handle);return 0;});
}
