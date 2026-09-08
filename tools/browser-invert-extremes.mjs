import fs from 'node:fs';
import {createRequire} from 'node:module';
import {guest} from '../tests/helpers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const vectors=JSON.parse(fs.readFileSync('tests/invert-rect-extreme-vectors.json','utf8'));
const {p,events}=guest('HelloConsole.exe'),dc=p.apis.gui.newDC(1),input=p.heap.alloc(16),invert=p.apis.lookup('user32.dll','InvertRect').fn;
const cases=vectors.map(v=>{v.rect.forEach((n,i)=>p.memory.w32(input+4*i,n));const start=events.length,result=invert(dc,input);if(result!==v.result)throw Error('Return mismatch');return {...v,commands:events.slice(start).filter(e=>e.type==='draw')};});
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
try{
 const page=await browser.newPage();await page.goto(process.argv[2]);
 const results=await page.evaluate(async cases=>{
  const {GuestDisplay}=await import('/src/ui/display.js'),display=new GuestDisplay(null,()=>{}),canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const context=canvas.getContext('2d',{alpha:false});display.windows.set(1,{context});
  return cases.map(v=>{context.fillStyle='#000000';context.fillRect(0,0,8,8);display.draw(v.commands);const bytes=context.getImageData(0,0,8,8).data;return Array.from({length:64},(_,i)=>bytes[i*4]|bytes[i*4+1]<<8|bytes[i*4+2]<<16);});
 },cases);
 const failures=cases.flatMap((v,i)=>JSON.stringify(v.pixels)===JSON.stringify(results[i])?[]:[{rect:v.rect,actual:results[i],expected:v.pixels}]);
 const report={result:failures.length?'FAIL':'PASS',browser:browser.version(),checks:cases.length,failures};fs.writeFileSync('docs/test-artifacts/invert-extremes-canvas-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
}finally{await browser.close();}
