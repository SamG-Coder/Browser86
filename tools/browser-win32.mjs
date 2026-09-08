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
  for(const [name,message]of [['SyncPrimitives.exe','Synchronization wait resumed.'],['HandleObjects.exe','Handle checks passed.']]){
    await page.locator('.exe-option').filter({hasText:name}).click();
    await page.locator('#run').click();
    await page.waitForFunction(()=>document.getElementById('status').dataset.state==='exited');
    assert.ok((await page.locator('#terminal').innerText()).includes(message));
    checks.push(name+' executes in the real runtime module worker');
  }
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
