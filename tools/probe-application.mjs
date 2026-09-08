// Executes only in Browser86's interpreter, never as a host executable.
import fs from 'node:fs';
import {readZip} from '../src/runtime/zip.js';
import {PEImage} from '../src/runtime/pe.js';
import {GuestProcess} from '../src/runtime/process.js';
const filename=process.argv[2];if(!filename)throw new Error('Usage: node tools/probe-application.mjs application.zip');
const entries=await readZip(new Uint8Array(fs.readFileSync(filename))),results=[];
for(const entry of entries.filter(e=>/\.exe$/i.test(e.path))){
  const result={path:entry.path},events=[];results.push(result);
  try{
    result.pe=new PEImage(entry.data,entry.path).summary();
    const p=new GuestProcess({entries,exePath:'C:/app/'+entry.path,emit:(type,data)=>events.push({type,...data})});
    const budget=Number(process.argv[3]||100000000);
    for(let i=0;i<Math.ceil(budget/20000)&&p.status==='running'&&!p.waiting;i++)p.tick(20000,50);
    Object.assign(result,{status:p.status,instructions:p.cpu.instructions,lastApi:p.lastApi,waiting:!!p.waiting,debug:p.debug()});
  }catch(error){result.failure={code:error.code,message:error.message,detail:error.detail};}
  result.events=events;
}
console.log(JSON.stringify({package:filename,results},null,2));
