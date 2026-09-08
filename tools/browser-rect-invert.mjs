import fs from 'node:fs';
import {createRequire} from 'node:module';
import {guest} from '../tests/helpers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const vectors=JSON.parse(fs.readFileSync('tests/invert-rect-vectors.json','utf8'));
const {p,events}=guest('HelloConsole.exe'),call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(1),r=call('CreateRectRgn',1,1,7,7);
const input=p.heap.alloc(16);[7,7,1,1].forEach((n,i)=>p.memory.w32(input+4*i,n));p.apis.lookup('user32.dll','InvertRect').fn(dc,input);const command=events.filter(e=>e.type==='draw').at(-1);
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
try{
 const page=await browser.newPage();await page.goto(process.argv[2]);
 const results=await page.evaluate(async({vectors,command})=>{
  const {GuestDisplay}=await import('/src/ui/display.js'),display=new GuestDisplay(null,()=>{}),canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const context=canvas.getContext('2d',{alpha:false});display.windows.set(1,{context});
  const pixels=()=>{const bytes=context.getImageData(0,0,8,8).data;return Array.from({length:64},(_,i)=>bytes[i*4]|bytes[i*4+1]<<8|bytes[i*4+2]<<16);};
  return vectors.map(v=>{display.draw([{hwnd:1,op:'fill',x:0,y:0,width:8,height:8,color:v.color}]);display.draw([command]);const inverted=pixels();display.draw([command]);const restored=pixels();display.draw([{hwnd:1,op:'fill',x:0,y:0,width:8,height:8,color:v.color}]);return {color:v.color,pixels:inverted,restored,followingFill:pixels()};});
 },{vectors,command});
 for(let i=0;i<vectors.length;i++){const v=vectors[i],r=results[i];if(JSON.stringify(v.pixels)!==JSON.stringify(r.pixels)||JSON.stringify(v.restored)!==JSON.stringify(r.restored)||!r.followingFill.every(c=>c===v.color))throw Error('RGB inversion mismatch '+i);}
 const report={result:'PASS',browser:browser.version(),checks:15,description:'Five colors: all 64 pixels match native inversion and restoration, and subsequent fills retain normal compositing.',results};fs.writeFileSync('docs/test-artifacts/invert-rect-canvas-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,browser:report.browser,checks:report.checks}));
}finally{await browser.close();}
