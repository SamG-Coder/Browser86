// Real browser check of the compiled WinForms fixture through canvas controls.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({...(process.env.BROWSER_EXE?{executablePath:process.env.BROWSER_EXE}:{}),headless:true});
try {
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.argv[2]||'http://127.0.0.1:8080');await page.locator('.shell-library').click();await page.locator('#load-managed-demo').click();await page.locator('#run').click();
 await page.locator('.guest-control').nth(3).waitFor();
 await page.locator('.guest-control').nth(1).click();await page.keyboard.press('End');await page.keyboard.type(' Browser test');
 await page.locator('.guest-control').nth(2).click();
 await page.waitForFunction(()=>document.querySelector('.guest-control')?.getAttribute('aria-label')?.includes('Clicks: 1'));
 console.log(JSON.stringify({controls:await page.locator('.guest-control').evaluateAll(ns=>ns.map(n=>({tag:n.tagName,label:n.getAttribute('aria-label')}))),errors}));
 if(errors.length)throw new Error(errors.join('\n'));
 const text=await page.locator('.guest-control').first().getAttribute('aria-label');
 if(text!=='Clicks: 1 - Hello from WinForms Browser test')throw new Error('Managed event did not receive edited text: '+text);
 await page.locator('.guest-control').nth(3).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Exit code 0'));
 console.log('Managed form closed with exit code 0');
}finally{await browser.close();}
