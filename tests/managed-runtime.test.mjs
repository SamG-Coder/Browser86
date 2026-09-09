import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ManagedProcess} from '../src/runtime/managed/runtime.js';
import {ManagedAssembly,SignatureReader} from '../src/runtime/managed/metadata.js';
import {ManagedException,ManagedRef,Real,copy} from '../src/runtime/managed/values.js';
import {arithmetic,compare,convert} from '../src/runtime/managed/numeric.js';
import {decodeIL} from '../src/runtime/managed/il.js';
import {invokeIntrinsic} from '../src/runtime/managed/framework.js';
import {inspectExecutable} from '../src/runtime/inspect.js';
import {createProcess} from '../src/runtime/factory.js';
import {VirtualFileSystem} from '../src/runtime/vfs.js';
import {readZip} from '../src/runtime/zip.js';
import {exportPackage,decodePackage} from '../src/backup.js';
const fixture=JSON.parse(readFileSync(new URL('../demos/managed/fixtures.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const binary=name=>new Uint8Array(Buffer.from(fixture.files[name],'base64'));
const entries=()=>Object.keys(fixture.files).filter(x=>/\.(exe|dll)$/.test(x)).map(path=>({path,data:binary(path)}));
const normalize=s=>s.replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trimEnd();
function start(exe='ManagedConsole.exe',options={}){const events=[];const p=createProcess({entries:entries(),exePath:'C:/app/'+exe,args:'"hello world" second',emit:(type,data)=>events.push({type,...data}),...options});return {p,events};}
function pump(p,ticks=30){for(let n=0;n<ticks&&p.status==='running';n++)p.tick(20000,30);}
function output(events){return events.filter(e=>e.type==='stdout').map(e=>e.text).join('');}
for(const [name,native]of [['ManagedConsole.exe','native-console.txt'],['ManagedAnyCPU.exe','native-anycpu.txt'],['ManagedVB.exe','native-vb.txt']])test('CIL: real Microsoft-compiled '+name+' matches Windows stdout',()=>{
 const {p,events}=start(name);pump(p);assert.equal(p.status,'exited');assert.equal(p.exitCode,0);assert.equal(normalize(output(events)),normalize(new TextDecoder().decode(binary(native))));
 assert.ok(p.cpu.instructions>100);assert.ok(events.some(e=>e.type==='loaded'&&e.runtime==='cil'));
 if(name!=='ManagedVB.exe'){assert.match(output(events),/CHECKS=28/);assert.equal(new TextDecoder().decode(p.vfs.readFile('results/managed.txt')),'Hello from compiled .NET!\nSaved in the virtual drive.');}
 else assert.equal(new TextDecoder().decode(p.vfs.readFile('vb-result.txt')),'VB.NET sum=55');
});
test('CIL: genuine WinForms callbacks, editing, GDI painting and normal close',()=>{
 const {p,events}=start('ManagedForms.exe');pump(p);assert.equal(p.status,'running');assert.match(p.waiting.reason,/WinForms/);assert.equal(p.apis.gui.windows.size,5);
 const window=title=>[...p.apis.gui.windows.values()].find(w=>w.title===title);
 const button=window('Click and save'),edit=window('Hello from WinForms');assert.equal(button.className,'BUTTON');assert.equal(edit.className,'EDIT');
 assert.ok(events.some(e=>e.type==='draw'&&e.op==='ellipse'&&e.width===70));
 p.inputEvent({kind:'edit',hwnd:edit.hwnd,text:'User text — 日本語'});p.inputEvent({kind:'click',hwnd:button.hwnd});pump(p);
 assert.equal(new TextDecoder().decode(p.vfs.readFile('winforms-result.txt')),'Clicks: 1 - User text — 日本語');
 assert.ok(events.some(e=>e.type==='draw'&&e.op==='rectangle'&&e.width===230));
 p.inputEvent({kind:'click',hwnd:button.hwnd});pump(p);assert.ok(window('Clicks: 2 - User text — 日本語'));
 p.inputEvent({kind:'click',hwnd:window('Close').hwnd});pump(p);assert.equal(p.status,'exited');assert.equal(p.exitCode,0);assert.equal(p.apis.gui.windows.size,0);
});
test('CIL: native window close exits the managed Application.Run loop',()=>{
 const {p}=start('ManagedForms.exe');pump(p);const w=[...p.apis.gui.windows.values()].find(w=>!w.parent);p.inputEvent({kind:'close',hwnd:w.hwnd});pump(p);assert.equal(p.status,'exited');assert.equal(p.frames.length,0);
});
test('CIL: existing native EDIT keyboard input reaches managed controls',()=>{
 const {p}=start('ManagedForms.exe');pump(p);const edit=[...p.apis.gui.windows.values()].find(w=>w.className==='EDIT');p.inputEvent({kind:'key',hwnd:edit.hwnd,down:true,code:65,ctrlKey:true});p.inputEvent({kind:'key',hwnd:edit.hwnd,down:true,code:88,char:'X',ctrlKey:false});pump(p);assert.equal(edit.title,'X');p.stop();
});
test('CIL: native handles retain their original lookup semantics',()=>{const {p}=start();const h=p.handle('test',{answer:42});assert.equal(p.object(h,'test').answer,42);assert.equal(p.object(h,'wrong'),null);p.stop();});
test('CIL: missing packaged dependency faults with assembly identity, not an app substitute',()=>{const {p}=start(undefined,{entries:entries().filter(e=>!e.path.endsWith('.dll'))});assert.throws(()=>pump(p),e=>e.code==='CLR_ASSEMBLY_NOT_FOUND'&&e.message.includes('ManagedLibrary'));});
test('CIL: instruction budget is enforced',()=>{const {p}=start(undefined,{instructionLimit:50});assert.throws(()=>pump(p),e=>e.code==='INSTRUCTION_LIMIT');});
test('CIL: cumulative allocation budget is enforced',()=>{const {p}=start();assert.throws(()=>p.account(p.managedLimit+1),e=>e.code==='CLR_ALLOCATION_LIMIT');p.stop();});
test('CIL: pause, step, debug and stop do not execute x86 instructions',()=>{const {p}=start();p.pause();const before=p.cpu.instructions;p.tick();assert.equal(p.cpu.instructions,before);p.stepOne();assert.equal(p.cpu.instructions,before+1);assert.equal(p.debug().runtime,'cil');assert.ok(p.debug().registers.METHOD);p.stop();assert.equal(p.status,'stopped');});
test('CIL: generated files survive virtual drive backup and restore',async()=>{
 const {p}=start();pump(p);const zipped=exportPackage({name:'Managed saved drive',selected:p.exePath,args:p.args,entries:p.vfs.snapshot()});const restored=decodePackage(await readZip(zipped.buffer));const vfs=new VirtualFileSystem(restored.entries);assert.equal(new TextDecoder().decode(vfs.readFile('C:/app/results/managed.txt')),'Hello from compiled .NET!\nSaved in the virtual drive.');assert.equal(restored.manifest.selected,p.exePath);
});
test('CIL: Framework API misses are explicit, not no-ops',()=>{const {p}=start();const method={owner:p.hostType('System.Threading.Thread'),name:'Start',host:true,assembly:p.assembly,signature:{hasThis:true,params:[],ret:{name:'System.Void'}}};assert.throws(()=>p.invoke(method,[p.newObject(method.owner)]),e=>e.code==='CLR_UNSUPPORTED_API'&&e.message.includes('Thread.Start'));p.stop();});
test('CIL: unimplemented opcode reports the exact instruction',()=>{const {p}=start();const f=p.frames.at(-1);assert.throws(()=>p.execute(f,{op:0xfe0f,offset:0,operand:null,next:1}),e=>e.code==='CLR_UNSUPPORTED_OPCODE'&&e.detail.opcode===0xfe0f);p.stop();});
test('CIL: managed reference arrays reject incompatible stores',()=>{const {p}=start();const array=p.array({name:'System.String'},1);p.arrayRef(array,0).set('hello');assert.throws(()=>p.arrayRef(array,0).set(p.newObject(p.hostType('System.Object'))),e=>e instanceof ManagedException&&e.object.__type.name==='System.ArrayTypeMismatchException');assert.equal(array.items[0],'hello');p.stop();});
test('CIL: empty console lines and Unicode are real input values',()=>{const {p}=start();const method={owner:p.hostType('System.Console'),name:'ReadLine',assembly:p.assembly,signature:{hasThis:false,params:[],ret:{name:'System.String'}}};const wait=invokeIntrinsic(p,method,[]);assert.equal(wait.wait(),undefined);p.inputEvent({kind:'console',text:''});assert.equal(wait.wait(),'');p.inputEvent({kind:'console',text:'日本語'});assert.equal(invokeIntrinsic(p,method,[]),'日本語');p.stop();});
test('CIL: imported Framework and AnyCPU images use the CIL classifier',()=>{for(const exe of ['ManagedConsole.exe','ManagedAnyCPU.exe','ManagedForms.exe']){const info=inspectExecutable(binary(exe),exe);assert.equal(info.runnable,true);assert.equal(info.runtime,'cil');assert.equal(info.managed,true);assert.equal(info.runtimeVersion,'v4.0.30319');}});
test('CIL: native executable classification and execution stay on the x86 path',async()=>{const zipped=readFileSync(new URL('../demos/browser86-demo.zip',import.meta.url));const files=await readZip(zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength));const exe=files.find(e=>e.path.endsWith('.exe'));assert.ok(exe);const info=inspectExecutable(exe.data,exe.path);assert.equal(info.managed,false);const p=createProcess({entries:files,exePath:'C:/app/'+exe.path});assert.ok(!(p instanceof ManagedProcess));p.stop();});
test('CIL: a DLL is not accepted as an application entrypoint',()=>{const asm=new ManagedAssembly(binary('ManagedLibrary.dll'),'ManagedLibrary.dll');assert.throws(()=>asm.validateRunnable());assert.doesNotThrow(()=>asm.validateRunnable({library:true}));});
test('CIL: native entrypoints and mixed-mode managed files fail before execution',()=>{for(const flags of [0,0x11]){const data=binary('ManagedConsole.exe'),asm=new ManagedAssembly(data);const offset=asm.image.rva(asm.image.directories[14].rva,72);new DataView(data.buffer).setUint32(offset+16,flags,true);assert.throws(()=>new ManagedAssembly(data).validateRunnable(),e=>e.code?.startsWith('CLR_'));}});
test('CIL: corrupt metadata signature is rejected',()=>{const data=binary('ManagedConsole.exe'),asm=new ManagedAssembly(data),root=asm.image.rva(asm.metadataRva||new DataView(data.buffer).getUint32(asm.image.rva(asm.image.directories[14].rva)+8,true));data[root]=0;assert.throws(()=>new ManagedAssembly(data),e=>e.code==='CLR_METADATA');});
test('CIL: truncated files do not reach guest execution',()=>{for(const n of [0,1,63,255,512,800])assert.throws(()=>new ManagedAssembly(binary('ManagedConsole.exe').subarray(0,n)));});
test('CIL: branch targets cannot land inside operands',()=>{const code=new Uint8Array([0x2b,1,0x20,0,0,0,0,0x2a]),body={code,view:new DataView(code.buffer),clauses:[]};assert.throws(()=>decodeIL(body),e=>e.code==='CLR_INVALID_IL');});
test('CIL: truncated CIL operands are rejected',()=>{const code=new Uint8Array([0x21,0,0]),body={code,view:new DataView(code.buffer),clauses:[]};assert.throws(()=>decodeIL(body),e=>e.code==='CLR_INVALID_IL');});
const mathProcess={throwException(name,message){throw Object.assign(new Error(message),{managedType:name});}};
for(const [name,fn,expected]of [
 ['int32 wraps',()=>arithmetic(mathProcess,0x58,2147483647,1),-2147483648],
 ['int32 multiply uses low 32 bits',()=>arithmetic(mathProcess,0x5a,0x7fffffff,0x7fffffff),1],
 ['int64 is exact above 2^53',()=>arithmetic(mathProcess,0x58,9007199254740993n,2n),9007199254740995n],
 ['int64 wraps',()=>arithmetic(mathProcess,0x58,9223372036854775807n,1n),-9223372036854775808n],
 ['unsigned division',()=>arithmetic(mathProcess,0x5c,-1,2),2147483647],
 ['unsigned shift',()=>arithmetic(mathProcess,0x64,-2147483648,31),1],
 ['int64 shift',()=>arithmetic(mathProcess,0x62,1n,63),-9223372036854775808n],
 ['signed integer division truncates toward zero',()=>arithmetic(mathProcess,0x5b,-7,2),-3],
 ['unsigned int64 division',()=>arithmetic(mathProcess,0x5c,-1n,2n),9223372036854775807n],
 ['int8 sign conversion',()=>convert(mathProcess,0x67,255),-1],
 ['uint8 zero extension',()=>convert(mathProcess,0xd2,-1),255],
 ['unsigned int32 to int64',()=>convert(mathProcess,0x6e,-1),4294967295n],
 ['float comparison does not reinterpret negative values as uint',()=>compare('gt.un',new Real(-1),new Real(0)),false],
 ['unordered float comparison',()=>compare('gt.un',new Real(NaN),new Real(0)),true],
 ['signed ordered NaN comparison is false',()=>compare('lt',new Real(NaN),new Real(0)),false],
])test('CIL arithmetic: '+name,()=>assert.equal(fn(),expected));
for(const [name,fn,type]of [
 ['divide by zero',()=>arithmetic(mathProcess,0x5b,1,0),'System.DivideByZeroException'],
 ['int64 divide by zero',()=>arithmetic(mathProcess,0x5b,1n,0n),'System.DivideByZeroException'],
 ['signed division overflow',()=>arithmetic(mathProcess,0x5b,-2147483648,-1),'System.OverflowException'],
 ['checked add overflow',()=>arithmetic(mathProcess,0xd6,2147483647,1),'System.OverflowException'],
 ['checked unsigned underflow',()=>arithmetic(mathProcess,0xdb,0,1),'System.OverflowException'],
 ['checked byte conversion',()=>convert(mathProcess,0xb4,256),'System.OverflowException'],
])test('CIL arithmetic: '+name,()=>assert.throws(fn,e=>e.managedType===type));
test('CIL arithmetic: real division preserves Infinity and NaN',()=>{assert.equal(arithmetic(mathProcess,0x5b,new Real(1),new Real(0)).value,Infinity);assert.ok(Number.isNaN(arithmetic(mathProcess,0x5b,new Real(0),new Real(0)).value));});
