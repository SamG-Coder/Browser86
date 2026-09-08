import {RuntimeFault} from './errors.js';
import {checkBuffer} from './files.js';
import {normalizePath} from './vfs.js';

export function renameFileByHandle(api,f,input,size){
  const p=api.p,m=api.m,v=api.vfs;
  // x86 FILE_RENAME_INFO: BOOLEAN + padding, HANDLE, DWORD, WCHAR[].
  if(size<16)return api.fail(24);if(!input)return api.fail(87);
  if(!f.deleteAccess)return api.fail(5);
  checkBuffer(m,input,12,'r');
  const replace=!!m.u8(input),root=m.u32(input+4),length=m.u32(input+8);
  if(!length||length%2||length>65534||length>size-12)return api.fail(87);
  checkBuffer(m,input+12,length,'r');let name='';
  for(let i=0;i<length;i+=2)name+=String.fromCharCode(m.u16(input+12+i));
  if(name.startsWith(':'))throw new RuntimeFault('UNSUPPORTED_FILE_INFO','Renaming alternate data streams is not implemented.');
  let base=v.cwd;
  if(root){const directory=p.object(root,'file');if(!directory?.directory)return api.fail(6);if(directory.node.deletePending)return api.fail(5);base=directory.path;}
  let path;
  try{path=normalizePath(name,base);}catch(error){if(error.code==='VFS_PATH')return api.fail(123);if(error.code==='VFS_DRIVE')return api.fail(17);throw error;}
  return moveFileObject(api,f.node,path,replace);
}

export function moveFileObject(api,source,path,replace=false){
  const v=api.vfs,target=v.get(path),parent=v.get(path.slice(0,path.lastIndexOf('/'))||'C:/');
  if(source.deletePending||target?.deletePending||parent?.deletePending)return api.fail(5);
  if(source.directory){
    const key=source.path.toLowerCase(),destination=path.toLowerCase(),cwd=v.cwd.toLowerCase();
    if(key==='c:/')return api.fail(5);
    if(destination.startsWith(key+'/'))return api.fail(87);
    if(cwd===key||cwd.startsWith(key+'/'))return api.fail(5);
    if([...v.nodes.values()].some(n=>n.path.toLowerCase().startsWith(key+'/')&&n.openObjects))return api.fail(5);
    if([...v.nodes.values()].some(n=>n.path.toLowerCase().startsWith(key+'/')&&path.length+n.path.length-source.path.length>32767))return api.fail(206);
  }
  if(!parent?.directory)return api.fail(3);
  if(target&&target!==source){
    if(!replace)return api.fail(183);
    if(target.directory||target.attributes&1||target.openObjects)return api.fail(5);
  }
  // Validate everything before removing a replacement; no growth is required.
  if(target&&target!==source)v.remove(target.path);
  v.rename(source.path,path);return 1;
}
