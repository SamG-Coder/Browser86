#!/usr/bin/env node
// Repackage the verified compiler outputs. Does NOT compile or execute a guest EXE.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {exportPackage} from '../src/backup.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=JSON.parse((await readFile(path.join(root,'demos/managed/fixtures.json'),'utf8')).replace(/^\uFEFF/,''));
const entries=Object.entries(fixture.files).filter(([name])=>/\.(exe|dll)$/.test(name)).map(([name,data])=>({path:'C:/app/'+name,data:new Uint8Array(Buffer.from(data,'base64'))}));
entries.push({path:'C:/app/README.txt',data:new TextEncoder().encode('Browser86 managed compatibility demonstration\r\n\r\nManagedForms.exe: click, edit, save and draw using compiled WinForms.\r\nManagedConsole.exe / ManagedAnyCPU.exe: 28 checks. Arguments: "hello world" second\r\nManagedVB.exe: compiled VB.NET loop and file output.\r\n\r\nAll generated files stay in this virtual drive. This is a partial compatibility runtime, not the full .NET Framework.\r\n')});
await mkdir(path.join(root,'demos'),{recursive:true});
await writeFile(path.join(root,'demos/browser86-managed.zip'),exportPackage({name:'Browser86 .NET demos',selected:'C:/app/ManagedForms.exe',args:'"hello world" second',entries}));
console.log('Built demos/browser86-managed.zip from '+fixture.compiler);
