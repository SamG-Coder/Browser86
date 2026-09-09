import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GuestProcess} from '../src/runtime/process.js';
import {PEImage} from '../src/runtime/pe.js';
import {CLIImage,BlobReader} from '../src/runtime/dotnet/metadata.js';
import {inspectExecutable,inspectEntries} from '../src/runtime/inspect.js';
import {FloatValue,ManagedException,binary,compare,convert,clone,text,ref} from '../src/runtime/dotnet/values.js';
import {writeZip,readZip} from '../src/runtime/zip.js';
const fixture=JSON.parse(fs.readFileSync(new URL('../demos/managed/fixtures.json',import.meta.url),'utf8'));
const files=Object.fromEntries(Object.entries(fixture.files).map(([name,b64])=>[name,new Uint8Array(Buffer.from(b64,'base64'))]));
const entries=()=>Object.entries(files).filter(([name])=>/\.(exe|dll)$/i.test(name)).map(([path,data])=>({path,data:data.slice()}));
const source=(name='ManagedConsole.exe')=>new CLIImage(new PEImage(files[name].slice(),name));
const normalize=s=>s.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trimEnd();
function launch(name='ManagedConsole.exe',options={}){const events=[];const p=new GuestProcess({entries:entries(),exePath:'C:/app/'+name,args:'"hello world" second',emit:(type,data)=>events.push({type,...data}),...options});return {p,events};}
function drain(p){for(let i=0;i<1000&&p.status==='running';i++){p.tick(10000,50);if(p.waiting)break;}return p;}
function stdout(events){return events.filter(e=>e.type==='stdout').map(e=>e.text).join('');}
function bcl(vm,type,name,args=[],params=[],ret='System.Void',hasThis=false){return vm.library.invoke({type:{fullName:type},name,signature:{hasThis,params:params.map(fullName=>({fullName})),ret:{fullName:ret}}},args);}
function managedThrows(fn,type){assert.throws(fn,e=>e instanceof ManagedException&&e.value.type.fullName==='System.'+type);}

