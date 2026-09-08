import {requireThat} from './errors.js';
export function installAccelerators(gui){
  const api=gui.api,p=gui.p,m=gui.m,u=(n,a,f)=>api.add('user32.dll',n,a,f);gui.keys=new Set();
  for(const wide of [false,true]){
    const suffix=wide?'W':'A';
    u('LoadAccelerators'+suffix,2,(instance,name)=>{const module=api.module(instance);if(!module)return api.fail(6);const resource=p.loader.resource(module,9,name<65536?name:api.str(name,wide));if(!resource)return api.fail(1814);requireThat(resource.size%8===0&&resource.size<=32768,'ACCELERATOR_RESOURCE','Invalid accelerator resource size.');const entries=[];for(let i=0;i<resource.size;i+=8){const a=resource.address+i,flags=m.u16(a);entries.push({flags:flags&0x7f,key:m.u16(a+2),command:m.u16(a+4)});if(flags&0x80)break;}return p.handle('accelerators',{entries});});
    u('TranslateAccelerator'+suffix,3,(hwnd,table,message)=>{const w=gui.window(hwnd),accelerators=p.object(table,'accelerators');if(!w||!w.enabled||!accelerators||!message)return 0;const msg=m.u32(message+4),key=m.u32(message+8);let modifiers=(gui.keys.has(16)?4:0)|(gui.keys.has(17)?8:0)|(gui.keys.has(18)?16:0);const entry=accelerators.entries.find(e=>(e.flags&1?[0x100,0x104].includes(msg):[0x102,0x106].includes(msg))&&e.key===key&&(e.flags&28)===modifiers);return entry?gui.send(hwnd,0x111,entry.command|0x10000,0,wide,()=>1):0;});
  }
  u('GetKeyState',1,key=>gui.keys.has(key&255)?0x8000:0);
  u('GetKeyboardState',1,out=>{if(!out)return api.fail(87);m.fill(out,256,0);for(const key of gui.keys)if(key<256)m.w8(out+key,0x80);return 1;});
}
