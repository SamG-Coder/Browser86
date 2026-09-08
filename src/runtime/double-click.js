export function installDoubleClick(gui){
 gui.doubleClickTime=500;gui.lastClick=null;
 gui.api.add('user32.dll','GetDoubleClickTime',0,()=>gui.doubleClickTime);
 gui.api.add('user32.dll','SetDoubleClickTime',1,value=>{gui.doubleClickTime=Math.min((value>>>0)||500,5000);return 1;});
}
export function classifyClick(gui,event,target,message,x,y){
 const previous=gui.lastClick,button=event.button??0;
 if(event.event==='up'){
  if(previous&&previous.hwnd===target.hwnd&&previous.button===button)previous.released=true;
  return;
 }
 if(event.event!=='down')return;
 const time=Number.isFinite(event.timeStamp)?event.timeStamp:performance.now();
 const enabled=!!(gui.classes.get(target.className?.toLowerCase())?.style&8);
 // The virtual desktop exposes a 4-by-4 double-click rectangle.
 const matches=enabled&&previous?.released&&previous.hwnd===target.hwnd&&previous.button===button&&time>=previous.time&&time-previous.time<=gui.doubleClickTime&&x>=previous.x-2&&x<previous.x+2&&y>=previous.y-2&&y<previous.y+2;
 if(matches){message.message+=2;gui.lastClick=null;}
 else gui.lastClick=enabled?{hwnd:target.hwnd,button,time,x,y,released:false}:null;
}
