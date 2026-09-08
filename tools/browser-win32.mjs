// Real HTTP-origin regression test. Requires optional npm package playwright.
// Start tools/serve.mjs, then node tools/browser-win32.mjs [url] [browser binary].
// PLAYWRIGHT_MODULE can point to an existing installed Playwright package.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readZip} from '../src/runtime/zip.js';
import {decodePackage} from '../src/backup.js';
import {fileMetadata,VirtualFileSystem} from '../src/runtime/vfs.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'.browser-smoke-output');
const url=process.argv[2]||'http://127.0.0.1:8080';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
const checks=[],pageErrors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('#zip-input').setInputFiles(path.join(root,'demos/browser86-demo.zip'));
  await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===9);
  checks.push('HTTP module and ZIP import workers run under the deployed CSP');
  await page.evaluate(()=>{
    window.cursorStyles=[];
    new MutationObserver(records=>{for(const record of records)if(record.target.tagName==='CANVAS')window.cursorStyles.push(record.oldValue||'',record.target.getAttribute('style')||'');}).observe(document.getElementById('desktop'),{subtree:true,attributes:true,attributeFilter:['style'],attributeOldValue:true});
  });
  for(const [name,message]of [['SyncPrimitives.exe','Synchronization wait resumed.'],['HandleObjects.exe','Handle checks passed.']]){
    if(await page.locator('.sidebar').isHidden())await page.locator('.shell-library').click();
    await page.locator('.exe-option').filter({hasText:name}).click();
    await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('status').dataset.state==='exited');
    assert.ok((await page.locator('#terminal').innerText()).includes(message));
    checks.push(name+' executes in the real runtime module worker');
  }
  const cursorStyles=await page.evaluate(()=>window.cursorStyles);
  assert.ok(cursorStyles.some(style=>style.includes('cursor: default')));
  assert.ok(cursorStyles.some(style=>style.includes('cursor: none')));
  checks.push('Guest SetCursor updates browser canvas cursor styles through the worker bridge');
  const mouseResult=await page.evaluate(async()=>{
    const {GuestDisplay}=await import(new URL('src/ui/display.js',document.baseURI).href),{mouseMessage}=await import(new URL('src/runtime/mouse-messages.js',document.baseURI).href),{classifyClick}=await import(new URL('src/runtime/double-click.js',document.baseURI).href);
    const state={classes:new Map([['inputcheck',{style:8}]]),doubleClickTime:500,lastClick:null};
    const root=document.createElement('div');document.body.append(root);const messages=[],display=new GuestDisplay(root,event=>{const message=mouseMessage(event);classifyClick(state,event,{hwnd:123,className:'InputCheck'},message,event.x,event.y);messages.push(message);});
    try{
      display.window({op:'create',window:{hwnd:123,title:'Input check',className:'InputCheck',style:0x10000000,x:0,y:0,width:100,height:100,visible:true,enabled:true}});
      const canvas=root.querySelector('canvas');
      for(const [button,buttons]of [[0,1],[1,5],[2,7],[3,15],[4,31]])canvas.dispatchEvent(new MouseEvent('mousedown',{button,buttons,shiftKey:true,ctrlKey:true,bubbles:true}));
      canvas.dispatchEvent(new MouseEvent('mouseup',{button:2,buttons:29,bubbles:true}));
      const context=new MouseEvent('contextmenu',{cancelable:true});canvas.dispatchEvent(context);
      const buttonMessages=messages.slice();messages.length=0;state.lastClick=null;
      for(const type of ['mousedown','mouseup','mousedown','mouseup'])canvas.dispatchEvent(new MouseEvent(type,{button:0,buttons:type==='mousedown'?1:0,bubbles:true}));
      return {messages:buttonMessages,doubleMessages:messages,contextPrevented:context.defaultPrevented};
    }finally{display.reset();root.remove();}
  });
  assert.deepEqual(mouseResult.messages,[{message:0x201,wParam:13},{message:0x207,wParam:29},{message:0x204,wParam:31},{message:0x20b,wParam:0x1003f},{message:0x20b,wParam:0x2007f},{message:0x205,wParam:113}]);
  assert.equal(mouseResult.contextPrevented,true);
  checks.push('Browser mouse chords, modifiers and extra buttons translate to Win32 messages');
  assert.deepEqual(mouseResult.doubleMessages.map(message=>message.message),[0x201,0x202,0x203,0x202]);
  checks.push('Browser click timestamps drive CS_DBLCLKS down-up-double-up classification');
  const checkControls=await page.evaluate(async()=>{
    const {GuestDisplay}=await import(new URL('src/ui/display.js',document.baseURI).href),root=document.createElement('div');document.body.append(root);const inputs=[],display=new GuestDisplay(root,event=>inputs.push(event));
    try{
      const base={title:'Options',x:0,y:0,width:240,height:160,visible:true,enabled:true};display.window({op:'create',window:{...base,hwnd:321,className:'Custom',style:0}});
      const control={...base,hwnd:322,parent:321,className:'BUTTON',style:0x40010005,title:'Remember choice',width:180,height:24};
      const states=[];for(const checkState of [0,1,2,0]){display.window({op:'update',window:{...control,checkState}});const node=display.windows.get(322).element;states.push({role:node.getAttribute('role'),checked:node.getAttribute('aria-checked'),tag:node.tagName,label:node.getAttribute('aria-label'),tab:node.tabIndex});}
      const node=display.windows.get(322).element;node.click();const afterClick=node.getAttribute('aria-checked');
      display.window({op:'update',window:{...control,style:0x40000004,checkState:1,enabled:false,title:'Radio choice'}});const radio={role:node.getAttribute('role'),checked:node.getAttribute('aria-checked'),disabled:node.getAttribute('aria-disabled')==='true',tab:node.tabIndex};node.click();
      display.window({op:'update',window:{...control,style:0x40010000,checkState:1,title:'Push'}});const push={role:node.getAttribute('role'),checked:node.getAttribute('aria-checked'),text:node.getAttribute('aria-label')};
      return {states,afterClick,inputs,radio,push};
    }finally{display.reset();root.remove();}
  });
  assert.deepEqual(checkControls.states.map(s=>s.checked),['false','true','mixed','false']);
  assert.ok(checkControls.states.every(s=>s.tag==='CANVAS'));
  assert.ok(checkControls.states.every(s=>s.role==='checkbox'&&s.label==='Remember choice'&&s.tab===0));
  assert.equal(checkControls.afterClick,'false');assert.deepEqual(checkControls.inputs,[{kind:'click',hwnd:322}]);
  assert.deepEqual(checkControls.radio,{role:'radio',checked:'true',disabled:true,tab:-1});assert.deepEqual(checkControls.push,{role:'button',checked:null,text:'Push'});
  checks.push('Checkbox and radio display follows guest state, accessibility, enabled state and style changes');
  const automaticClicks=await page.evaluate(async()=>{
    const {GuestDisplay}=await import(new URL('src/ui/display.js',document.baseURI).href),{GuestProcess}=await import(new URL('src/runtime/process.js',document.baseURI).href),{readZip}=await import(new URL('src/runtime/zip.js',document.baseURI).href);
    const entries=await readZip(new Uint8Array(await (await fetch(new URL('demos/browser86-demo.zip',document.baseURI))).arrayBuffer())),root=document.createElement('div');document.body.append(root);let process;const display=new GuestDisplay(root,event=>process.inputEvent(event));
    try{
      process=new GuestProcess({entries,exePath:'C:/app/HelloConsole.exe',emit:(type,data)=>{if(type==='window')display.window(data);else if(type==='draw')display.draw([data]);}});const u=(n,...a)=>process.apis.lookup('user32.dll',n).fn(...a);
      const parent=u('CreateWindowExA',0,process.heap.string('STATIC'),0,0x10000000,0,0,220,120,0,0,0,0),child=u('CreateWindowExA',0,process.heap.string('BUTTON'),process.heap.string('Automatic'),0x50010006,10,10,180,26,parent,42,0,0),node=display.windows.get(child).element,states=[];
      for(let i=0;i<3;i++){node.click();states.push([u('IsDlgButtonChecked',parent,42),node.getAttribute('aria-checked')]);}
      const radios=[0x20009,9,0x20009].map((style,i)=>u('CreateWindowExA',0,process.heap.string('BUTTON'),process.heap.string('Radio '+i),0x50010000|style,10,40+i*26,180,24,parent,50+i,0,0));
      const radioStates=[];for(const index of [0,1,2]){display.windows.get(radios[index]).element.click();radioStates.push(radios.map(h=>display.windows.get(h).element.getAttribute('aria-checked')));}
      const changing=display.windows.get(radios[0]).element;u('SendMessageA',radios[0],0xf4,0,0x10000);const deferredRole=changing.getAttribute('role');u('SendMessageW',radios[0],0xf4,0,1);const redrawnRole=changing.getAttribute('role');
      const edit=u('CreateWindowExA',0,process.heap.string('EDIT'),process.heap.string('Original'),0x50000800,10,10,100,20,parent,70,0,0),editNode=display.windows.get(edit).element;
      const readOnlyStates=[(editNode.getAttribute('aria-readonly')==='true')];u('SendMessageA',edit,0xcf,0,0);readOnlyStates.push((editNode.getAttribute('aria-readonly')==='true'));editNode.focus();u('SendMessageW',edit,0xcf,1,0);u('SetWindowTextA',edit,process.heap.string('Programmatic'));readOnlyStates.push((editNode.getAttribute('aria-readonly')==='true'),editNode.getAttribute('aria-label'));
      return {states,radioStates,deferredRole,redrawnRole,readOnlyStates,commands:process.messageQueue.filter(m=>m.message===0x111&&m.wParam===42).map(m=>[m.hwnd===parent,m.wParam,m.lParam===child])};
    }finally{display.reset();root.remove();}
  });
  assert.deepEqual(automaticClicks.states,[[1,'true'],[2,'mixed'],[0,'false']]);assert.deepEqual(automaticClicks.commands,Array(3).fill([true,42,true]));
  checks.push('Real runtime automatic checkbox clicks cycle visible state and enqueue parent commands');
  assert.deepEqual(automaticClicks.radioStates,[['true','false','false'],['false','true','false'],['false','true','true']]);
  checks.push('Automatic radio clicks enforce visible WS_GROUP selection boundaries');
  assert.equal(automaticClicks.deferredRole,'radio');assert.equal(automaticClicks.redrawnRole,'button');
  checks.push('BM_SETSTYLE defers display changes until its low-word redraw flag is set');
  assert.deepEqual(automaticClicks.readOnlyStates,[true,false,true,'Programmatic']);
  checks.push('Edit read-only style follows guest messages and allows focused programmatic text updates');
  // Read the actual database; no storage adapter or worker mock is used.
  const savedFile=async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('browser86-packages',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{
      const id=localStorage.getItem('browser86-last-package');
      const pkg=await new Promise((resolve,reject)=>{const r=db.transaction('packages').objectStore('packages').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const file=pkg?.entries.find(e=>e.path==='C:/app/tests/handles.txt');
      if(!file||file.times?.write!==((30000002n<<32n)|789n).toString())return null;
      return {id:file.id,attributes:file.attributes,times:file.times};
    }finally{db.close();}
  };
  await page.waitForFunction(savedFile);
  const metadata=await page.evaluate(savedFile);
  assert.equal(metadata.attributes,128);
  assert.deepEqual(metadata.times,{creation:((30000000n<<32n)|123n).toString(),access:((30000001n<<32n)|456n).toString(),write:((30000002n<<32n)|789n).toString()});
  checks.push('Guest file ID, attributes and exact FILETIMEs reach real IndexedDB');
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===9);
  assert.deepEqual(await page.evaluate(savedFile),metadata);
  checks.push('Metadata and package survive a real page reload');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-zip').click();
  const backup=path.join(output,'win32-backup.zip');await (await downloadPromise).saveAs(backup);
  const restored=new VirtualFileSystem(decodePackage(await readZip(new Uint8Array(await fs.readFile(backup)))).entries);
  assert.deepEqual(fileMetadata(restored.get('C:/app/tests/handles.txt')),metadata);
  assert.equal(restored.get('C:/app/tests/pending.txt'),undefined);
  assert.equal(restored.get('C:/app/tests/temporary.txt'),undefined);
  assert.equal(restored.get('C:/app/tests/disposition.txt'),undefined);
  checks.push('Deleted and delete-on-close guest files are absent from the persisted backup');
  checks.push('Downloaded ZIP preserves file ID, attributes and 100-nanosecond FILETIMEs');
  const oldId=await page.evaluate(()=>localStorage.getItem('browser86-last-package'));
  await page.locator('#zip-input').setInputFiles(backup);
  await page.waitForFunction(previous=>localStorage.getItem('browser86-last-package')!==previous,oldId);
  await page.waitForFunction(savedFile);assert.deepEqual(await page.evaluate(savedFile),metadata);
  checks.push('Backup reimport mounts a new package with the same file metadata');
  await page.screenshot({path:path.join(output,'win32-metadata.png'),fullPage:true});
  assert.deepEqual(pageErrors,[]);
  const report={result:'PASS',url,browser:browser.version(),checks,pageErrors};
  await fs.writeFile(path.join(output,'win32-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