test('managed fixtures were compiled by the Microsoft .NET Framework compiler',()=>{assert.match(fixture.compiler,/Microsoft \.NET Framework/);assert.ok(files['native-console.txt'].length);assert.ok(files['ManagedLibrary.dll'].length);});
for(const name of Object.keys(files).filter(n=>/\.(exe|dll)$/.test(n))){
 test('parse real CLI tables and every method body: '+name,()=>{const image=source(name);image.validateRunnable({dll:/\.dll$/.test(name)});assert.match(image.version,/v4\.0\.30319/);assert.ok(image.counts[6]>0);for(const method of image.methods.values())if(method.row.RVA)assert.ok(image.methodBody(method).code.length);});
}
test('inspection selects CIL execution and lists assembly dependencies',()=>{const result=inspectExecutable(files['ManagedConsole.exe'],'ManagedConsole.exe');assert.equal(result.runtime,'cil');assert.equal(result.runnable,true);assert.match(result.architecture,/x86/);assert.ok(result.managedInfo.assemblyReferences.includes('ManagedLibrary'));assert.equal(inspectExecutable(files['ManagedAnyCPU.exe'],'AnyCPU.exe').architecture,'AnyCPU / CIL');});
test('shared inspection rejects DLLs and malformed executables',()=>{assert.equal(inspectExecutable(files['ManagedLibrary.dll'],'Renamed.exe').runnable,false);assert.equal(inspectExecutable(new Uint8Array(40),'Broken.exe').runnable,false);assert.equal(inspectEntries(entries()).length,4);});
test('the native-only PE validator still rejects managed stubs',()=>{assert.throws(()=>new PEImage(files['ManagedConsole.exe']).validateRunnable(),e=>/CLR|NET/.test(e.message));});
test('managed DLL can resolve as a dependency but not as Main',()=>{assert.throws(()=>source('ManagedLibrary.dll').validateRunnable(),e=>e.code==='PE_DLL');source('ManagedLibrary.dll').validateRunnable({dll:true});});
test('mixed-mode and native entry point flags are rejected',()=>{for(const flags of [0,0x11]){const image=source();image.flags=flags;assert.throws(()=>image.validateRunnable(),e=>e.code==='CLR_MIXED_MODE');}});
test('x64 image is not mislabeled AnyCPU runnable',()=>{const image=source();image.pe.machine=0x8664;image.pe.is64=true;assert.throws(()=>image.validateRunnable(),e=>e.code==='UNSUPPORTED_CLR_ARCH');});
test('corrupt CLI metadata signature is rejected before executing',()=>{const bytes=files['ManagedConsole.exe'].slice(),pe=new PEImage(bytes),header=pe.rva(pe.directories[14].rva,72),start=pe.rva(pe.u32(header+8),20);bytes[start]=0;assert.throws(()=>new CLIImage(new PEImage(bytes)),e=>e.code==='CLR_METADATA');});
test('metadata tokens and compressed integers reject truncated or reserved data',()=>{const image=source();assert.throws(()=>image.row(0x0600ffff),e=>e.code==='CLR_METADATA');for(const bytes of [[0x80],[0xc0,0,0],[0xff]])assert.throws(()=>new BlobReader(Uint8Array.from(bytes)).uint(),e=>e.code==='CLR_METADATA');});
for(const [name,reference]of [['ManagedConsole.exe','native-console.txt'],['ManagedAnyCPU.exe','native-anycpu.txt'],['ManagedVB.exe','native-vb.txt']]){
 test('compiled '+name+' exactly matches native Windows stdout',()=>{const {p,events}=launch(name);drain(p);assert.equal(p.status,'exited');assert.equal(p.exitCode,0);assert.equal(normalize(stdout(events)),normalize(new TextDecoder().decode(files[reference])));assert.equal(events.find(e=>e.type==='exit').runtime,'cil');if(name!=='ManagedVB.exe'){assert.equal(stdout(events).match(/^PASS /gm).length,28);assert.ok(p.vfs.exists('results/managed.txt'));assert.ok(p.managed.assemblies.has('managedlibrary'));}else assert.equal(new TextDecoder().decode(p.vfs.readFile('vb-result.txt')),'VB.NET sum=55');});
}
test('per-process static fields and managed heaps are isolated',()=>{for(let i=0;i<2;i++){const {p,events}=launch();drain(p);assert.match(stdout(events),/CHECKS=28/);assert.equal(p.exitCode,0);}});
test('missing managed DLL produces an assembly-specific diagnostic',()=>{const {p}=launch('ManagedConsole.exe',{entries:entries().filter(e=>e.path!=='ManagedLibrary.dll')});assert.throws(()=>drain(p),e=>e.code==='CLR_ASSEMBLY_NOT_FOUND'&&/ManagedLibrary/.test(e.message));});
test('pause, single step, resume and explicit stop operate on managed IL',()=>{const {p}=launch();p.pause();const before=p.cpu.instructions;p.tick();assert.equal(p.cpu.instructions,before);p.stepOne();assert.equal(p.cpu.instructions,before+1);p.resume();p.tick(5);assert.ok(p.cpu.instructions>before+1);p.stop();const stopped=p.cpu.instructions;p.tick();assert.equal(p.status,'stopped');assert.equal(p.cpu.instructions,stopped);});
test('managed instruction budget faults instead of looping forever',()=>{const {p}=launch('ManagedConsole.exe',{instructionLimit:20});assert.throws(()=>drain(p),e=>e.code==='INSTRUCTION_LIMIT');});
test('managed allocation budget and array bounds are enforced',()=>{const {p}=launch();p.managed.heapBudget=p.managed.allocatedBytes+10;assert.throws(()=>p.managed.array({fullName:'System.Int32'},50),e=>e.code==='CLR_HEAP_LIMIT');assert.throws(()=>p.managed.array({fullName:'System.Int32'},1000001),e=>e.code==='CLR_ARRAY_LIMIT');});
test('unsupported CIL opcode reports method and exact IL offset',()=>{const {p}=launch();p.managed.frames.at(-1).body.code[0]=0xff;assert.throws(()=>p.tick(),e=>e.code==='CLR_UNSUPPORTED_OPCODE'&&e.detail.offset===0&&!!e.detail.methodToken);});
test('unsupported Framework method is never treated as a successful stub',()=>{const {p}=launch();assert.throws(()=>bcl(p.managed,'System.Threading.Thread','Sleep',[1],['System.Int32']),e=>e.code==='CLR_UNSUPPORTED_BCL'&&/Thread::Sleep/.test(e.message));});
test('managed debugger reports CIL frames and JSON-safe trace, not fake x86 registers',()=>{const {p}=launch();p.tick(3);const d=p.debug();assert.equal(d.runtime,'cil');assert.ok(d.managed.frames.length);assert.ok(d.registers.METHOD);assert.doesNotThrow(()=>JSON.stringify(d));});
test('int64 formatting never rounds through an IEEE double',()=>{const {p}=launch();assert.equal(p.managed.library.formatValue(9007199254740995n,'D'),'9007199254740995');assert.equal(p.managed.library.paramText(-1n,{fullName:'System.UInt64'}),'18446744073709551615');assert.equal(p.managed.library.paramText(-1,{fullName:'System.UInt32'}),'4294967295');});
test('boxed booleans/chars preserve their type through composite formatting',()=>{const {p}=launch();assert.equal(p.managed.library.format('{0}:{1}',[{tag:'box',type:{fullName:'System.Boolean'},value:1},{tag:'box',type:{fullName:'System.Char'},value:65}]),'True:A');});
test('VFS read failure is a catchable System.IO exception',()=>{const {p}=launch();managedThrows(()=>bcl(p.managed,'System.IO.File','ReadAllText',['missing.txt'],['System.String'],'System.String'),'IO.FileNotFoundException');});
test('managed Console.ReadLine waits and resumes through the existing input queue',()=>{const {p}=launch();const pending=bcl(p.managed,'System.Console','ReadLine',[],[],'System.String');assert.equal(pending.reason,'Managed console input');assert.equal(pending.wait(),undefined);p.inputEvent({kind:'console',text:'interactive value'});assert.equal(pending.wait(),'interactive value');});
test('managed integer, float, checked and unordered operations keep CLI categories',()=>{assert.equal(binary('add',2147483647,1),-2147483648);assert.equal(binary('add',9007199254740993n,2n),9007199254740995n);assert.equal(binary('shr',-2147483648,31,{unsigned:true}),1);assert.equal(binary('div',-7,2),-3);managedThrows(()=>binary('div',1,0),'DivideByZeroException');managedThrows(()=>binary('add',2147483647,1,{checked:true}),'OverflowException');assert.equal(convert(new FloatValue(1.1),'r4').value,Math.fround(1.1));assert.equal(compare('gt',new FloatValue(NaN),new FloatValue(1),true),true);});
test('value type copies separate fields while reference objects preserve identity',()=>{const a={valueType:true,fields:new Map([['x',1]])},b=clone(a);b.fields.set('x',2);assert.equal(a.fields.get('x'),1);const o={tag:'object',fields:new Map()};assert.equal(clone(o),o);});
test('TypeSpec arrays do not infinitely recurse during resolution',()=>{const {p}=launch();const t={token:0x1b000001,et:0x1d,fullName:'System.Int32[]'};assert.equal(p.managed.resolveType(t),t);});
test('compiled WinForms EXE uses real Win32 windows, GDI paint, edits, delegates and file save',()=>{
 const {p,events}=launch('ManagedForms.exe');drain(p);assert.equal(p.status,'running');assert.equal(p.waiting?.reason,'Managed WinForms messages');
 const windows=()=>[...p.apis.gui.windows.values()],find=text=>windows().find(w=>w.title===text);
 assert.ok(find('Browser86 - compiled .NET Framework WinForms'));assert.equal(windows().length,5);
 assert.ok(events.some(e=>e.type==='draw'&&e.op==='ellipse'));assert.ok(events.some(e=>e.type==='draw'&&e.op==='rectangle'));
 const edit=find('Hello from WinForms'),save=find('Click and save'),close=find('Close');
 p.inputEvent({kind:'edit',hwnd:edit.hwnd,text:'Edited by the regression test'});
 p.inputEvent({kind:'click',hwnd:save.hwnd});drain(p);
 assert.equal(p.status,'running');assert.equal(new TextDecoder().decode(p.vfs.readFile('winforms-result.txt')),'Clicks: 1 - Edited by the regression test');
 assert.ok(find('Clicks: 1 - Edited by the regression test'));
 p.pause();p.stepOne();assert.equal(p.status,'paused');p.resume();
 p.inputEvent({kind:'click',hwnd:save.hwnd});drain(p);assert.equal(new TextDecoder().decode(p.vfs.readFile('winforms-result.txt')),'Clicks: 2 - Edited by the regression test');
 p.inputEvent({kind:'click',hwnd:close.hwnd});drain(p);assert.equal(p.status,'exited');assert.equal(p.exitCode,0);assert.equal(windows().length,0);
});
test('managed demo archive roundtrips the exact compiler-produced PE bytes',async()=>{const zip=writeZip(entries()),decoded=await readZip(zip);for(const item of decoded)assert.deepEqual(item.data,files[item.path]);assert.equal(inspectEntries(decoded).filter(x=>x.runnable).length,4);});
