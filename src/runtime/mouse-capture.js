export function installMouseCapture(gui){
 const {api}=gui;gui.capture=0;
 const change=(target,done)=>{
  const old=gui.capture;gui.capture=target;
  return old&&gui.window(old)?gui.send(old,0x215,0,target,false,()=>done(old)):done(old);
 };
 api.add('user32.dll','GetCapture',0,()=>gui.capture);
 api.add('user32.dll','SetCapture',1,hwnd=>{
  hwnd>>>=0;if(hwnd&&!gui.window(hwnd))return api.fail(1400);
  return change(hwnd,old=>old);
 });
 api.add('user32.dll','ReleaseCapture',0,()=>change(0,()=>1));
}
