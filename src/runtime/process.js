import {Memory,Heap,alignUp,ansiEncode} from './memory.js';
import {CPU,EAX,ESP} from './cpu.js';
import {VirtualFileSystem} from './vfs.js';
import {PELoader} from './pe.js';
import {Win32} from './win32.js';
import {RuntimeFault,requireThat,hex} from './errors.js';
const EXIT_TRAP=0xFFFFFF00;
export class GuestProcess {
  constructor({entries=[],exePath,args='',memoryMiB=256,emit=()=>{},instructionLimit=2_000_000_000}={}) {
    this.emit=emit;this.vfs=new VirtualFileSystem(entries);this.exePath=this.vfs.path(exePath);this.vfs.cwd=this.exePath.slice(0,this.exePath.lastIndexOf('/'))||'C:/';
    this.args=args;this.memory=new Memory(Math.max(32,Math.min(512,memoryMiB))*1024*1024);this.heap=new Heap(this.memory);this.cpu=new CPU(this.memory,a=>this.bridge(a));this.status='loading';this.exitCode=null;this.started=performance.now();this.lastError=0;this.handles=new Map();this.nextHandle=0x1000;this.callbacks=new Map();this.nextCallback=0xF1000000;this.callTrace=[];this.instructionsLimit=instructionLimit;this.waiting=null;this.messageQueue=[];this.input=[];this.dialogResults=new Map();this.nextDialog=1;this.timers=new Map();this.breakpoints=new Set();this.pauseReason='';this.apiCalls=0;this.lastApi=null;this.runtimeNotes=[];
    this.environment=new Map(Object.entries({OS:'Windows_NT',WINDIR:'C:\\Windows',SYSTEMROOT:'C:\\Windows',SYSTEMDRIVE:'C:',COMSPEC:'',TEMP:'C:\\Temp',TMP:'C:\\Temp',USERPROFILE:'C:\\Users\\Browser',USERNAME:'Browser',PATH:'C:\\Windows\\System32;C:\\Windows',BROWSER86:'1'}));
    this.stackBase=0x01000000;this.stackSize=8*1024*1024;this.memory.map(this.stackBase,this.stackSize,'rw','main thread stack');this.stackTop=this.stackBase+this.stackSize-16;this.cpu.r[ESP]=this.stackTop;
    this.teb=0x7FFDE000;this.peb=0x7FFDF000;this.memory.map(this.teb,8192,'rw','TEB / PEB');this.tlsArray=this.heap.alloc(4096,true);this.cpu.fs=this.teb;
    for(const [offset,value]of [[0,0xFFFFFFFF],[4,this.stackTop],[8,this.stackBase],[0x18,this.teb],[0x20,4],[0x24,8],[0x2C,this.tlsArray],[0x30,this.peb]])this.memory.w32(this.teb+offset,value);
    this.memory.w32(this.peb+0x18,0x100);this.commandLine='"'+this.exePath.replaceAll('/','\\')+'"'+(args?' '+args:'');this.commandA=this.heap.string(this.commandLine);this.commandW=this.heap.string(this.commandLine,true);
    this.apis=new Win32(this);this.loader=new PELoader(this);
    this.main=this.loader.load(this.exePath,{main:true});requireThat(!this.main.image.isDll,'PE_DLL','Choose an EXE, not a DLL.');this.memory.w32(this.peb+8,this.main.base);
    this.cpu.push(EXIT_TRAP);this.cpu.eip=this.main.entry;this.status='running';
    const init=this.loader.initializers.splice(0);if(init.length)this.sequence(init,()=>{});
    this.emit('loaded',{exe:this.main.image.summary(),modules:this.loader.order.map(m=>({path:m.path,base:hex(m.base)})),missing:this.apis.missingImports(),cwd:this.vfs.cwd,notes:['Original interpreter and partial Win32 runtime. Compatibility is not guaranteed.']});
  }
  handle(type,value){const h=this.nextHandle++;requireThat(this.handles.size<65536,'HANDLE_LIMIT','Guest handle limit reached.');this.handles.set(h,{type,...value});return h;}
  object(handle,type=null){const o=this.handles.get(handle>>>0);return o&&(!type||o.type===type)?o:null;}
  setError(value){this.lastError=value>>>0;this.memory.w32(this.teb+0x34,this.lastError);return 0;}
  note(message){if(!this.runtimeNotes.includes(message)){this.runtimeNotes.push(message);this.emit('log',{level:'warning',message});}}
  call(address,args,then=value=>value){return {call:{address,args},then};}
  wait(check,reason='waiting'){return {wait:check,reason};}
  sequence(calls,done){let i=0;const next=()=>{if(i===calls.length){done();return;}const item=calls[i++];this.callGuest(item.address,item.args,value=>{if(item.dll&&!value)throw new RuntimeFault('DLL_INIT','A packaged DLL rejected DLL_PROCESS_ATTACH.',{module:item.label});next();},item.label);};next();}
  callGuest(address,args,continuation,label='guest callback'){
    requireThat(this.callbacks.size<128,'CALLBACK_LIMIT','Guest callback nesting limit reached.');const savedSp=this.cpu.r[ESP],resume=this.cpu.eip;const sentinel=this.nextCallback;this.nextCallback=(this.nextCallback+16)>>>0;requireThat(this.nextCallback<0xF2000000,'CALLBACK_LIMIT','Guest callback dispatch limit reached.');
    for(let i=args.length-1;i>=0;i--)this.cpu.push(args[i]);this.cpu.push(sentinel);this.cpu.eip=address>>>0;
    this.callbacks.set(sentinel,()=>{const value=this.cpu.r[EAX];requireThat(this.cpu.r[ESP]===savedSp,'CALLBACK_STACK','Guest stdcall callback returned with an unbalanced stack.',{label,expected:hex(savedSp),actual:hex(this.cpu.r[ESP])});this.cpu.eip=resume;continuation(value);});
  }
  resolveResult(result,complete){
    if(result&&typeof result==='object'){
      if(result.call){this.callGuest(result.call.address,result.call.args,value=>this.resolveResult(result.then?result.then(value):value,complete));return;}
      if(result.wait){this.waiting={check:result.wait,reason:result.reason,complete:value=>this.resolveResult(value,complete)};this.emit('waiting',{reason:result.reason});return;}
    }
    complete(result===undefined?0:result);
  }
  bridge(address){
    if(address===EXIT_TRAP){this.exit(this.cpu.r[EAX]);return true;}
    const callback=this.callbacks.get(address);if(callback){this.callbacks.delete(address);callback();return true;}
    const api=this.apis.traps.get(address);if(!api)return false;
    if(!api.fn)throw new RuntimeFault('UNSUPPORTED_API',`Not implemented: ${api.dll}!${api.name}. ${api.reason||'This Windows API has no implementation in this build.'}`,{dll:api.dll,symbol:api.name,caller:hex(this.memory.u32(this.cpu.r[ESP]))});
    const sp=this.cpu.r[ESP],returnAddress=this.memory.u32(sp),args=Array.from({length:api.argc},(_,i)=>this.memory.u32(sp+4+i*4));this.apiStack=sp;this.apiCalls++;this.lastApi=api.dll+'!'+api.name;this.callTrace.push({api:this.lastApi,caller:hex(returnAddress),args:args.map(hex)});if(this.callTrace.length>64)this.callTrace.shift();
    const complete=value=>{this.cpu.r[EAX]=Number(value)>>>0;this.cpu.r[ESP]=(sp+4+(api.cdecl?0:api.argc*4))>>>0;this.cpu.eip=returnAddress;};
    this.resolveResult(api.fn(...args),complete);return true;
  }
  apiArg(index){return this.memory.u32(this.apiStack+4+index*4);}
  poll(){const now=performance.now();for(const t of this.timers.values()){if(now>=t.next){t.next=now+t.period;this.postMessage(t.hwnd,0x113,t.id,t.proc);}}if(this.waiting){const result=this.waiting.check();if(result!==undefined){const w=this.waiting;this.waiting=null;w.complete(result);}}}
  tick(budget=20000,milliseconds=12){if(this.status!=='running')return;this.poll();if(this.waiting)return;const end=performance.now()+milliseconds;
    for(let i=0;i<budget;i++){if(this.status!=='running'||this.waiting)break;if(this.breakpoints.has(this.cpu.eip)){this.pause('Breakpoint at '+hex(this.cpu.eip));break;}this.cpu.step();if(this.cpu.instructions>=this.instructionsLimit)throw new RuntimeFault('INSTRUCTION_LIMIT','Instruction budget exceeded. Increase the explicit limit or inspect a possible infinite loop.',{limit:this.instructionsLimit});if((i&255)===255&&performance.now()>=end)break;}
  }
  pause(reason='Paused by user'){this.status='paused';this.pauseReason=reason;this.emit('status',{status:this.status,reason});}
  resume(){if(this.status==='paused'){this.status='running';this.emit('status',{status:this.status});}}
  stepOne(){if(this.status!=='paused')return;this.poll();if(!this.waiting)this.cpu.step();this.emit('debug',this.debug());}
  exit(code=0){this.status='exited';this.exitCode=code>>>0;this.waiting=null;this.emit('exit',{code:this.exitCode,instructions:this.cpu.instructions});}
  stop(){if(!['exited','stopped','fault'].includes(this.status)){this.status='stopped';this.waiting=null;this.emit('status',{status:this.status,reason:'Stopped by user; virtual files are retained.'});}}
  postMessage(hwnd,message,wParam=0,lParam=0){requireThat(this.messageQueue.length<8192,'MESSAGE_LIMIT','Guest message queue limit reached.');this.messageQueue.push({hwnd:hwnd>>>0,message:message>>>0,wParam:wParam>>>0,lParam:lParam>>>0,time:Math.floor(performance.now()-this.started),x:0,y:0});}
  inputEvent(event){if(event.kind==='console'){const text=String(event.text);requireThat(text.length<=65536&&this.input.length+text.length+2<=1024*1024,'INPUT_LIMIT','Console input queue limit reached.');const data=ansiEncode(text+'\r\n');for(const byte of data)this.input.push(byte);return;}if(event.kind==='dialog'){this.dialogResults.set(event.id,event.result);return;}this.apis.gui.input(event);}
  debug(){return {...this.cpu.snapshot(),status:this.status,waiting:this.waiting?.reason||null,apiCalls:this.apiCalls,lastApi:this.lastApi,committedBytes:this.memory.allocated,mappings:this.memory.mappings(),modules:this.loader.order.map(m=>({path:m.path,base:hex(m.base),size:m.size})),callTrace:[...this.callTrace],missing:this.apis.missingImports(),notes:[...this.runtimeNotes]};}
  fault(error){this.status='fault';const fault=error instanceof RuntimeFault?error.toJSON():{code:'HOST_RUNTIME_ERROR',message:String(error?.message||error),detail:{stack:error?.stack}};this.emit('fault',{...fault,debug:this.debug()});}
}
