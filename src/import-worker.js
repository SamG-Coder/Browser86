import {readZip} from './runtime/zip.js';
import {inspectEntries} from './runtime/inspect.js';
import {decodePackage} from './backup.js';
self.onmessage=async event=>{try{const raw=event.data.filename&&/\.exe$/i.test(event.data.filename)?[{path:event.data.filename.replace(/^.*[\\/]/,''),data:new Uint8Array(event.data.buffer)}]:await readZip(event.data.buffer,progress=>postMessage({type:'progress',...progress}));const {entries,manifest}=decodePackage(raw);const executables=inspectEntries(entries);postMessage({type:'complete',entries,executables,manifest},entries.map(e=>e.data.buffer));}catch(e){postMessage({type:'error',code:e.code||'IMPORT_ERROR',message:e.message,detail:e.detail});}};
