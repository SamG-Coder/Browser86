import fs from 'node:fs/promises';
import {readZip} from '../src/runtime/zip.js';
import {GuestProcess} from '../src/runtime/process.js';
import {CPU,ESP} from '../src/runtime/cpu.js';
import {Memory} from '../src/runtime/memory.js';
export const demoEntries=await readZip(new Uint8Array(await fs.readFile(new URL('../demos/browser86-demo.zip',import.meta.url))));
export function guest(exe,options={}){const events=[];const p=new GuestProcess({entries:demoEntries,exePath:'C:/app/'+exe,emit:(type,data)=>events.push({type,...data}),...options});return {p,events,output:()=>events.filter(e=>e.type==='stdout').map(e=>e.text).join('')};}
export function run(p,max=5_000_000){const start=p.cpu.instructions;while(p.status==='running'&&!p.waiting){p.tick(20000,50);if(p.cpu.instructions-start>max)throw new Error('Test instruction limit exceeded');}return p;}
export function machine(bytes){const m=new Memory(4*1024*1024);m.map(0x10000,0x10000,'rwx','test code/data');m.map(0x20000,0x10000,'rw','test stack');m.write(0x10000,Uint8Array.from(bytes));const c=new CPU(m);c.eip=0x10000;c.r[ESP]=0x2FFF0;return {c,m};}
