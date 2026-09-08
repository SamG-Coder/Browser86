import {checkBuffer} from './files.js';

export function installRectangleDrawing(gui){
  gui.api.add('user32.dll','InvertRect',2,(handle,rect)=>{
    checkBuffer(gui.m,rect,16,'r');const [l,t,r,b]=[0,4,8,12].map(i=>gui.m.i32(rect+i));
    if(!gui.dc(handle))return gui.api.fail(6);if(l!==r&&t!==b)gui.draw(handle,{op:'invert',x:Math.min(l,r),y:Math.min(t,b),width:Math.abs(r-l),height:Math.abs(b-t)});return 1;
  });
  for(const frame of [false,true])gui.api.add('user32.dll',frame?'FrameRect':'FillRect',3,(handle,rect,brush)=>{
    checkBuffer(gui.m,rect,16,'r');const [left,top,right,bottom]=[0,4,8,12].map(i=>gui.m.i32(rect+i));
    if(frame&&(right<left||bottom<top))return 0;
    const dc=gui.dc(handle);if(!dc)return frame?0:gui.api.fail(6);
    let object=gui.drawingObject(dc,brush);
    if(!frame&&brush>0&&brush<=31)object={kind:'brush',color:gui.api.lookup('user32.dll','GetSysColor').fn(brush-1)};
    if(object?.kind!=='brush')object=gui.drawingObject(dc,dc.brush);
    if(object?.null)return 1;
    const fill=(x,y,width,height)=>{
      if(!width||!height)return;
      if(width<0){x+=width;width=-width;}if(height<0){y+=height;height=-height;}
      gui.draw(handle,{op:'fill',x,y,width,height,color:object.color});
    };
    const width=(right-left)|0,height=(bottom-top)|0;
    if(frame){fill(left,top,width,1);fill(left,bottom-1,width,1);fill(left,top+1,1,(height-2)|0);fill(right-1,top+1,1,(height-2)|0);}
    else fill(left,top,width,height);
    return 1;
  });
}
