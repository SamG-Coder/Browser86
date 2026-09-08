import {RuntimeFault} from './errors.js';
const systemCursors=new Map([[32512,'default'],[32513,'text'],[32514,'wait'],[32515,'crosshair'],[32516,'default'],[32642,'nwse-resize'],[32643,'nesw-resize'],[32644,'ew-resize'],[32645,'ns-resize'],[32646,'move'],[32648,'not-allowed'],[32649,'pointer'],[32650,'progress'],[32651,'help'],[32671,'default'],[32672,'default']]);
export function installCursors(gui){
 const {api,p}=gui,shared=new Map();gui.currentCursor=0;
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
  if(old!==handle)p.emit('cursor',{css:cursor?.css||'none'});
  return old;
 });
 api.add('user32.dll','DestroyCursor',1,handle=>{
  const cursor=p.object(handle,'cursor');if(!cursor)return api.fail(1402);
  if(!cursor.shared)throw new RuntimeFault('UNSUPPORTED_GUI','Owned cursor destruction is not implemented.');
  return 1;
 });
}
