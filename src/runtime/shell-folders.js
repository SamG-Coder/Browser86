import {requireThat} from './errors.js';

export function installShellFolders(api){
  const p=api.p,m=api.m,owned=new Set(),pidls=new Map();
  const alloc=size=>{const ptr=p.heap.alloc(size);owned.add(ptr);return ptr;};
  const free=ptr=>{if(!ptr)return;requireThat(owned.has(ptr),'SHELL_ALLOCATOR','Pointer does not belong to the shell allocator.');owned.delete(ptr);pidls.delete(ptr);p.heap.free(ptr);};
  const table=p.heap.alloc(9*4),instance=p.heap.alloc(4);m.w32(instance,table);let refs=1;
  const methods=[
    ['QueryInterface',3,(self,iid,out)=>{if(!out)return 0x80004003;m.w32(out,0);if(!iid)return 0x80004003;const bytes=[...m.read(iid,16)],base=[0,0,0,0,0,0,0,0,0xc0,0,0,0,0,0,0,0x46];if(bytes.every((b,i)=>b===(i===0?bytes[0]:base[i]))&&(bytes[0]===0||bytes[0]===2)){m.w32(out,instance);refs++;return 0;}return 0x80004002;}],
    ['AddRef',1,()=>++refs],['Release',1,()=>refs=Math.max(1,refs-1)],
    ['Alloc',2,(self,size)=>alloc(size)],
    ['Realloc',3,(self,ptr,size)=>{if(!ptr)return alloc(size);if(!size){free(ptr);return 0;}requireThat(owned.has(ptr),'SHELL_ALLOCATOR','Invalid shell reallocation.');const next=p.heap.realloc(ptr,size);owned.delete(ptr);owned.add(next);pidls.delete(ptr);return next;}],
    ['Free',2,(self,ptr)=>{free(ptr);return 0;}],
    ['GetSize',2,(self,ptr)=>owned.has(ptr)?p.heap.blocks.get(ptr):0xffffffff],
    ['DidAlloc',2,(self,ptr)=>owned.has(ptr)?1:0],['HeapMinimize',1,()=>0]
  ];
  methods.forEach(([name,argc,fn],i)=>{const key='#IMalloc.'+name,address=api.add('shell32.dll',key,argc,fn);api.functions.delete('shell32.dll!'+key);m.w32(table+i*4,address);});
  api.add('shell32.dll','SHGetMalloc',1,out=>{if(!out)return 0x80004003;refs++;m.w32(out,instance);return 0;});
  api.add('shell32.dll','SHGetSpecialFolderLocation',3,(hwnd,csidl,out)=>{
    if(!out)return 0x80004003;m.w32(out,0);
    const path=({5:'C:/Users/Browser/Documents',0x1a:'C:/Users/Browser/AppData/Roaming',0x1c:'C:/Users/Browser/AppData/Local',0x28:'C:/Users/Browser'})[csidl&0xff];
    if(!path||csidl&~0x80ff)return 0x80070057;
    p.vfs.mkdir(path);const value=path.replaceAll('/','\\'),size=4+(value.length+1)*2,ptr=alloc(size+2);m.w16(ptr,size);m.w16(ptr+2,0x86);m.string(ptr+4,value,true);m.w16(ptr+size,0);pidls.set(ptr,value);m.w32(out,ptr);return 0;
  });
  for(const wide of [false,true])api.add('shell32.dll','SHGetPathFromIDList'+(wide?'W':'A'),2,(pidl,out)=>{const value=pidls.get(pidl);if(!value||!out)return 0;m.string(out,value,wide,260);return 1;});
}
