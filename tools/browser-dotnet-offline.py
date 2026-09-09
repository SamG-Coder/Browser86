#!/usr/bin/env python3
"""Offline managed UI/worker smoke test. NOT an HTTP, CSP or IndexedDB test.
Uses the existing test bundler and in-memory origin adapters; no browser policy changes.
Requires Python Playwright and Chromium. Run from any directory.
"""
from pathlib import Path
import base64, hashlib, importlib.util, json, re, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('browser_harness',ROOT/'tools/browser-harness.py')
harness=importlib.util.module_from_spec(spec);spec.loader.exec_module(harness)
store='''export class PackageStore {async put(p){__testDisk.set(p.id,structuredClone(p));}async get(id){return structuredClone(__testDisk.get(id));}async list(){return Array.from(__testDisk.values(),p=>({id:p.id,name:p.name,updated:p.updated}));}async remove(id){__testDisk.delete(id);}}'''
workers={name:harness.bundle('src/'+name) for name in ['import-worker.js','runtime-worker.js']}
app=harness.bundle('src/app.js',{'src/store.js':store})
fixture=json.loads((ROOT/'demos/managed/fixtures.json').read_text())
html=(ROOT/'index.html').read_text();html=re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>','',html);html=re.sub(r'<link\b[^>]*>','',html);html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=html.replace('</head>','<style>'+(ROOT/'styles.css').read_text()+'\n'+(ROOT/'src/ui/desktop-shell.css').read_text()+'</style></head>')
out=ROOT/'docs/managed-test-artifacts';out.mkdir(parents=True,exist_ok=True)
report={'mode':'Offline about:blank; original application and workers with test-only origin adapters','httpModuleDeliveryTested':False,'realIndexedDBTested':False,'deployedCSPTested':False,'checks':[]}
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    report['browser']=browser.version;page=browser.new_page(viewport={'width':1440,'height':1000});errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(html)
    page.evaluate('''({workers,fixture,catalog})=>{
      globalThis.__testDisk=new Map();const ls=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,String(v))}});
      Object.defineProperty(crypto,'subtle',{value:{digest:async()=>new Uint8Array(32).buffer}});
      globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes('fixtures.json')?fixture:catalog),{headers:{'Content-Type':'application/json'}});
      const Original=Worker;globalThis.Worker=class{constructor(url){const blob=URL.createObjectURL(new Blob([workers[String(url).split('/').pop()]],{type:'text/javascript'}));const w=new Original(blob);URL.revokeObjectURL(blob);return w;}};
    }''',{'workers':workers,'fixture':fixture,'catalog':json.loads((ROOT/'src/api-catalog.json').read_text())})
    page.add_script_tag(content=app)
    page.locator('.shell-library').click();page.locator('#load-managed-demo').click()
    page.wait_for_function("document.querySelectorAll('.exe-option').length===4")
    report['checks'].append('Compiled managed demo package imported by the original import worker; four runnable EXEs')
    for name,expected in [('ManagedConsole.exe','CHECKS=28'),('ManagedAnyCPU.exe','CHECKS=28'),('ManagedVB.exe','SUM=55')]:
        if page.locator('.sidebar').is_hidden():page.locator('.shell-library').click()
        page.locator('.exe-option').filter(has_text=name).click();page.locator('#args').fill('"hello world" second');page.locator('#run').click()
        page.wait_for_function("['exited','fault'].includes(document.getElementById('status').dataset.state)")
        assert page.locator('#status').get_attribute('data-state')=='exited',page.locator('#terminal').inner_text()
        assert expected in page.locator('#terminal').inner_text()
        assert 'CIL instructions executed' in page.locator('#terminal').inner_text()
        report['checks'].append(name+' executes through runtime Worker and displays expected output')
    page.locator('.shell-library').click();page.locator('.exe-option').filter(has_text='ManagedForms.exe').click();page.locator('#run').click()
    page.get_by_role('button',name='Click and save',exact=True).wait_for()
    assert page.get_by_role('button',name='Click and save',exact=True).evaluate('e=>e.tagName')=='CANVAS'
    page.get_by_role('textbox',name='Hello from WinForms',exact=True).click();page.keyboard.press('End');page.keyboard.type('!')
    page.get_by_role('button',name='Click and save',exact=True).click()
    page.wait_for_function("!!document.querySelector('canvas[aria-label=\"Clicks: 1 - Hello from WinForms!\"]')")
    report['checks'].append('Canvas EDIT keyboard input reaches compiled Click handler; guest label is updated')
    colors=page.locator('.guest-window .guest-client > canvas').first.evaluate('''c=>{const d=c.getContext('2d').getImageData(40,190,1,1).data;return Array.from(d);}''')
    assert colors[:3]==[30,120,200],colors
    report['checks'].append('Compiled System.Drawing FillRectangle reaches GDI and paints expected pixel [30,120,200]')
    page.screenshot(path=str(out/'managed-winforms.png'),full_page=True)
    page.get_by_role('button',name='Close',exact=True).click();page.wait_for_function("document.getElementById('status').dataset.state==='exited'")
    page.wait_for_function("Array.from(__testDisk.values()).some(p=>p.entries.some(e=>e.path.endsWith('winforms-result.txt')))")
    saved=page.evaluate("Array.from(__testDisk.values()).flatMap(p=>p.entries).filter(e=>e.path.endsWith('winforms-result.txt')).map(e=>new TextDecoder().decode(e.data))[0]")
    assert saved=='Clicks: 1 - Hello from WinForms!',saved
    report['checks'].append('Guest close exits Main and sends saved virtual file to the test store adapter')
    assert not errors,errors
    report['pageErrors']=errors;report['result']='PASS';browser.close()
(out/'offline-browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
