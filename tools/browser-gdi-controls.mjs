import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
try{
  const page=await browser.newPage();await page.goto(process.argv[2]||'http://127.0.0.1:8096');
  await page.evaluate(async()=>{
    const {GuestDisplay}=await import(new URL('src/ui/display.js',document.baseURI)),{GuestProcess}=await import(new URL('src/runtime/process.js',document.baseURI)),{readZip}=await import(new URL('src/runtime/zip.js',document.baseURI));
    const entries=await readZip(new Uint8Array(await (await fetch(new URL('demos/browser86-demo.zip',document.baseURI))).arrayBuffer()));
    const root=document.createElement('div');root.id='gdi-test';root.style.cssText='position:fixed;inset:0;z-index:10000;background:white';document.body.append(root);let p;const display=new GuestDisplay(root,event=>p.inputEvent(event));
    p=new GuestProcess({entries,exePath:'C:/app/HelloConsole.exe',emit:(type,data)=>{if(type==='window')display.window(data);else if(type==='draw')display.draw([data]);}});window.gdiTest={p,display};
    const u=(n,...a)=>p.apis.lookup('user32.dll',n).fn(...a),s=x=>p.heap.string(x),menu=u('CreateMenu'),sub=u('CreatePopupMenu');u('AppendMenuA',sub,0,42,s('&Action'));u('AppendMenuA',menu,16,sub,s('&File'));const parent=u('CreateWindowExA',0,s('STATIC'),s('GDI control test'),0x10000000,0,0,260,160,0,menu,0,0);
    const checkbox=u('CreateWindowExA',0,s('BUTTON'),s('Choice'),0x50010003,10,60,150,26,parent,7,0,0),edit=u('CreateWindowExA',0,s('EDIT'),s(''),0x50010000,10,100,150,24,parent,8,0,0);window.gdiTest.checkbox=checkbox;window.gdiTest.edit=edit;window.gdiTest.before=display.windows.get(checkbox).canvas.toDataURL();p.messageQueue=[];
  });
  assert.equal(await page.locator('#gdi-test input,#gdi-test select,#gdi-test details').count(),0);
  const canvas=page.locator('#gdi-test .guest-client > canvas:not(.guest-control)');await canvas.click({position:{x:20,y:11}});await canvas.click({position:{x:40,y:33}});
  const checkbox=page.getByRole('checkbox',{name:'Choice'});await checkbox.click();assert.equal(await checkbox.getAttribute('aria-checked'),'true');
  const edit=page.locator('#gdi-test canvas[role=textbox]');await edit.click();await page.keyboard.type('42');
  const result=await page.evaluate(()=>{const {p,display,checkbox,edit,before}=window.gdiTest;return {selection:p.messageQueue.some(x=>x.message===0x111&&x.wParam===42),changed:before!==display.windows.get(checkbox).canvas.toDataURL(),text:p.apis.gui.window(edit).title,htmlWidgets:document.querySelectorAll('#gdi-test .guest-control:not(canvas)').length};});
  assert.deepEqual(result,{selection:true,changed:true,text:'42',htmlWidgets:0});console.log(JSON.stringify({result:'PASS',checks:['Menu pixels and hit testing use GDI surface','Checkbox pixels change after Win32 state update','Edit keyboard input updates guest text','No HTML guest controls']}));
}finally{await browser.close();}
