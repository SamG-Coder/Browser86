import {PEImage} from './pe.js';
import {ManagedAssembly} from './managed/metadata.js';
import {normalizePath} from './vfs.js';
// Shared import/restore classification. A runnable candidate is not a compatibility guarantee.
export function inspectExecutable(data,path){
 const fullPath=normalizePath(path);
 try{const image=new PEImage(data,path);let summary=image.summary(),runnable=true,reason='';
  try{if(image.managed){const assembly=new ManagedAssembly(data,path);summary=assembly.summary();assembly.validateRunnable();}else{image.validateRunnable();if(image.isDll){runnable=false;reason='DLL image, not an application.';}}}catch(e){runnable=false;reason=e.message;}
  return {path:fullPath,...summary,runnable,reason};
 }catch(e){return {path:fullPath,name:path,runnable:false,reason:e.message,architecture:'Unknown'};}
}
