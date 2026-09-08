import {RuntimeFault,requireThat,hex} from './errors.js';
import {alignUp,ansiEncode,ansiDecode} from './memory.js';
import {GUI} from './gui.js';
import {installCRT} from './crt.js';
import {installSynchronization} from './sync.js';
import {installHandles} from './handles.js';
import {installFileIO} from './files.js';
import {installFileInformation,writeFileTime} from './file-info.js';
import {installFileSystem} from './file-system.js';
import {installTLS} from './tls.js';
import {installInitOnce} from './init-once.js';
import {installAddressWait} from './address-wait.js';
import {installCriticalSections} from './critical-section.js';
import {installEnvironment} from './environment.js';
import {installSRWLocks} from './srw-lock.js';
import {installConditionVariables} from './condition-variable.js';
import {installTimeConversions} from './time-conversion.js';
import {installOrdinalComparison} from './ordinal.js';
import {installCodePageConversions} from './sbcs.js';
import {installCodePageInfo} from './code-page.js';
const INVALID=0xFFFFFFFF;
const SYSTEM=new Set(['kernel32.dll','kernelbase.dll','user32.dll','gdi32.dll','advapi32.dll','msvcrt.dll','ucrtbase.dll','ntdll.dll','shell32.dll','shlwapi.dll','winmm.dll','comdlg32.dll','comctl32.dll','ole32.dll','oleaut32.dll','version.dll','ws2_32.dll']);
export class Win32 {
  constructor(process){this.p=process;this.m=process.memory;this.vfs=process.vfs;this.functions=new Map();this.traps=new Map();this.nextTrap=0xF0000000;this.moduleHandles=new Map();this.missingMap=new Map();this.allocations=new Map();this.resources=new Map();this.installKernel();this.gui=new GUI(this);installCRT(this);this.installRegistry();}
  canonical(dll){dll=dll.toLowerCase();if(!dll.endsWith('.dll'))dll+='.dll';if(dll==='kernelbase.dll'||dll.startsWith('api-ms-win-core-')||dll.startsWith('ext-ms-win-kernel'))return 'kernel32.dll';if(dll==='ucrtbase.dll'||dll.startsWith('api-ms-win-crt-'))return 'msvcrt.dll';return dll;}
  isSystemModule(dll){return SYSTEM.has(dll.toLowerCase())||/^api-ms-win-(core|crt)-/.test(dll.toLowerCase());}
  add(dll,name,argc,fn,cdecl=false,description=''){dll=this.canonical(dll);const key=dll+'!'+name;const address=this.nextTrap;this.nextTrap+=16;const record={dll,name,argc,fn,cdecl,address,description};this.functions.set(key,record);this.traps.set(address,record);return address;}
  data(dll,name,address){this.functions.set(this.canonical(dll)+'!'+name,{dll,name,address,data:true});}
  lookup(dll,name){return this.functions.get(this.canonical(dll)+'!'+name);}
  address(dll,name){return this.lookup(dll,name)?.address??this.missing(dll,name);}
  missing(dll,name,reason=''){dll=this.canonical(dll);const key=dll+'!'+name;if(this.missingMap.has(key))return this.missingMap.get(key).address;const address=this.nextTrap;this.nextTrap+=16;const record={dll,name,address,reason};this.missingMap.set(key,record);this.traps.set(address,record);return address;}
  missingImports(){return [...this.missingMap.values()].map(({dll,name,reason})=>({dll,name,reason}));}
  systemHandle(name){name=this.canonical(name);if(!this.moduleHandles.has(name))this.moduleHandles.set(name,this.p.handle('module',{name,system:true}));return this.moduleHandles.get(name);}
  str(pointer,wide=false){return wide?this.m.wstr(pointer):this.m.cstr(pointer);}
  fail(error=87,value=0){this.p.setError(error);return value;}
  expected(fn,invalid=0){try{return fn();}catch(e){if(e instanceof RuntimeFault&&e.code.startsWith('VFS_'))return this.fail(e.code==='VFS_NOT_FOUND'?2:e.code==='VFS_EXISTS'?183:e.code==='VFS_SHARING'?32:5,invalid);throw e;}}
  copyString(buffer,capacity,text,wide=false,includeNullOnFailure=true){if(!capacity)return text.length+1;if(text.length>=capacity)return text.length+(includeNullOnFailure?1:0);this.m.string(buffer,text,wide,capacity);return text.length;}
  module(handle=0){return !handle?this.p.main:this.p.loader.moduleByBase(handle);}
  sleep(ms){if(!ms)return 0;const end=performance.now()+ms;return this.p.wait(()=>performance.now()>=end?0:undefined,'Sleep');}
  filetime(address,date=Date.now()){const t=(BigInt(Math.trunc(date))+11644473600000n)*10000n;this.m.w32(address,Number(t&0xFFFFFFFFn));this.m.w32(address+4,Number(t>>32n));}
  installKernel(){const p=this.p,m=this.m,v=this.vfs;const k=(name,n,fn)=>this.add('kernel32.dll',name,n,fn);
    k('ExitProcess',1,code=>{p.exit(code);return 0;});k('TerminateProcess',2,(h,c)=>{if(!p.isCurrentProcess(h))return this.fail(5);p.exit(c);return 1;});
    k('GetLastError',0,()=>m.u32(p.teb+0x34));k('SetLastError',1,e=>{p.setError(e);return 0;});
    k('GetCurrentProcess',0,()=>INVALID);k('GetCurrentThread',0,()=>0xFFFFFFFE);k('GetCurrentProcessId',0,()=>4);k('GetCurrentThreadId',0,()=>8);
    const heaps=new Map([[0x100,{blocks:null,maximum:0,used:0}]]),privateOwners=new Map();let nextHeap=0x200;
    const owns=(h,a)=>heaps.has(h)&&p.heap.blocks.has(a)&&(h===0x100?!privateOwners.has(a):privateOwners.get(a)===h);
    const heapFlags=f=>{if(f&4)throw new RuntimeFault('UNSUPPORTED_HEAP','HEAP_GENERATE_EXCEPTIONS needs SEH, which is not implemented.');};
    k('GetProcessHeap',0,()=>0x100);
    k('HeapCreate',3,(options,initial,maximum)=>{heapFlags(options);if(options&~5||maximum&&initial>maximum)return this.fail(87);if(heaps.size>=4096)return this.fail(8);const h=nextHeap++;heaps.set(h,{blocks:new Set(),maximum,used:0});return h;});
    k('HeapDestroy',1,h=>{const heap=heaps.get(h);if(!heap||h===0x100)return this.fail(6);for(const a of heap.blocks){p.heap.free(a);privateOwners.delete(a);}heaps.delete(h);return 1;});
    k('HeapAlloc',3,(h,f,n)=>{heapFlags(f);const heap=heaps.get(h);if(!heap)return this.fail(6);const size=alignUp(Math.max(16,n),16);if(heap.maximum&&heap.used+size>heap.maximum)return this.fail(8);const a=p.heap.alloc(n,!!(f&8));if(h!==0x100){heap.blocks.add(a);heap.used+=p.heap.blocks.get(a);privateOwners.set(a,h);}return a;});
    k('HeapFree',3,(h,f,a)=>{if(!a)return heaps.has(h)?1:this.fail(6);if(!owns(h,a))return this.fail(6);const heap=heaps.get(h);if(h!==0x100){heap.used-=p.heap.blocks.get(a);heap.blocks.delete(a);privateOwners.delete(a);}return p.heap.free(a)?1:0;});
    k('HeapReAlloc',4,(h,f,a,n)=>{heapFlags(f);if(!owns(h,a))return this.fail(6);const heap=heaps.get(h),old=p.heap.blocks.get(a),size=alignUp(Math.max(16,n),16);if(f&0x10){if(size>old)return 0;return a;}if(heap.maximum&&heap.used-old+size>heap.maximum)return this.fail(8);const b=p.heap.realloc(a,n,!!(f&8));if(h!==0x100){heap.used+=p.heap.blocks.get(b)-old;heap.blocks.delete(a);heap.blocks.add(b);privateOwners.delete(a);privateOwners.set(b,h);}return b;});
    k('HeapSize',3,(h,f,a)=>owns(h,a)?p.heap.blocks.get(a):this.fail(6,INVALID));
    k('HeapValidate',3,(h,f,a)=>heaps.has(h)&&(!a||owns(h,a))?1:0);
    for(const prefix of ['Local','Global']){
      k(prefix+'Alloc',2,(f,n)=>{const ptr=p.heap.alloc(n,!!(f&0x40));return f&2?p.handle('global',{ptr,size:n}):ptr;});
      k(prefix+'Lock',1,h=>p.object(h,'global')?.ptr??(p.heap.blocks.has(h)?h:0));k(prefix+'Unlock',1,h=>{p.setError(0);return 0;});
      k(prefix+'Free',1,h=>{const b=p.object(h,'global');if(b){p.heap.free(b.ptr);p.releaseHandle(h);return 0;}return p.heap.free(h)?0:h;});
      k(prefix+'Size',1,h=>p.object(h,'global')?.size??p.heap.blocks.get(h)??0);
      k(prefix+'ReAlloc',3,(h,n,f)=>{const obj=p.object(h,'global');if(obj){obj.ptr=p.heap.realloc(obj.ptr,n,!!(f&0x40));obj.size=n;return h;}return p.heap.realloc(h,n,!!(f&0x40));});
    }
    const permission=n=>{const perm={1:'',2:'r',4:'rw',8:'rw',0x10:'x',0x20:'rx',0x40:'rwx',0x80:'rwx'}[n&255];if(perm===undefined||n&~255)throw new RuntimeFault('UNSUPPORTED_PROTECTION','Guard/cache-modifier page protection is not implemented.',{protection:n});return perm;};
    k('VirtualAlloc',4,(address,size,type,protection)=>{if(!size||size>m.limit)return this.fail(8);if(type&~0x3000||!(type&0x3000))return this.fail(87);let base=address?Math.floor(address/4096)*4096:0;const length=alignUp((address-base)+size);
      if(base&&m.isMapped(base,length)){const region=[...this.allocations.values()].find(r=>base>=r.base&&base+length<=r.base+r.size);if(!region||!(type&0x1000))return this.fail(487);m.protect(base,length,permission(protection));return base;}
      if(!base)base=m.gap(length,0x40000000,0x70000000);if(!m.isFree(base,length))return this.fail(487);m.map(base,length,type&0x1000?permission(protection):'','VirtualAlloc');this.allocations.set(base,{base,size:length});return base;});
    k('VirtualFree',3,(base,size,type)=>{const r=this.allocations.get(base);if(type===0x8000){if(!r||size!==0)return this.fail(87);m.unmap(base,r.size);this.allocations.delete(base);return 1;}if(type===0x4000&&size&&m.isMapped(base,size)){m.protect(base,size,'rw');m.fill(base,size);m.protect(base,size,'');return 1;}return this.fail(87);});
    k('VirtualProtect',4,(base,size,protection,old)=>{if(!size||!m.isMapped(base,size)||!old)return this.fail(487);const previous=m.protect(base,size,permission(protection));m.w32(old,({'':1,r:2,rw:4,x:0x10,rx:0x20,rwx:0x40})[previous]??4);return 1;});
    k('VirtualQuery',3,(address,out,length)=>{if(length<28)return 0;const page=m.pages.get(address>>>12);m.fill(out,28);m.w32(out,address&0xFFFFF000);m.w32(out+4,address&0xFFFFF000);m.w32(out+8,page?4:1);m.w32(out+12,4096);m.w32(out+16,page?0x1000:0x10000);m.w32(out+20,page?({'':1,r:2,rw:4,x:16,rx:32,rwx:64}[page.perm]??4):1);m.w32(out+24,page?0x20000:0);return 28;});
    k('FlushInstructionCache',3,()=>1); // Interpreter refetches every instruction.
    k('GetStdHandle',1,n=>n===0xFFFFFFF6?10:n===0xFFFFFFF5?11:n===0xFFFFFFF4?12:this.fail(87,INVALID));
    k('SetStdHandle',2,()=>{throw new RuntimeFault('UNSUPPORTED_API','Redirecting process standard handles is not implemented.');});
    installHandles(this);
    k('GetFileType',1,h=>h>=10&&h<=12?2:p.object(h,'file')?1:0);
    installFileIO(this);
    installFileInformation(this);
    installFileSystem(this);
    k('GetConsoleMode',2,(h,out)=>{if(h<10||h>12)return this.fail(6);m.w32(out,h===10?7:3);return 1;});k('SetConsoleMode',2,(h,mode)=>h>=10&&h<=12?1:this.fail(6));
    k('AllocConsole',0,()=>1);k('FreeConsole',0,()=>1);k('GetConsoleOutputCP',0,()=>1252);k('GetConsoleCP',0,()=>1252);k('SetConsoleOutputCP',1,cp=>cp===1252?1:this.fail(87));k('SetConsoleCP',1,cp=>cp===1252?1:this.fail(87));
    for(const wide of [false,true]){const suffix=wide?'W':'A',str=a=>this.str(a,wide),write=(a,s,n=Infinity)=>m.string(a,s,wide,n);
      k('CreateDirectory'+suffix,2,(name,security)=>this.expected(()=>{const path=v.path(str(name));if(v.exists(path))return this.fail(183);const parent=path.slice(0,path.lastIndexOf('/'))||'C:/';if(!v.get(parent)?.directory)return this.fail(3);v.mkdir(path);return 1;}));
      k('RemoveDirectory'+suffix,1,name=>this.expected(()=>{const node=v.get(str(name));if(!node?.directory)return this.fail(3);return v.remove(node.path)?1:0;}));
      k('GetCurrentDirectory'+suffix,2,(size,out)=>this.copyString(out,size,v.cwd.replaceAll('/','\\'),wide));
      k('SetCurrentDirectory'+suffix,1,name=>this.expected(()=>{const node=v.get(str(name));if(!node?.directory)return this.fail(3);v.cwd=node.path;return 1;}));
      k('GetFullPathName'+suffix,4,(name,size,out,last)=>this.expected(()=>{const path=v.path(str(name)).replaceAll('/','\\');if(size>path.length&&last)m.w32(last,out+(path.lastIndexOf('\\')+1)*(wide?2:1));return this.copyString(out,size,path,wide);}));
      k('GetTempPath'+suffix,2,(size,out)=>this.copyString(out,size,'C:\\Temp\\',wide));
      k('GetWindowsDirectory'+suffix,2,(out,size)=>this.copyString(out,size,'C:\\Windows',wide));k('GetSystemDirectory'+suffix,2,(out,size)=>this.copyString(out,size,'C:\\Windows\\System32',wide));
      k('GetCommandLine'+suffix,0,()=>wide?p.commandW:p.commandA);
      k('GetModuleFileName'+suffix,3,(h,out,size)=>{const module=this.module(h);if(!module)return this.fail(126);const path=module.path.replaceAll('/','\\');if(!size)return 0;write(out,path,size);if(path.length>=size){p.setError(122);return size;}return path.length;});
      k('GetModuleHandle'+suffix,1,name=>{if(!name)return p.main.base;const text=str(name),key=this.canonical(text);if(this.isSystemModule(key))return this.systemHandle(key);const module=p.loader.order.find(x=>x.name.toLowerCase()===text.toLowerCase()||x.path.toLowerCase()===text.replaceAll('\\','/').toLowerCase());return module?.base??this.fail(126);});
      k('LoadLibrary'+suffix,1,name=>this.loadLibrary(str(name)));
      k('LoadLibraryEx'+suffix,3,(name,file,flags)=>{if(file||flags)return this.fail(87);return this.loadLibrary(str(name));});
      k('GetStartupInfo'+suffix,1,out=>{m.fill(out,68);m.w32(out,68);m.w32(out+44,0x100);m.w32(out+56,10);m.w32(out+60,11);m.w32(out+64,12);return 0;});
      k('OutputDebugString'+suffix,1,text=>{p.emit('log',{level:'debug',message:str(text)});return 0;});
      k('SetConsoleTitle'+suffix,1,name=>{p.emit('title',{text:str(name)});return 1;});
      k('WriteConsole'+suffix,5,(h,text,count,written,reserved)=>{if(h!==11&&h!==12)return this.fail(6);requireThat(count<=1024*1024,'STRING_LIMIT','Console write is too large.');const s=wide?Array.from({length:count},(_,i)=>String.fromCharCode(m.u16(text+i*2))).join(''):ansiDecode(m.read(text,count));p.emit('stdout',{text:s,stream:h===12?'stderr':'stdout'});if(written)m.w32(written,count);return 1;});
      k('ReadConsole'+suffix,5,(h,out,count,read,control)=>{if(h!==10)return this.fail(6);if(control)throw new RuntimeFault('UNSUPPORTED_IO','Extended console read control is not implemented.');const consume=()=>{if(!p.input.length&&count)return undefined;const data=p.input.splice(0,count);if(wide)for(let i=0;i<data.length;i++)m.w16(out+i*2,data[i]);else m.write(out,Uint8Array.from(data));if(read)m.w32(read,data.length);return 1;};return consume()??p.wait(consume,'Console input');});
      k('FindFirstFile'+suffix,2,(pattern,out)=>this.expected(()=>{const text=str(pattern).replaceAll('\\','/'),slash=text.lastIndexOf('/'),dir=slash<0?v.cwd:text.slice(0,slash)||'C:/',wild=slash<0?text:text.slice(slash+1);const re=new RegExp('^'+(wild==='*.*'?'*':wild).replace(/[.+^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*').replaceAll('?','.')+'$','i');const list=v.list(dir).filter(n=>re.test(n.path.split('/').at(-1)));if(!list.length)return this.fail(2,INVALID);const handle=p.handle('find',{list,index:0,wide});this.findData(list[0],out,wide);return handle;},INVALID));
      k('FindNextFile'+suffix,2,(h,out)=>{const f=p.object(h,'find');if(!f)return this.fail(6);const next=f.list[++f.index];if(!next)return this.fail(18);this.findData(next,out,wide);return 1;});
      k('FindResource'+suffix,3,(h,name,type)=>{const module=this.module(h);if(!module)return this.fail(126);const resource=p.loader.resource(module,type<65536?type:str(type),name<65536?name:str(name));if(!resource)return this.fail(1813);return p.handle('resource',resource);});
      k('GetVersionEx'+suffix,1,out=>{const size=m.u32(out);if(size<(wide?276:148))return this.fail(87);m.fill(out+4,size-4);m.w32(out+4,5);m.w32(out+8,1);m.w32(out+12,2600);m.w32(out+16,2);return 1;});
    }
    k('FindClose',1,h=>p.object(h,'find')?(p.releaseHandle(h),1):this.fail(6));
    k('LoadResource',2,(h,r)=>p.object(r,'resource')?.address??this.fail(6));k('LockResource',1,a=>a);k('SizeofResource',2,(h,r)=>p.object(r,'resource')?.size??0);k('FreeResource',1,()=>0);
    k('GetProcAddress',2,(h,name)=>{const symbol=name<65536?name:m.cstr(name),system=p.object(h,'module');if(system){const result=this.lookup(system.name,symbol);return result?.address??this.fail(127);}const module=this.module(h);if(!module)return this.fail(126);const exp=module.image.exports.get(symbol);if(!exp)return this.fail(127);if(exp.forwarder){const dot=exp.forwarder.lastIndexOf('.');const s=exp.forwarder.slice(dot+1);return p.loader.resolve(exp.forwarder.slice(0,dot),s.startsWith('#')?Number(s.slice(1)):s,module.path);}return module.base+exp.rva;});
    k('FreeLibrary',1,h=>{if(p.object(h,'module'))return 1;if(this.module(h)){p.note('FreeLibrary keeps packaged DLL mappings resident until process exit; detach/unloading is not implemented.');return 1;}return this.fail(6);});
    k('DisableThreadLibraryCalls',1,h=>this.module(h)?1:this.fail(126));
    k('GetTickCount',0,()=>Math.floor(performance.now()-p.started));
    k('QueryPerformanceFrequency',1,out=>{m.w32(out,1_000_000);m.w32(out+4,0);return 1;});
    k('QueryPerformanceCounter',1,out=>{const us=BigInt(Math.floor((performance.now()-p.started)*1000));m.w32(out,Number(us&0xFFFFFFFFn));m.w32(out+4,Number(us>>32n));return 1;});
    k('Sleep',1,ms=>this.sleep(ms));k('SleepEx',2,(ms,alertable)=>{if(alertable)throw new RuntimeFault('UNSUPPORTED_APC','Alertable waits are not implemented.');return this.sleep(ms);});
    k('GetSystemTimeAsFileTime',1,out=>{this.filetime(out);return 0;});
    const systemTime=(out,local)=>{const d=new Date(),f=name=>d[(local?'get':'getUTC')+name]();[f('FullYear'),f('Month')+1,f('Day'),f('Date'),f('Hours'),f('Minutes'),f('Seconds'),f('Milliseconds')].forEach((x,i)=>m.w16(out+i*2,x));return 0;};k('GetSystemTime',1,out=>systemTime(out,false));k('GetLocalTime',1,out=>systemTime(out,true));
    const systemInfo=out=>{m.fill(out,36);m.w16(out,0);m.w32(out+4,4096);m.w32(out+8,0x10000);m.w32(out+12,0x7FFEFFFF);m.w32(out+16,1);m.w32(out+20,1);m.w32(out+24,586);m.w32(out+28,65536);m.w16(out+32,5);return 0;};k('GetSystemInfo',1,systemInfo);k('GetNativeSystemInfo',1,systemInfo);
    k('GetVersion',0,()=>0x0A280105);k('IsDebuggerPresent',0,()=>0);k('CheckRemoteDebuggerPresent',2,(h,out)=>{if(!p.isCurrentProcess(h))return this.fail(6);m.w32(out,0);return 1;});k('IsProcessorFeaturePresent',1,()=>0);
    k('GetACP',0,()=>1252);k('GetOEMCP',0,()=>437);
    installTLS(this);
    installInitOnce(this);
    installAddressWait(this);
    installCriticalSections(this);
    installEnvironment(this);
    installSRWLocks(this);
    installConditionVariables(this);
    installTimeConversions(this);
    installOrdinalComparison(this);
    installCodePageInfo(this);
    installCodePageConversions(this);
    k('InterlockedIncrement',1,a=>{const n=(m.u32(a)+1)>>>0;m.w32(a,n);return n;});k('InterlockedDecrement',1,a=>{const n=(m.u32(a)-1)>>>0;m.w32(a,n);return n;});k('InterlockedExchange',2,(a,value)=>{const old=m.u32(a);m.w32(a,value);return old;});k('InterlockedExchangeAdd',2,(a,value)=>{const old=m.u32(a);m.w32(a,old+value);return old;});k('InterlockedCompareExchange',3,(a,value,compare)=>{const old=m.u32(a);if(old===compare)m.w32(a,value);return old;});
    installSynchronization(this);
    k('SetUnhandledExceptionFilter',1,callback=>{const old=this.exceptionFilter||0;this.exceptionFilter=callback;p.note('An exception filter was registered, but guest SEH dispatch is not implemented. Faults stop with diagnostics.');return old;});
    this.add('winmm.dll','timeGetTime',0,()=>Math.floor(performance.now()-p.started));
    this.add('ntdll.dll','RtlMoveMemory',3,(dst,src,n)=>{m.write(dst,m.read(src,n));return 0;});this.add('ntdll.dll','RtlZeroMemory',2,(dst,n)=>{m.fill(dst,n);return 0;});
    k('RtlMoveMemory',3,(dst,src,n)=>{m.write(dst,m.read(src,n));return 0;});k('RtlZeroMemory',2,(dst,n)=>{m.fill(dst,n);return 0;});
    for(const wide of [false,true]){const s=wide?'W':'A',read=a=>this.str(a,wide);k('lstrlen'+s,1,a=>read(a).length);k('lstrcpy'+s,2,(dst,src)=>{m.string(dst,read(src),wide);return dst;});k('lstrcpyn'+s,3,(dst,src,n)=>{m.string(dst,read(src),wide,n);return dst;});k('lstrcat'+s,2,(dst,src)=>{m.string(dst,read(dst)+read(src),wide);return dst;});k('lstrcmp'+s,2,(a,b)=>{const x=read(a),y=read(b);return x===y?0:x<y?-1:1;});k('lstrcmpi'+s,2,(a,b)=>{const x=read(a).toLowerCase(),y=read(b).toLowerCase();return x===y?0:x<y?-1:1;});}
  }
  findData(node,out,wide){const m=this.m;m.fill(out,wide?592:320);m.w32(out,node.attributes);for(const [offset,key]of [[4,'creation'],[12,'access'],[20,'write']])writeFileTime(m,out+offset,node.times[key]);m.w32(out+32,node.data?.length||0);m.string(out+44,node.path.split('/').at(-1),wide,260);}
  loadLibrary(name){const p=this.p;if(this.isSystemModule(name.toLowerCase()))return this.systemHandle(name);let path;if(/[\\/]/.test(name))path=this.vfs.path(name);else path=p.loader.findDll(name.toLowerCase().endsWith('.dll')?name:name+'.dll',p.exePath);if(!path||!this.vfs.exists(path))return this.fail(126);const before=p.loader.initializers.length,module=p.loader.load(path),calls=p.loader.initializers.splice(before);const run=i=>i===calls.length?module.base:p.call(calls[i].address,calls[i].args,value=>{if(calls[i].dll&&!value)return this.fail(1114);return run(i+1);});return run(0);}
  installRegistry(){
    // A per-package HKCU/HKLM dictionary, persisted as a virtual file. No host registry.
    const p=this.p,m=this.m,path='C:/Windows/browser86-registry.json';let registry={};try{if(this.vfs.exists(path))registry=JSON.parse(new TextDecoder().decode(this.vfs.readFile(path)));}catch{registry={};}
    const roots=new Map([[0x80000000,'HKCR'],[0x80000001,'HKCU'],[0x80000002,'HKLM'],[0x80000003,'HKU']]);const keyOf=h=>roots.get(h)||p.object(h,'registry')?.key;
    const save=()=>this.vfs.writeFile(path,new TextEncoder().encode(JSON.stringify(registry)));
    for(const wide of [false,true]){const suffix=wide?'W':'A',str=a=>this.str(a,wide);const reg=(name,n,fn)=>this.add('advapi32.dll',name+suffix,n,fn);
      reg('RegOpenKeyEx',5,(h,sub,options,access,out)=>{const root=keyOf(h);if(!root)return 6;const key=(root+'\\'+str(sub)).toLowerCase();if(!registry[key])return 2;m.w32(out,p.handle('registry',{key}));return 0;});
      reg('RegCreateKeyEx',9,(h,sub,reserved,cls,options,access,security,out,disposition)=>{const root=keyOf(h);if(!root)return 6;const key=(root+'\\'+str(sub)).toLowerCase(),exists=Object.hasOwn(registry,key);if(!exists){registry[key]={};save();}m.w32(out,p.handle('registry',{key}));if(disposition)m.w32(disposition,exists?2:1);return 0;});
      reg('RegSetValueEx',6,(h,name,reserved,type,data,size)=>{const key=keyOf(h)?.toLowerCase();if(!key||!registry[key])return 6;if(size>1024*1024)return 8;const val={type,bytes:Array.from(m.read(data,size)),wide};Object.defineProperty(registry[key],str(name).toLowerCase(),{value:val,writable:true,configurable:true,enumerable:true});save();return 0;});
      reg('RegQueryValueEx',6,(h,name,reserved,type,data,size)=>{const key=keyOf(h)?.toLowerCase(),val=key&&registry[key]&&Object.hasOwn(registry[key],str(name).toLowerCase())?registry[key][str(name).toLowerCase()]:null;if(!val)return 2;let bytes=Uint8Array.from(val.bytes);if((val.type===1||val.type===2||val.type===7)&&val.wide!==wide){const s=val.wide?new TextDecoder('utf-16le').decode(bytes):ansiDecode(bytes);if(wide){bytes=new Uint8Array(s.length*2);const d=new DataView(bytes.buffer);for(let i=0;i<s.length;i++)d.setUint16(i*2,s.charCodeAt(i),true);}else bytes=ansiEncode(s);}if(type)m.w32(type,val.type);if(!size)return 87;const capacity=m.u32(size);m.w32(size,bytes.length);if(!data)return 0;if(capacity<bytes.length)return 234;m.write(data,bytes);return 0;});
      reg('RegDeleteValue',2,(h,name)=>{const key=keyOf(h)?.toLowerCase(),n=str(name).toLowerCase();if(!key||!registry[key])return 6;if(!Object.hasOwn(registry[key],n))return 2;delete registry[key][n];save();return 0;});
    }
    this.add('advapi32.dll','RegCloseKey',1,h=>roots.has(h)?0:p.object(h,'registry')?(p.releaseHandle(h),0):6);
  }
}
