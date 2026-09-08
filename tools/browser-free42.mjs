// External application acceptance test. The runtime contains no calculator code.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.argv[2]||'http://127.0.0.1:8096',archive=process.argv[3]||'.build/free42/Free42Windows-32bit.zip',out=process.argv[4]||'.build/free42/acceptance';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE}),results=[];
const hash=data=>createHash('sha256').update(data).digest('hex');
try{
 for(const name of ['Free42Binary.exe','Free42Decimal.exe']){
  const context=await browser.newContext({viewport:{width:1440,height:1200}}),page=await context.newPage();
  await page.goto(url);await page.locator('#zip-input').setInputFiles(archive);await page.waitForFunction(()=>document.querySelectorAll('.exe-option').length===2);
  await page.locator('.exe-option').filter({hasText:name}).click();await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='fault'||document.querySelector('#metric-detail').textContent==='Window messages'&&Number(document.querySelector('#metric-instructions').textContent.replaceAll(',',''))>20000000,null,{timeout:60000});
  const canvas=page.locator('.guest-client > canvas'),pixels=async()=>Buffer.from((await canvas.evaluate(c=>c.toDataURL())).split(',')[1],'base64');
  const result={name,initial:hash(await pixels())};
  for(const [x,y] of [[170,536],[75,389],[229,536],[288,583]]){await canvas.click({position:{x,y},delay:100});await page.waitForTimeout(300);}
  await page.waitForTimeout(300);const calculation=await pixels();result.calculation=hash(calculation);await fs.writeFile(`${out}/${name}-addition.png`,calculation);assert.notEqual(result.initial,result.calculation);
  assert.equal(result.calculation,'d3a0e9571b7f800bedf06bca81767ccc1f8d3f45269f8c605ebf16a254b7ce0c','Visually verified 5.0000 calculator image changed');
  await canvas.click({position:{x:294,y:389},delay:100});await page.waitForTimeout(500);const cleared=await pixels();result.cleared=hash(cleared);await fs.writeFile(`${out}/${name}-clear.png`,cleared);assert.notEqual(result.cleared,result.calculation);
  assert.equal(result.cleared,'b146075c47d88510193977c076341c1dc2d407ad6dcb4eeb020aa7086e512810','Visually verified 0.0000 calculator image changed');
  await page.locator('.guest-titlebar button').click();await page.waitForFunction(()=>['fault','exited'].includes(document.querySelector('#status').dataset.state),null,{timeout:15000});
  result.status=await page.locator('#status').getAttribute('data-state');result.detail=await page.locator('#metric-detail').innerText();result.terminal=await page.locator('#terminal').innerText();results.push(result);await page.waitForFunction(()=>document.querySelector('#save-state').textContent.startsWith('Saved locally'));await page.reload();await page.waitForFunction(()=>!document.querySelector('#run').disabled);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='fault'||document.querySelector('#metric-detail').textContent==='Window messages',null,{timeout:60000});result.reloadStatus=await page.locator('#status').getAttribute('data-state');result.reloadTerminal=await page.locator('#terminal').innerText();assert.equal(result.reloadStatus,'running',result.reloadTerminal);await context.close();
 }
 await fs.writeFile(`${out}/report.json`,JSON.stringify({url,archive,archiveSHA256:hash(await fs.readFile(archive)),results},null,2));
 assert.ok(results.every(r=>r.status==='exited'&&r.detail==='Exit code 0'),JSON.stringify(results));
 assert.equal(results[0].calculation,results[1].calculation,'Both EXEs should paint the same verified addition image');
 assert.equal(results[0].cleared,results[1].cleared,'Both EXEs should paint the same cleared image');
 console.log(JSON.stringify({result:'PASS',results},null,2));
}finally{await browser.close();}

