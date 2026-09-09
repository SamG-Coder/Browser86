// Real HTTP-origin .NET smoke test. Start tools/serve.mjs first.
// npm install --no-save playwright; npx playwright install chromium
// node tools/browser-dotnet.mjs [url] [browser-executable]
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'docs/managed-test-artifacts');await fs.mkdir(out,{recursive:true});
const url=process.argv[2]||'http://127.0.0.1:8080',browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
const report={mode:'Real HTTP origin; unmodified CSP, module workers and IndexedDB',url,browser:browser.version(),checks:[],pageErrors:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>report.pageErrors.push(String(e)));
 await page.goto(url,{waitUntil:'networkidle'});await page.locator('.shell-library').click();await page.locator('#load-managed-demo').click();await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===4);
 report.checks.push('Managed fixture loader, package import module worker and CIL inspection work under the served CSP');
 for(const [name,expected]of [['ManagedConsole.exe','CHECKS=28'],['ManagedAnyCPU.exe','CHECKS=28'],['ManagedVB.exe','SUM=55']]){
   if(await page.locator('.sidebar').isHidden())await page.locator('.shell-library').click();await page.locator('.exe-option').filter({hasText:name}).click();await page.locator('#args').fill('"hello world" second');await page.locator('#run').click();
   await page.waitForFunction(()=>['exited','fault'].includes(document.getElementById('status').dataset.state));const output=await page.locator('#terminal').innerText();assert.equal(await page.locator('#status').getAttribute('data-state'),'exited',output);assert.ok(output.includes(expected),output);assert.ok(output.includes('CIL instructions executed'));report.checks.push(name+' executes in a real runtime module worker and exits 0');
 }
 await page.locator('.shell-library').click();await page.locator('.exe-option').filter({hasText:'ManagedForms.exe'}).click();await page.locator('#run').click();await page.getByRole('button',{name:'Click and save',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Click and save',exact:true}).evaluate(e=>e.tagName),'CANVAS');
 await page.getByRole('textbox',{name:'Hello from WinForms',exact:true}).click();await page.keyboard.press('End');await page.keyboard.type('!');await page.getByRole('button',{name:'Click and save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Clicks: 1 - Hello from WinForms!"]'));
 report.checks.push('Browser keyboard and mouse input execute compiled WinForms event handlers; guest controls are Canvas surfaces');
 await page.waitForFunction(()=>{const c=document.querySelector('.guest-window .guest-client > canvas'),d=c?.getContext('2d').getImageData(40,190,1,1).data;return d?.[0]===30&&d[1]===120&&d[2]===200;});report.checks.push('Compiled System.Drawing call reaches the GDI bridge and produces the expected pixel');
 await page.screenshot({path:path.join(out,'managed-winforms-http.png'),fullPage:true});await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>document.getElementById('status').dataset.state==='exited');
 const saved=async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('browser86-packages',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{const id=localStorage.getItem('browser86-last-package'),pkg=await new Promise((resolve,reject)=>{const q=db.transaction('packages').objectStore('packages').get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const file=pkg?.entries.find(e=>e.path.endsWith('winforms-result.txt'));return file?new TextDecoder().decode(file.data):null;}finally{db.close();}};
 await page.waitForFunction(saved);assert.equal(await page.evaluate(saved),'Clicks: 1 - Hello from WinForms!');report.checks.push('Worker snapshots persist the managed file in real IndexedDB');
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===4);assert.equal(await page.evaluate(saved),'Clicks: 1 - Hello from WinForms!');report.checks.push('Reload restores managed executable inspection and saved file contents');
 // Test standalone EXE importing independently from the demo loader.
 const fixture=JSON.parse(await fs.readFile(path.join(root,'demos/managed/fixtures.json'),'utf8'));
 await page.locator('#zip-input').setInputFiles({name:'ManagedVB.exe',mimeType:'application/vnd.microsoft.portable-executable',buffer:Buffer.from(fixture.files['ManagedVB.exe'],'base64')});await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===1);await page.locator('#run').click();await page.waitForFunction(()=>document.getElementById('status').dataset.state==='exited');assert.ok((await page.locator('#terminal').innerText()).includes('SUM=55'));report.checks.push('Standalone managed EXE import follows the same execution path');
 assert.deepEqual(report.pageErrors,[]);report.result='PASS';
}finally{await browser.close();await fs.writeFile(path.join(out,'http-browser-report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
