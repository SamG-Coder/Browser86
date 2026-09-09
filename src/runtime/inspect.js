// Shared native/managed import inspection. Runnable means a candidate, not API parity.
import {PEImage} from './pe.js';
import {CLIImage} from './dotnet/metadata.js';
export function inspectExecutable(data,path){
  const fullPath=/^C:\//i.test(path)?path:'C:/app/'+path;
  try {
    const pe=new PEImage(data,fullPath),summary=pe.summary();
    try {
      if(pe.isDll)throw new Error('DLL image, not an application.');
      if(pe.managed){const cli=new CLIImage(pe).validateRunnable();return {...summary,path:fullPath,runnable:true,runtime:'cil',architecture:cli.summary().architecture,managedInfo:cli.summary(),reason:'Experimental managed candidate. Only the documented CIL and Framework subset is implemented.'};}
      pe.validateRunnable();return {...summary,path:fullPath,runnable:true,runtime:'x86',reason:''};
    }catch(error){return {...summary,path:fullPath,runnable:false,reason:error.message};}
  }catch(error){return {path:fullPath,name:path,runnable:false,reason:error.message,architecture:'Unknown'};}
}
export function inspectEntries(entries){return entries.filter(e=>!e.directory&&/\.exe$/i.test(e.path)).map(e=>inspectExecutable(e.data,e.path));}
