import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
try{
  const page=await browser.newPage();await page.goto(process.argv[2]||'http://127.0.0.1:8096');
  await page.evaluate(async()=>{
    const {GuestDisplay}=await import(new URL('src/ui/display.js',document.baseURI)),{GuestProcess}=await import(new URL('src/runtime/process.js',document.baseURI)),{readZip}=await import(new URL('src/runtime/zip.js',document.baseURI));
    const entries=await readZip(new Uint8Array(await (await fetch(new URL('demos/browser86-demo.zip',document.baseURI))).arrayBuffer()));
    const root=document.createElement('div');document.body.append(root);let p;const display=new GuestDisplay(root,event=>p.inputEvent(event));
    p=new GuestProcess({entries,exePath:'C:/app/HelloConsole.exe',emit:(type,data)=>{if(type==='window')display.window(data);}});window.menuTest=p;
    const u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),s=x=>p.heap.string(x),menu=u('CreateMenu'),sub=u('CreatePopupMenu');u('AppendMenuA',sub,0,42,s('&Action'));u('AppendMenuA',sub,3,43,s('Disabled'));u('AppendMenuA',menu,16,sub,s('&File'));u('CreateWindowExA',0,s('STATIC'),s('Menu test'),0x10000000,0,0,220,100,0,menu,0,0);p.messageQueue=[];
  });
  await page.locator('.guest-menu-bar summary').click();assert.equal(await page.getByRole('button',{name:'Disabled',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Action',exact:true}).click();
  const messages=await page.evaluate(()=>window.menuTest.messageQueue);assert.ok(messages.some(x=>x.message===0x117));assert.ok(messages.some(x=>x.message===0x111&&x.wParam===42));
  console.log(JSON.stringify({result:'PASS',checks:['Menu hierarchy renders','Disabled commands cannot be selected','Opening submenu sends initialization messages','Selection sends guest WM_COMMAND']}));
}finally{await browser.close();}
