#!/usr/bin/env node
// Static files only. Guest executables are NEVER executed by this server.
import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer from 0 to 65535.');
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end('Static server: GET/HEAD only.');
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad URL');
      return;
    }
    const relative = decoded.replace(/^\/+/, '');
    let filename = path.resolve(root, relative || 'index.html');
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const actual = await realpath(filename);
    if (!actual.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const body = await readFile(actual);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Static server error.');
  }
});
server.on('error', error => {
  console.error('Cannot start Browser86:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error('Choose a free PORT, for example: set PORT=8081 (Windows cmd), then retry.');
    console.error('Browser storage is origin-specific. Use the same host and port to restore it.');
  }
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const address = server.address();
  const url = `http://${host}:${address.port}`;
  console.log(`\nBrowser86 is available at ${url}\n`);
  console.log('Open this address in your browser. Press Ctrl+C to stop the static server.');
  console.log('No guest program is run by Node.js or the host operating system.\n');
  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32' ? 'explorer.exe'
      : process.platform === 'darwin' ? 'open' : 'xdg-open';
    // Opens the trusted launch URL, never a guest file or command string.
    const opener = spawn(command, [url], { detached: true, stdio: 'ignore' });
    opener.on('error', () => console.log('Automatic browser launch unavailable. Open the URL above.'));
    opener.unref();
  }
});
