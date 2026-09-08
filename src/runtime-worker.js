import {GuestProcess} from './runtime/process.js';
let process=null,loop=null,draws=[],lastStats=0,lastSave=0,lastRevision=-1,snapshotPending=false;
const emit=(type,data)=>{if(type==='draw'){draws.push(data);if(draws.length>=512)flush();}else{if(type==='fault'||type==='exit')flush();postMessage({...data,type});}};
function flush(){if(draws.length){postMessage({type:'drawBatch',commands:draws});draws=[];}}
function snapshot(force=false){if(!process)return;if(!force&&snapshotPending)return;if(force||process.vfs.revision!==lastRevision){const revision=process.vfs.revision;const entries=process.vfs.snapshot();lastRevision=revision;snapshotPending=true;postMessage({type:'snapshot',entries,revision},entries.filter(e=>e.data).map(e=>e.data.buffer));}}
function schedule(){clearTimeout(loop);loop=setTimeout(run,0);}
function run(){if(!process)return;try{process.tick(20000,10);}catch(e){process.fault(e);}flush();const now=performance.now();if(now-lastStats>500){postMessage({type:'stats',status:process.status,instructions:process.cpu.instructions,apiCalls:process.apiCalls,lastApi:process.lastApi,committedBytes:process.memory.allocated,waiting:process.waiting?.reason,elapsedMs:now-process.started});lastStats=now;}if(now-lastSave>3000){snapshot();lastSave=now;}if(['fault','exited','stopped'].includes(process.status)){snapshot(true);return;}loop=setTimeout(run,process.status==='paused'?60:process.waiting?12:0);}
self.onmessage=event=>{const msg=event.data;try{
  if(msg.type==='start'){clearTimeout(loop);draws=[];lastRevision=-1;snapshotPending=false;lastStats=-Infinity;lastSave=performance.now();process=null;process=new GuestProcess({...msg,emit});schedule();}
  else if(msg.type==='saved'){snapshotPending=false;}
  else if(msg.type==='pause'){process?.pause();postMessage({type:'debug',...process.debug()});}
  else if(msg.type==='resume'){process?.resume();schedule();}
  else if(msg.type==='step'){process?.stepOne();flush();snapshot();}
  else if(msg.type==='stop'){process?.stop();clearTimeout(loop);flush();snapshot(true);postMessage({type:'debug',...process.debug()});}
  else if(msg.type==='input'){process?.inputEvent(msg.event);if(process?.status==='running')schedule();}
  else if(msg.type==='debug'){if(process)postMessage({type:'debug',...process.debug()});}
  else if(msg.type==='breakpoints'){if(process)process.breakpoints=new Set(msg.addresses.map(a=>a>>>0));}
  else if(msg.type==='files'){if(process)postMessage({type:'files',files:process.vfs.metadata()});}
  else if(msg.type==='readFile'){if(process){const data=process.vfs.readFile(msg.path).slice();postMessage({type:'file',path:msg.path,data},[data.buffer]);}}
  else if(msg.type==='snapshot')snapshot(true);
}catch(e){if(process)process.fault(e);else postMessage({type:'fault',code:e.code||'LOAD_ERROR',message:e.message,detail:e.detail});}};
