import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
const fixtures=JSON.parse(readFileSync(new URL('../demos/managed/fixtures.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const entries=()=>Object.entries(fixtures.files).filter(([path])=>/\.(exe|dll)$/i.test(path)).map(([path,data])=>({path,data:new Uint8Array(Buffer.from(data,'base64'))}));
class Probe {
 constructor(module){this.messages=[];this.listeners=new Set();this.failure=null;this.worker=new Worker(new URL('./helpers/web-worker-node.mjs',import.meta.url),{workerData:{module:new URL(module,import.meta.url).href}});this.worker.on('message',message=>{this.messages.push(message);for(const notify of [...this.listeners])notify();});this.worker.on('error',error=>{this.failure=error;for(const notify of [...this.listeners])notify();});}
 post(message){this.worker.postMessage(message);}
 async wait(predicate,timeout=8000){return new Promise((resolve,reject)=>{const finish=()=>{if(this.failure){clearTimeout(timer);this.listeners.delete(finish);reject(this.failure);return;}const found=this.messages.find(predicate);if(found){clearTimeout(timer);this.listeners.delete(finish);resolve(found);}};const timer=setTimeout(()=>{this.listeners.delete(finish);reject(new Error('Worker response timeout: '+JSON.stringify(this.messages.map(m=>({type:m.type,code:m.code,message:m.message})))));},timeout);this.listeners.add(finish);finish();});}
 async ready(){await this.wait(m=>m.type==='adapter-ready');}
 async close(){await this.worker.terminate();}
}
test('CIL worker: production importer discovers all four compiled managed executables',async t=>{
 const probe=new Probe('../src/import-worker.js');t.after(()=>probe.close());await probe.ready();const bytes=readFileSync(new URL('../demos/browser86-managed.zip',import.meta.url));probe.post({buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),filename:'managed.zip'});const result=await probe.wait(m=>m.type==='complete'||m.type==='error');assert.equal(result.type,'complete',JSON.stringify(result));assert.equal(result.executables.length,4);assert.ok(result.executables.every(e=>e.runtime==='cil'&&e.runnable));assert.ok(result.entries.some(e=>e.path.endsWith('ManagedLibrary.dll')));assert.equal(result.manifest.selected,'C:/app/ManagedForms.exe');
});
test('CIL worker: production runtime executes compiled console code and transfers generated disk data',async t=>{
 const probe=new Probe('../src/runtime-worker.js');t.after(()=>probe.close());await probe.ready();probe.post({type:'start',entries:entries(),exePath:'C:/app/ManagedConsole.exe',args:'"hello world" second'});const end=await probe.wait(m=>m.type==='exit'||m.type==='fault');assert.equal(end.type,'exit',JSON.stringify(end));const snapshot=await probe.wait(m=>m.type==='snapshot'&&m.entries.some(e=>e.path.endsWith('/results/managed.txt')));assert.match(probe.messages.filter(m=>m.type==='stdout').map(m=>m.text).join(''),/CHECKS=28/);assert.ok(probe.messages.some(m=>m.type==='loaded'&&m.runtime==='cil'));assert.equal(new TextDecoder().decode(snapshot.entries.find(e=>e.path.endsWith('/results/managed.txt')).data),'Hello from compiled .NET!\nSaved in the virtual drive.');
});
test('CIL worker: production runtime delivers managed WinForms paint, faults and stop snapshots',async t=>{
 const probe=new Probe('../src/runtime-worker.js');t.after(()=>probe.close());await probe.ready();probe.post({type:'start',entries:entries(),exePath:'C:/app/ManagedForms.exe'});await probe.wait(m=>m.type==='drawBatch'&&m.commands.some(c=>c.op==='ellipse'));probe.post({type:'debug'});const state=await probe.wait(m=>m.type==='debug');assert.equal(state.runtime,'cil');assert.match(state.waiting,/WinForms/);probe.post({type:'stop'});await probe.wait(m=>m.type==='snapshot');const stopped=await probe.wait(m=>m.type==='debug'&&m.status==='stopped');assert.equal(stopped.status,'stopped');
});
test('CIL worker: missing assembly diagnostics cross the worker boundary',async t=>{
 const probe=new Probe('../src/runtime-worker.js');t.after(()=>probe.close());await probe.ready();probe.post({type:'start',entries:entries().filter(e=>!e.path.endsWith('.dll')),exePath:'C:/app/ManagedConsole.exe',args:'"hello world" second'});const fault=await probe.wait(m=>m.type==='fault');assert.equal(fault.code,'CLR_ASSEMBLY_NOT_FOUND');assert.match(fault.message,/ManagedLibrary/);assert.ok(fault.managedStack?.length||fault.debug?.managedStack?.length||fault.detail);
});
