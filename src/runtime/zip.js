// Original ZIP container reader/writer. DEFLATE is supplied by the browser,
// not by Wine, a native executable, a third-party ZIP library or a remote service.
import {RuntimeFault, requireThat} from './errors.js';
const enc = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
export function crc32(data) { let c = 0xFFFFFFFF; for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const decodeName = (bytes, utf8) => utf8 ? new TextDecoder('utf-8', {fatal:true}).decode(bytes) : Array.from(bytes, b => b < 128 ? String.fromCharCode(b) : CP437[b - 128]).join('');
export function safeZipPath(name) {
  name = name.replace(/\\/g, '/');
  requireThat(name.length > 0 && name.length <= 1024 && !name.startsWith('/') && !/^[A-Za-z]:/.test(name) && !/[\x00-\x1F:]/.test(name), 'ZIP_PATH', 'Unsafe or invalid archive path.', {path:name});
  const parts = name.split('/').filter(Boolean);
  requireThat(parts.length && parts.every(p => p !== '..' && p !== '.' && !/[. ]$/.test(p)), 'ZIP_PATH', 'Archive path traversal or ambiguous Windows filename rejected.', {path:name});
  return parts.join('/');
}
export const ZIP_LIMITS = Object.freeze({archiveBytes:256*1024*1024, expandedBytes:512*1024*1024, entryBytes:128*1024*1024, entries:20000, ratio:1000});
export async function readZip(input, onProgress = () => {}, limits = ZIP_LIMITS) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireThat(b.length <= limits.archiveBytes, 'ZIP_LIMIT', 'Archive exceeds the 256 MiB import limit.');
  const d = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const within = (p,n) => requireThat(Number.isSafeInteger(p) && p >= 0 && n >= 0 && p+n <= b.length, 'ZIP_TRUNCATED', 'ZIP structure points beyond the archive.');
  const u16 = p => {within(p,2);return d.getUint16(p,true);};
  const u32 = p => {within(p,4);return d.getUint32(p,true);};
  let eocd = -1;
  for(let p=b.length-22; p>=Math.max(0,b.length-65557); p--) {
    if(u32(p) === 0x06054B50 && p+22+u16(p+20) === b.length) {eocd=p;break;}
  }
  requireThat(eocd >= 0,'ZIP_FORMAT','This file has no valid ZIP end record.');
  requireThat(u16(eocd+4) === 0 && u16(eocd+6) === 0 && u16(eocd+8) === u16(eocd+10),'ZIP_MULTIDISK','Multi-disk ZIP files are not supported.');
  const count=u16(eocd+10), csize=u32(eocd+12), coff=u32(eocd+16);
  requireThat(count !== 65535 && coff !== 0xFFFFFFFF && csize !== 0xFFFFFFFF,'ZIP64','ZIP64 is not implemented. Use a conventional ZIP under the size limits.');
  requireThat(count <= limits.entries,'ZIP_LIMIT','Archive contains too many entries.');
  within(coff,csize); requireThat(coff+csize <= eocd,'ZIP_FORMAT','Invalid central directory.');
  let p=coff,total=0; const records=[], names=new Set();
  for(let i=0;i<count;i++) {
    requireThat(u32(p) === 0x02014B50,'ZIP_FORMAT','Invalid ZIP central directory entry.');
    const flags=u16(p+8), method=u16(p+10), crc=u32(p+16), compressed=u32(p+20), size=u32(p+24);
    const nl=u16(p+28), el=u16(p+30), cl=u16(p+32), attr=u32(p+38), local=u32(p+42);
    within(p+46,nl+el+cl);
    requireThat(!(flags & 0x41),'ZIP_ENCRYPTED','Encrypted ZIP files are not supported.');
    requireThat(method === 0 || method === 8,'ZIP_METHOD',`ZIP compression method ${method} is not implemented. Use Store or Deflate.`);
    requireThat(compressed !== 0xFFFFFFFF && size !== 0xFFFFFFFF && local !== 0xFFFFFFFF,'ZIP64','ZIP64 entries are not implemented.');
    requireThat(u16(p+34)===0,'ZIP_MULTIDISK','Split archives are not supported.');
    const original=decodeName(b.subarray(p+46,p+46+nl),!!(flags&0x800));
    const path=safeZipPath(original), key=path.toLowerCase();
    requireThat(!names.has(key),'ZIP_COLLISION','Two archive entries map to the same case-insensitive Windows path.',{path});names.add(key);
    const mode=(attr>>>16)&0xF000;
    requireThat(mode !== 0xA000,'ZIP_SYMLINK','Symbolic links are not permitted in imported packages.',{path});
    requireThat(size <= limits.entryBytes && size <= Math.max(1024*1024, compressed*limits.ratio),'ZIP_LIMIT','Archive entry exceeds decompression limits.',{path});
    total+=size; requireThat(total<=limits.expandedBytes,'ZIP_LIMIT','Expanded archive exceeds the 512 MiB limit.');
    const directory=original.endsWith('/') || original.endsWith('\\') || mode===0x4000;
    records.push({path,directory,flags,method,crc,compressed,size,local});p+=46+nl+el+cl;
  }
  requireThat(p===coff+csize,'ZIP_FORMAT','Central directory size is inconsistent.');
  // Reject file-versus-directory ambiguity before allocating any output.
  const files=new Set(records.filter(r=>!r.directory).map(r=>r.path.toLowerCase()));
  for(const r of records) { const parts=r.path.toLowerCase().split('/'); for(let i=1;i<parts.length;i++) requireThat(!files.has(parts.slice(0,i).join('/')),'ZIP_COLLISION','A file is also used as a directory.',{path:r.path}); }
  let done=0;
  for(const r of records) {
    requireThat(u32(r.local)===0x04034B50,'ZIP_FORMAT','Missing local file header.',{path:r.path});
    requireThat(u16(r.local+8)===r.method && u16(r.local+6)===r.flags,'ZIP_FORMAT','Local and central ZIP metadata disagree.',{path:r.path});
    const nl=u16(r.local+26), el=u16(r.local+28), start=r.local+30+nl+el;
    within(start,r.compressed);
    requireThat(start+r.compressed<=coff,'ZIP_FORMAT','Archive data overlaps its directory.');
    const lname=decodeName(b.subarray(r.local+30,r.local+30+nl),!!(r.flags&0x800));
    requireThat(safeZipPath(lname)===r.path,'ZIP_PATH','Local and central filenames disagree.');
    if(r.directory) {requireThat(r.size===0,'ZIP_FORMAT','Directory has nonempty data.');r.data=new Uint8Array();}
    else if(r.method===0) {requireThat(r.compressed===r.size,'ZIP_FORMAT','Stored entry has inconsistent lengths.');r.data=b.slice(start,start+r.size);}
    else {
      let ds;try{ds=new DecompressionStream('deflate-raw');}catch{throw new RuntimeFault('BROWSER_DEFLATE','This browser lacks raw DEFLATE support. Use a recent Chrome, Edge or Firefox.');}
      const reader=new Blob([b.subarray(start,start+r.compressed)]).stream().pipeThrough(ds).getReader();
      const chunks=[];let size=0;
      try {for(;;){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>r.size || size>limits.entryBytes){await reader.cancel();throw new RuntimeFault('ZIP_LIMIT','Decompressed entry exceeds its declared size.',{path:r.path});}chunks.push(v.value);}}
      catch(e){if(e instanceof RuntimeFault)throw e;throw new RuntimeFault('ZIP_DEFLATE','Invalid compressed data.',{path:r.path});}
      requireThat(size===r.size,'ZIP_FORMAT','Decompressed entry has the wrong size.',{path:r.path});
      r.data=new Uint8Array(size);let o=0;for(const c of chunks){r.data.set(c,o);o+=c.length;}
    }
    requireThat(crc32(r.data)===r.crc,'ZIP_CRC','CRC32 verification failed.',{path:r.path});
    onProgress({completed:++done,entries:count,path:r.path,expandedBytes:total});
  }
  return records.map(({path,data,directory})=>({path,data,directory}));
}
export function writeZip(entries) {
  // Deliberately use STORE for deterministic, dependency-free backup export.
  const parts=[], directory=[];let offset=0;
  const make=(n)=>{const b=new Uint8Array(n);return [b,new DataView(b.buffer)];};
  for(const entry of entries) {
    let path=safeZipPath(entry.path);if(entry.directory)path+='/';
    const name=enc.encode(path),data=entry.directory?new Uint8Array():new Uint8Array(entry.data), crc=crc32(data);
    requireThat(name.length<65536 && data.length<0xFFFFFFFF,'ZIP_LIMIT','Export entry is too large.');
    const [h,v]=make(30+name.length);v.setUint32(0,0x04034B50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);
    v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);
    const [c,w]=make(46+name.length);w.setUint32(0,0x02014B50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(38,entry.directory?0x10:0,true);w.setUint32(42,offset,true);c.set(name,46);
    parts.push(h,data);directory.push(c);offset+=h.length+data.length;
  }
  requireThat(entries.length<65535,'ZIP_LIMIT','Too many files to export.');
  const csize=directory.reduce((n,b)=>n+b.length,0),[end,e]=make(22);e.setUint32(0,0x06054B50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,csize,true);e.setUint32(16,offset,true);
  const out=new Uint8Array(offset+csize+22);let p=0;for(const chunk of [...parts,...directory,end]){out.set(chunk,p);p+=chunk.length;}return out;
}
