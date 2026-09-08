import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('Static server delivers modules/ZIP without an execution or upload endpoint', async () => {
  const child = spawn(process.execPath, ['tools/serve.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000);
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timeout); resolve(match[0]); }
      });
      child.on('exit', code => { clearTimeout(timeout); if (code) reject(new Error('Server exited '+code)); });
    });
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Browser86/);
    const module = await fetch(url + '/src/runtime/cpu.js');
    assert.match(module.headers.get('content-type'), /javascript/);
    assert.equal(module.headers.get('x-content-type-options'), 'nosniff');
    const demo = await fetch(url + '/demos/browser86-demo.zip');
    const bytes = new Uint8Array(await demo.arrayBuffer());
    assert.equal(bytes[0], 0x50);
    assert.equal((await fetch(url + '/upload', {method:'POST',body:'no'})).status, 405);
    assert.equal((await fetch(url + '/not-a-real-file')).status, 404);
    assert.equal((await fetch(url + '/%2e%2e%2f%2e%2e%2fetc/passwd')).status, 403);
  } finally {
    child.kill();
  }
});
