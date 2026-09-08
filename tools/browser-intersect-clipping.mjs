import fs from 'node:fs';
import {createRequire} from 'node:module';
import {guest} from '../tests/helpers.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {p,events}=guest('HelloConsole.exe'),m=p.memory,call=(n,...a)=>p.apis.lookup('gdi32.dll',n).fn(...a),dc=p.apis.gui.newDC(1),clip=call('CreateRectRgn',2,2,6,6),full=call('CreateRectRgn',0,0,8,8),cases=[];
call('IntersectClipRect',dc,0,0,6,8);call('IntersectClipRect',dc,2,2,8,6);call('SelectObject',dc,call('GetStockObject',4));
function capture(name,fn,mode='clipped'){const start=events.length;fn();cases.push({name,mode,commands:events.slice(start).filter(e=>e.type==='draw')});}
capture('solid fill',()=>call('FillRgn',dc,full,call('GetStockObject',4)));
capture('line',()=>{call('MoveToEx',dc,0,4,0);call('LineTo',dc,8,4);});
const points=p.heap.alloc(32);[0,0,8,0,8,8,0,8].forEach((n,i)=>m.w32(points+i*4,n));capture('polygon',()=>call('Polygon',dc,points,4));
capture('inversion',()=>call('InvertRgn',dc,full));
const text=p.heap.alloc(2);m.w8(text,77);capture('text',()=>call('TextOutA',dc,0,0,text,1));
capture('bitmap transport',()=>p.apis.gui.draw(dc,{op:'pixels',pixelWidth:1,pixelHeight:1,rgba:Uint8Array.from([0,0,0,255]),sourceX:0,sourceY:0,sourceWidth:1,sourceHeight:1,x:0,y:0,width:8,height:8}));
call('SaveDC',dc);call('SelectClipRgn',dc,call('CreateRectRgn',0,0,0,0));capture('empty clip',()=>call('FillRgn',dc,full,call('GetStockObject',4)),'empty');call('RestoreDC',dc,-1);capture('restored clip',()=>call('FillRgn',dc,full,call('GetStockObject',4)));call('SelectClipRgn',dc,0);capture('removed clip',()=>call('FillRgn',dc,full,call('GetStockObject',4)),'full');
const browser=await chromium.launch({headless:true,executablePath:process.argv[3]});
try{const page=await browser.newPage();await page.goto(process.argv[2]);const results=await page.evaluate(async cases=>{
 const {GuestDisplay}=await import('/src/ui/display.js'),display=new GuestDisplay(null,()=>{}),canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const context=canvas.getContext('2d',{alpha:false});display.windows.set(1,{context});
 return cases.map(v=>{context.fillStyle='#ffffff';context.fillRect(0,0,8,8);display.draw(v.commands);const data=context.getImageData(0,0,8,8).data;return Array.from({length:64},(_,i)=>data[i*4]);});
},cases);for(let i=0;i<cases.length;i++){const v=cases[i],pixels=results[i];let painted=0;pixels.forEach((n,j)=>{const x=j%8,y=Math.floor(j/8),inside=x>=2&&x<6&&y>=2&&y<6;if(n!==255)painted++;if(v.mode==='empty'&&n!==255||v.mode==='clipped'&&!inside&&n!==255||v.mode==='full'&&n!==0)throw Error(v.name+' escaped clip');});if(v.mode!=='empty'&&!painted)throw Error(v.name+' drew nothing');}
 const report={result:'PASS',browser:browser.version(),checks:cases.map(v=>v.name)};fs.writeFileSync('docs/test-artifacts/intersect-clip-canvas-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
