#!/usr/bin/env python3
"""Real-origin browser smoke test. Start tools/serve.mjs separately.

Requires Python Playwright and Chromium. No mocks, policy changes, CSP overrides
or guest execution on the host. This script needs a normal browser environment
that permits navigation to the supplied local server.
"""
from pathlib import Path
import argparse,json,shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8080')
    parser.add_argument('--chromium',default=shutil.which('chromium'))
    parser.add_argument('--output',default=str(ROOT/'.browser-smoke-output'))
    args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    checks=[];errors=[]
    with sync_playwright() as pw:
        kwargs={'headless':True}
        if args.chromium:kwargs['executable_path']=args.chromium
        browser=pw.chromium.launch(**kwargs)
        page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(args.url,wait_until='networkidle')
        page.locator('#zip-input').set_input_files(str(ROOT/'demos/browser86-demo.zip'))
        page.wait_for_function("document.querySelectorAll('.exe-option').length===9",timeout=30000)
        checks.append('Real-origin module import and ZIP import worker under deployed CSP')
        page.locator('.exe-option').filter(has_text='HelloConsole.exe').click()
        page.locator('#run').click()
        page.wait_for_function("document.getElementById('status').dataset.state==='exited'")
        assert '89' in page.locator('#terminal').inner_text()
        checks.append('Console EXE executes in runtime worker')
        page.locator('.exe-option').filter(has_text='WindowStudio.exe').click();page.locator('#run').click()
        page.locator('.guest-control.button').filter(has_text='Write virtual file').click()
        page.wait_for_function("document.querySelector('.guest-control.static')?.textContent.includes('Saved window-note')")
        page.locator('.guest-control.button').filter(has_text='Message box').click()
        page.locator('.guest-modal button').filter(has_text='Yes').click()
        page.wait_for_function("document.querySelector('.guest-control.static')?.textContent.includes('IDYES')")
        page.screenshot(path=str(out/'window.png'),full_page=True)
        page.locator('.guest-control.button').filter(has_text='Close').click()
        page.wait_for_function("document.getElementById('status').dataset.state==='exited'")
        page.wait_for_function("document.getElementById('save-state').textContent.startsWith('Saved locally')")
        # Read the actual browser database, not application-memory state.
        saved=page.evaluate("""async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('browser86-packages',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});const all=await new Promise((ok,no)=>{const r=db.transaction('packages').objectStore('packages').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});db.close();return all.some(p=>p.entries.some(e=>e.path.endsWith('window-note.txt')));} """)
        assert saved;checks.append('Guest callback writes a file that reaches real IndexedDB')
        page.reload(wait_until='networkidle')
        page.wait_for_function("document.querySelectorAll('.exe-option').length===9")
        assert 'WindowStudio' in page.locator('.exe-option.selected').inner_text()
        checks.append('Package and selected EXE restore after actual page reload')
        with page.expect_download() as capture:page.locator('#export-zip').click()
        download=capture.value;backup=out/'virtual-disk-backup.zip';download.save_as(str(backup));assert backup.stat().st_size>0
        checks.append('Virtual-disk export produces a real downloadable ZIP')
        page.locator('#zip-input').set_input_files(str(backup))
        page.wait_for_function("document.querySelectorAll('.exe-option').length===9")
        checks.append('Backup ZIP is accepted for reimport')
        assert not errors,errors
        report={'result':'PASS','browser':browser.version,'url':args.url,'checks':checks,'pageErrors':errors}
        (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));browser.close()
if __name__=='__main__':main()
