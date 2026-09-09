import {GuestProcess} from './process.js';
import {ManagedProcess} from './managed/runtime.js';
import {PEImage} from './pe.js';
import {normalizePath} from './vfs.js';
import {requireThat} from './errors.js';
export function createProcess(options){
 const path=normalizePath(options.exePath).toLowerCase();
 const entry=options.entries.find(e=>!e.directory&&normalizePath(e.path).toLowerCase()===path);
 requireThat(entry,'VFS_NOT_FOUND','Selected executable was not found in the virtual drive.',{path:options.exePath});
 const image=new PEImage(entry.data,options.exePath);
 return image.managed?new ManagedProcess(options):new GuestProcess(options);
}
