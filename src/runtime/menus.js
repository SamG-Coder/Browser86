import {requireThat} from './errors.js';

export function installMenus(gui){
  const api=gui.api,p=gui.p,m=gui.m,u=(n,a,f)=>api.add('user32.dll',n,a,f),get=h=>p.object(h,'menu');
  const create=items=>p.handle('menu',{items});
  const containsMenu=(root,target)=>{const pending=[root],seen=new Set();while(pending.length){const h=pending.pop();if(h===target)return true;if(seen.has(h))continue;seen.add(h);for(const item of get(h)?.items||[])if(item.submenu)pending.push(item.submenu);}return false;};
  const find=(handle,id,position)=>{const menu=get(handle);if(!menu)return null;if(position)return menu.items[id]?{menu,index:id,item:menu.items[id]}:null;for(let index=0;index<menu.items.length;index++){const item=menu.items[index];if(item.id===id)return {menu,index,item};if(item.submenu){const nested=find(item.submenu,id,false);if(nested)return nested;}}return null;};
  gui.serializeMenu=handle=>{const menu=get(handle);return menu?{handle,items:menu.items.map(item=>({...item,submenu:item.submenu?gui.serializeMenu(item.submenu):null}))}:null;};
  const notify=()=>{for(const w of gui.windows.values())if(w.menu)gui.notify(w);};
  gui.loadMenu=(instance,name)=>{
    const module=api.module(instance);if(!module)return api.fail(6);const resource=p.loader.resource(module,4,name);if(!resource)return api.fail(1814);
    let cursor=resource.address;const end=cursor+resource.size,word=()=>{requireThat(cursor+2<=end,'MENU_RESOURCE','Truncated menu resource.');const value=m.u16(cursor);cursor+=2;return value;};
    requireThat(word()===0,'MENU_RESOURCE','Extended menu resource templates are not implemented.');const offset=word();cursor+=offset;let total=0;
    const list=depth=>{requireThat(depth<32,'MENU_RESOURCE','Menu nesting limit exceeded.');const items=[];let flags;do{requireThat(++total<=4096,'MENU_RESOURCE','Menu item limit exceeded.');flags=word();const popup=!!(flags&16),id=popup?0:word();let text='',ch;while((ch=word()))text+=String.fromCharCode(ch);const submenu=popup?list(depth+1):0;items.push({id,flags:flags&~0x80,text,submenu});}while(!(flags&0x80));return create(items);};
    return list(0);
  };
  for(const wide of [false,true]){
    const suffix=wide?'W':'A';u('LoadMenu'+suffix,2,(instance,name)=>gui.loadMenu(instance,name<65536?name:api.str(name,wide)));
    u('AppendMenu'+suffix,4,(handle,flags,id,text)=>{const menu=get(handle);if(!menu)return api.fail(1401);requireThat(!(flags&0x104),'UNSUPPORTED_MENU','Bitmap and owner-drawn menu items are not implemented.');if(flags&16&&(!get(id)||containsMenu(id,handle)))return api.fail(1401);menu.items.push({id:flags&16?0:id,flags,text:flags&0x800?'':api.str(text,wide),submenu:flags&16?id:0});notify();return 1;});
    u('GetMenuItemInfo'+suffix,4,(handle,id,position,out)=>{const found=find(handle,id,position);if(!found||!out)return api.fail(87);const size=m.u32(out),mask=m.u32(out+4),item=found.item;if(size!==44&&size!==48)return api.fail(87);if(mask&1)m.w32(out+12,item.flags&0xb);if(mask&2)m.w32(out+16,item.id);if(mask&4)m.w32(out+20,item.submenu);if(mask&0x100)m.w32(out+8,item.flags&0x900);if(mask&0x20)m.w32(out+32,0);if(mask&0x40||mask&0x10){if(mask&0x10)m.w32(out+8,item.flags&0x900);const buffer=m.u32(out+36),count=m.u32(out+40);if(buffer&&count){m.string(buffer,item.text,wide,count);m.w32(out+40,Math.min(item.text.length,count-1));}else m.w32(out+40,item.text.length);}return 1;});
  }
  u('CreateMenu',0,()=>create([]));u('CreatePopupMenu',0,()=>create([]));u('GetMenu',1,hwnd=>gui.window(hwnd)?.menu||0);
  u('GetSubMenu',2,(handle,index)=>get(handle)?.items[index]?.submenu||0);u('GetMenuItemCount',1,handle=>get(handle)?.items.length??-1);
  u('RemoveMenu',3,(handle,id,flags)=>{const found=find(handle,id,flags&0x400);if(!found)return api.fail(1456);found.menu.items.splice(found.index,1);notify();return 1;});
  for(const [name,bits]of [['CheckMenuItem',8],['EnableMenuItem',3]])u(name,3,(handle,id,flags)=>{const found=find(handle,id,flags&0x400);if(!found)return 0xffffffff;const previous=found.item.flags&bits;found.item.flags=(found.item.flags&~bits)|(flags&bits);notify();return previous;});
  gui.menuInput=event=>{const w=gui.window(event.hwnd);if(!w?.menu)return;if(event.kind==='menu-open'){if(!containsMenu(w.menu,event.menu))return;p.postMessage(w.hwnd,0x116,w.menu,0);p.postMessage(w.hwnd,0x117,event.menu,0);return;}const found=find(w.menu,event.id,false);if(found&&!found.item.submenu&&!(found.item.flags&0x803))p.postMessage(w.hwnd,0x111,event.id&0xffff,0);};
}
