import {RuntimeFault} from './errors.js';
const systemCursors=new Map([[32512,'default'],[32513,'text'],[32514,'wait'],[32515,'crosshair'],[32516,'default'],[32642,'nwse-resize'],[32643,'nesw-resize'],[32644,'ew-resize'],[32645,'ns-resize'],[32646,'move'],[32648,'not-allowed'],[32649,'pointer'],[32650,'progress'],[32651,'help'],[32671,'default'],[32672,'default']]);
const sizingCursors=new Map([[10,32644],[11,32644],[12,32645],[13,32642],[14,32643],[15,32645],[16,32643],[17,32642]]);
export function defaultSetCursor(gui,w,wp,lp,wide){
 const call=(name,...args)=>gui.api.lookup('user32.dll',name).fn(...args);
 const apply=()=>{
  if(!gui.window(w.hwnd))return 0;
  const hit=(lp<<16)>>16,mouse=(lp>>>16)&65535;
  if(hit===-2&&[0x201,0x204,0x207,0x20b].includes(mouse))throw new RuntimeFault('UNSUPPORTED_GUI','WM_SETCURSOR error-hit mouse-button beeps are not implemented.');
  if(hit===1){const cls=gui.classes.get(w.className.toLowerCase());if(!cls)throw new RuntimeFault('UNSUPPORTED_GUI','Built-in class cursor selection is not implemented.');if(cls.cursor)call('SetCursor',cls.cursor);return 0;}
  const id=sizingCursors.get(hit)||32512;call('SetCursor',call('LoadCursorW',0,id));return sizingCursors.has(hit)?1:0;
 };
 if((w.style&0x40000000)&&w.parent)return gui.send(w.parent,0x20,wp,lp,wide,result=>result?1:apply());
 return apply();
}
export function installCursors(gui){
 const {api,p}=gui,shared=new Map();gui.currentCursor=0;gui.cursorDisplayCount=0;
 const publish=()=>p.emit('cursor',{css:gui.cursorDisplayCount<0?'none':p.object(gui.currentCursor,'cursor')?.css||'none'});
 for(const wide of [false,true])api.add('user32.dll','LoadCursor'+(wide?'W':'A'),2,(instance,name)=>{
  if(instance)throw new RuntimeFault('UNSUPPORTED_GUI','Module cursor resources are not implemented.');
  name>>>=0;let id=name;
  if(name>=65536){const text=api.str(name,wide);id=/^#\d+$/.test(text)?Number(text.slice(1)):-1;}
  if(id===32640||id===32641)return 0;
  if(!systemCursors.has(id))return api.fail(1814);
  if(!shared.has(id))shared.set(id,p.handle('cursor',{id,css:systemCursors.get(id),shared:true}));
  return shared.get(id);
 });
 api.add('user32.dll','GetCursor',0,()=>gui.currentCursor);
 api.add('user32.dll','SetCursor',1,handle=>{
  handle>>>=0;const cursor=p.object(handle,'cursor');if(handle&&!cursor)return api.fail(1402);
  const old=gui.currentCursor;gui.currentCursor=handle;
  if(old!==handle)publish();
  return old;
 });
 api.add('user32.dll','ShowCursor',1,show=>{
  const old=gui.cursorDisplayCount;gui.cursorDisplayCount=(old+(show?1:-1))|0;
  if((old<0)!==(gui.cursorDisplayCount<0))publish();
  return gui.cursorDisplayCount;
 });
 api.add('user32.dll','DestroyCursor',1,handle=>{
  const cursor=p.object(handle,'cursor');if(!cursor)return api.fail(1402);
  if(!cursor.shared)throw new RuntimeFault('UNSUPPORTED_GUI','Owned cursor destruction is not implemented.');
  return 1;
 });
}
