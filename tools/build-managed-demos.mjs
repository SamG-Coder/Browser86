// Recreate the package from the recorded Microsoft .NET Framework compiler output.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {writeZip} from '../src/runtime/zip.js';
const root=new URL('../',import.meta.url);
const fixture=JSON.parse(await fs.readFile(new URL('demos/managed/fixtures.json',root),'utf8'));
const entries=Object.entries(fixture.files).map(([path,data])=>({path,data:new Uint8Array(Buffer.from(data,'base64'))}));
const destination=new URL('demos/browser86-managed-demo.zip',root);
await fs.writeFile(destination,writeZip(entries));
console.log('Built '+fileURLToPath(destination)+' from '+fixture.compiler);
