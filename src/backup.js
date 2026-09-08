import {writeZip} from './runtime/zip.js';
import {requireThat} from './runtime/errors.js';
import {normalizePath,fileMetadata,validateFileMetadata} from './runtime/vfs.js';

export function exportPackage(pkg){
  const manifest={format:'browser86-virtual-disk',version:1,name:pkg.name,selected:pkg.selected,args:pkg.args||'',fileMetadata:[]};
  const entries=pkg.entries.map(e=>{
    const path=/^[a-z]:/i.test(e.path)?e.path:'C:/app/'+e.path;
    requireThat(/^C:\//i.test(path),'BACKUP_PATH','Only virtual C: can be exported.');
    if(e.id!==undefined){validateFileMetadata(e);manifest.fileMetadata.push({path:normalizePath(path),...fileMetadata(e)});}
    return {...e,path:'drive-c/'+path.slice(3)};
  });
  entries.push({path:'browser86-backup.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
  return writeZip(entries);
}
export function decodePackage(entries){
  const marker=entries.find(e=>e.path==='browser86-backup.json'&&!e.directory);if(!marker)return {entries,manifest:null};
  let manifest;try{manifest=JSON.parse(new TextDecoder().decode(marker.data));}catch{return {entries,manifest:null};}
  if(manifest.format!=='browser86-virtual-disk')return {entries,manifest:null};
  requireThat(manifest.version===1,'BACKUP_VERSION','Unsupported Browser86 backup version.');
  const metadata=new Map();
  if(manifest.fileMetadata!==undefined){
    requireThat(Array.isArray(manifest.fileMetadata)&&manifest.fileMetadata.length<=entries.length,'BACKUP_METADATA','Invalid backup metadata list.');
    for(const info of manifest.fileMetadata){
      validateFileMetadata(info);
      requireThat(typeof info.path==='string'&&/^C:\//i.test(info.path),'BACKUP_METADATA','Invalid backup metadata path.');
      const key=normalizePath(info.path).toLowerCase();
      requireThat(!metadata.has(key),'BACKUP_METADATA','Duplicate backup metadata path.');metadata.set(key,fileMetadata(info));
    }
  }
  const restored=entries.filter(e=>e!==marker).map(e=>{
    requireThat(e.path==='drive-c'||e.path.startsWith('drive-c/'),'BACKUP_PATH','Unexpected path in virtual-disk backup.');
    const path=e.path==='drive-c'?'C:/':'C:/'+e.path.slice(8),key=normalizePath(path).toLowerCase(),info=metadata.get(key);
    metadata.delete(key);return {...e,path,...info};
  });
  requireThat(!metadata.size,'BACKUP_METADATA','Backup metadata names a missing file.');
  return {entries:restored,manifest};
}
