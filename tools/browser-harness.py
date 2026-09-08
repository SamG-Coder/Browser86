#!/usr/bin/env python3
"""Offline browser interaction tests for restricted environments.

Runs the original UI/runtime in about:blank without navigating to a server.
The test-only bundler makes existing ES modules into isolated closures.
Fetch, worker module URLs, SHA-256 and origin storage have local test adapters.
The test document omits the application CSP to permit inline test bundles.
This is NOT a test of deployed CSP, HTTP module delivery or real IndexedDB persistence.
Requires Python Playwright and an installed Chromium; never edits browser policy.
"""
from pathlib import Path
import argparse,base64,json,re,shutil,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
IMPORT=re.compile(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?")
def bundle(entry,overrides=None):
    overrides=overrides or {};done=set();parts=['const __modules={};']
    def visit(relative):
        relative=Path(relative).as_posix()
        if relative in done:return
        done.add(relative);source=overrides.get(relative,(ROOT/relative).read_text())
        def replace(match):
            target=(ROOT/relative).parent/match.group(2);key=target.resolve().relative_to(ROOT).as_posix();visit(key)
            return 'const {'+match.group(1).replace(' as ',':')+'}=__modules['+json.dumps(key)+'];'
        source=IMPORT.sub(replace,source);names=[]
        for m in re.finditer(r'export\s+(?:async\s+)?(?:function|class)\s+(\w+)',source):names.append(m.group(1))
        for m in re.finditer(r'export\s+(?:const|let)\s+(\w+)',source):names.append(m.group(1))
        if relative=='src/runtime/cpu.js':names.extend(['EAX','ECX','EDX','EBX','ESP','EBP','ESI','EDI','CF','PF','AF','ZF','SF','TF','IF','DF','OF'])
        source=re.sub(r'\bexport\s+(?=(?:async\s+)?(?:class|function|const|let)\b)','',source)
        source=source.replace('import.meta.url',json.dumps('https://browser86.invalid/'+relative))
        parts.append('__modules['+json.dumps(relative)+']=(()=>{\n'+source+'\nreturn {'+','.join(dict.fromkeys(names))+'};\n})();')
    visit(entry)
    return '\n'.join(parts)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'docs'/'test-artifacts'));args=parser.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    # The original PackageStore calls cannot run in opaque about:blank. A test
    # adapter clones values just as a structured-clone database would.
    store="""export class PackageStore {
      async put(p){globalThis.__testDisk.set(p.id,structuredClone(p));}
      async get(id){const p=globalThis.__testDisk.get(id);return p?structuredClone(p):undefined;}
      async list(){return Array.from(globalThis.__testDisk.values(),p=>({id:p.id,name:p.name,updated:p.updated}));}
      async remove(id){globalThis.__testDisk.delete(id);}
    }"""
    workers={name:bundle('src/'+name) for name in ['import-worker.js','runtime-worker.js']}
    app=bundle('src/app.js',{'src/store.js':store})
    archive=(ROOT/'demos/browser86-demo.zip').read_bytes();digest=list(hashlib.sha256(archive).digest())
    html=(ROOT/'index.html').read_text();html=re.sub(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>', '',html);html=re.sub(r'<link\b[^>]*>', '',html);html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',html);html=html.replace('</head>','<style>'+(ROOT/'styles.css').read_text()+'</style></head>')
    report={'mode':'about:blank, original application code with test-only origin adapters','httpModuleDeliveryTested':False,'realIndexedDBTested':False,'deployedCSPTested':False,'assertions':[]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
        report['browser']=browser.version;page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1);errors=[]
        page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR:',str(e))))
        page.on('console',lambda e:print('BROWSER:',e.text) if e.type=='error' else None)
        page.set_content(html)
        page.evaluate("""({workers,zip,catalog,digest})=>{
          globalThis.__testDisk=new Map();const ls=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,String(v)),removeItem:k=>ls.delete(k)}});
          Object.defineProperty(crypto,'subtle',{value:{digest:async()=>Uint8Array.from(digest).buffer}});
          const bin=Uint8Array.from(atob(zip),c=>c.charCodeAt(0));globalThis.__testZip=bin;
          globalThis.fetch=async input=>String(input).includes('api-catalog.json')?new Response(JSON.stringify(catalog),{headers:{'Content-Type':'application/json'}}):new Response(bin,{headers:{'Content-Type':'application/zip'}});
          const OriginalWorker=Worker;globalThis.Worker=class {constructor(url){const name=String(url).split('/').pop();const blob=URL.createObjectURL(new Blob([workers[name]],{type:'text/javascript'}));const worker=new OriginalWorker(blob);URL.revokeObjectURL(blob);return worker;}};
        }""",{'workers':workers,'zip':base64.b64encode(archive).decode(),'catalog':json.loads((ROOT/'src/api-catalog.json').read_text()),'digest':digest})
        page.add_script_tag(content=app)
        page.screenshot(path=str(out/'initial.png'),full_page=True)
        page.evaluate("(()=>{const dt=new DataTransfer();dt.items.add(new File([__testZip],'browser86-demo.zip',{type:'application/zip'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,cancelable:true}));})()");page.wait_for_timeout(1200);print('Import status:',page.locator('#toast').text_content(),page.locator('#progress-text').text_content());page.wait_for_function("document.querySelectorAll('.exe-option').length===9",timeout=20000)
        report['assertions'].append('Drag/drop flow and original import worker discover nine EXEs from DEFLATE ZIP')
        page.locator('.exe-option').filter(has_text='HelloConsole.exe').click();page.locator('#run').click();page.wait_for_function("document.getElementById('status').dataset.state==='exited'",timeout=20000)
        assert '89' in page.locator('#terminal').inner_text();report['assertions'].append('HelloConsole executes and exits 0 in original runtime Worker')
        page.locator('.exe-option').filter(has_text='WindowStudio.exe').click();page.locator('#run').click();page.locator('.guest-control.button').first.wait_for()
        page.locator('.guest-control.button').filter(has_text='Write virtual file').click();page.wait_for_function("document.querySelector('.guest-control.static')?.textContent.includes('Saved window-note')")
        report['assertions'].append('Browser button enters guest WM_COMMAND callback and writes virtual file')
        page.locator('.guest-control.button').filter(has_text='Message box').click();page.locator('.guest-modal').wait_for();page.screenshot(path=str(out/'window-dialog.png'),full_page=True)
        page.locator('.guest-modal button').filter(has_text='Yes').click();page.wait_for_function("document.querySelector('.guest-control.static')?.textContent.includes('IDYES')")
        report['assertions'].append('Native browser dialog action resumes guest MessageBox with IDYES')
        page.wait_for_timeout(550);page.screenshot(path=str(out/'window-running.png'),full_page=True)
        page.locator('.guest-control.button').filter(has_text='Close').click();page.wait_for_function("document.getElementById('status').dataset.state==='exited'")
        page.wait_for_function("Array.from(__testDisk.values()).some(p=>p.entries.some(e=>e.path.endsWith('window-note.txt')))")
        report['assertions'].append('Runtime Worker transfers changed VFS snapshot after window exits')
        page.locator('.exe-option').filter(has_text='InteractiveConsole.exe').click();page.locator('#run').click();page.wait_for_function("document.getElementById('metric-detail').textContent==='Console input'")
        page.locator('#console-input').fill('Browser input works');page.locator('#console-send').click();page.wait_for_function("document.getElementById('status').dataset.state==='exited'")
        assert 'Guest received' in page.locator('#terminal').inner_text();report['assertions'].append('Console input unblocks guest ReadFile through Worker event transport')
        page.locator('.exe-option').filter(has_text='PixelCanvas.exe').click();page.locator('#run').click();page.wait_for_function("!!document.querySelector('.guest-window canvas')")
        page.wait_for_timeout(800);page.screenshot(path=str(out/'pixel-running.png'),full_page=True)
        nonwhite=page.evaluate("(()=>{const c=document.querySelector('.guest-window canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]!==255||d[i+1]!==255||d[i+2]!==255)n++;return n;})()")
        assert nonwhite>10000;report['assertions'].append(f'Guest-generated DIB rendered to Canvas ({nonwhite} non-white pixels)')
        before=page.evaluate("Array.from(document.querySelector('.guest-window canvas').getContext('2d').getImageData(80,80,1,1).data).join(',')");page.locator('.guest-window canvas').click(position={'x':180,'y':120});page.wait_for_function("before=>Array.from(document.querySelector('.guest-window canvas').getContext('2d').getImageData(80,80,1,1).data).join(',')!==before",arg=before);report['assertions'].append('Canvas mouse input reruns guest pixel loop and changes displayed pixel values')
        page.locator('#pause').click();page.wait_for_function("document.getElementById('status').dataset.state==='paused'");page.locator('#stop').click();page.wait_for_function("document.getElementById('status').dataset.state==='stopped'")
        page.locator('.exe-option').filter(has_text='UnsupportedApi.exe').click();page.locator('#run').click();page.wait_for_function("document.getElementById('status').dataset.state==='fault'");assert 'CreateThread' in page.locator('#terminal').inner_text();report['assertions'].append('Unsupported import is surfaced as visible structured failure')
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'mobile-layout.png'),full_page=True)
        report['pageErrors']=errors;assert not errors,errors
        report['result']='PASS';browser.close()
    (out/'browser-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
