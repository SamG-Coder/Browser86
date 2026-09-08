import fs from 'node:fs';
import {createRequire} from 'node:module';
import {guest} from '../tests/helpers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {p,events}=guest('HelloConsole.exe'),call=(name,...a)=>p.apis.lookup('gdi32.dll',name).fn(...a),dc=p.apis.gui.newDC(1),input=p.heap.alloc(64);
const loop=[[3,3],[27,3],[27,27],[3,27],[3,3],[27,3],[27,27],[3,27]];
loop.flat().forEach((n,i)=>p.memory.w32(input+4*i,n));call('SelectObject',dc,call('GetStockObject',8));call('SelectObject',dc,call('GetStockObject',4));
const commands=[];for(const mode of [1,2,3]){call('SetPolyFillMode',dc,mode);call('Polygon',dc,input,8);commands.push(events.filter(e=>e.type==='draw').at(-1));}
[[3,3],[27,3],[27,27]].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));call('SelectObject',dc,call('CreatePen',0,2,0));call('SelectObject',dc,call('GetStockObject',5));
for(const name of ['Polyline','Polygon']){call(name,dc,input,3);commands.push(events.filter(e=>e.type==='draw').at(-1));}
const counts=p.heap.alloc(8);p.memory.w32(counts,4);p.memory.w32(counts+4,4);
call('SelectObject',dc,call('GetStockObject',8));call('SelectObject',dc,call('GetStockObject',4));
for(const [mode,reverse] of [[1,false],[2,false],[2,true]]){
 const outer=[[3,3],[27,3],[27,27],[3,27]],inner=[[9,9],[21,9],[21,21],[9,21]];if(reverse)inner.reverse();
 [...outer,...inner].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));call('SetPolyFillMode',dc,mode);call('PolyPolygon',dc,input,counts,2);commands.push(events.filter(e=>e.type==='draw').at(-1));
}
[[3,3],[3,19],[27,19],[27,3]].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));call('SelectObject',dc,call('CreatePen',0,4,0));
call('PolyBezier',dc,input,4);commands.push(events.filter(e=>e.type==='draw').at(-1));call('MoveToEx',dc,3,3,0);call('PolyBezierTo',dc,input+8,3);commands.push(events.filter(e=>e.type==='draw').at(-1));
const types=p.heap.alloc(4);p.memory.write(types,Uint8Array.from([6,4,4,4]));call('PolyDraw',dc,input,types,4);commands.push(events.filter(e=>e.type==='draw').at(-1));
[[3,3],[27,3],[27,27]].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));p.memory.write(types,Uint8Array.from([6,2,3]));call('PolyDraw',dc,input,types,3);commands.push(events.filter(e=>e.type==='draw').at(-1));
const penBrush=p.heap.alloc(12),geometric=call('ExtCreatePen',0x12200,8,penBrush,0,0);call('SelectObject',dc,geometric);
[[5,31],[16,19],[27,31]].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));for(const limit of [0x41200000,0x3f800000]){call('SetMiterLimit',dc,limit,0);call('Polyline',dc,input,3);commands.push(events.filter(e=>e.type==='draw').at(-1));}
const dashArray=p.heap.alloc(8);[[3,15],[27,15]].flat().forEach((n,i)=>p.memory.w32(input+4*i,n));for(const dash of [[4,4],[20,4]]){dash.forEach((n,i)=>p.memory.w32(dashArray+4*i,n));call('SelectObject',dc,call('ExtCreatePen',0x12207,4,penBrush,2,dashArray));call('Polyline',dc,input,2);commands.push(events.filter(e=>e.type==='draw').at(-1));}
call('SelectObject',dc,call('ExtCreatePen',0x10005,99,penBrush,0,0));call('Polyline',dc,input,2);commands.push(events.filter(e=>e.type==='draw').at(-1));
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
try{
 const page=await browser.newPage();await page.goto(process.argv[2]);
 const results=await page.evaluate(async commands=>{
  const {GuestDisplay}=await import('/src/ui/display.js');const display=new GuestDisplay(null,()=>{}),canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d',{alpha:false});display.windows.set(1,{context});
  return commands.map(command=>{context.fillStyle='#ffffff';context.fillRect(0,0,32,32);display.draw([command]);return Array.from(context.getImageData(15,15,1,1).data);});
 },commands);
 const expected=[255,0,255,255,0,255,0,255,0,0,0,0,0,255,255,0,255];results.forEach((pixel,i)=>{if(pixel[0]!==expected[i]||pixel[1]!==expected[i]||pixel[2]!==expected[i])throw Error('Polygon canvas case '+i+' failed: '+pixel);});
 const report={result:'PASS',browser:browser.version(),checks:['alternate leaves double-wound interior empty','winding fills double-wound interior','raw mode 3 uses alternate coverage','polyline remains open','polygon closes its outline','alternate nested contours leave a hole','winding nested contours with same direction fill','winding nested contours with opposite directions leave a hole'],pixels:results};
 report.checks.push('PolyBezier draws cubic curve through its midpoint','PolyBezierTo draws from current position through its midpoint');
 report.checks.push('PolyDraw renders cubic segments','PolyDraw closes a line figure');
 report.checks.push('geometric miter join extends within limit 10','geometric miter join bevels at limit 1');
 report.checks.push('user-style gap remains empty','user-style dash paints its span');
 report.checks.push('extended null pen leaves canvas unchanged');
 fs.writeFileSync('docs/test-artifacts/null-pen-canvas-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
