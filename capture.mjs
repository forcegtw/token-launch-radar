#!/usr/bin/env node
// Capture the entry's three screenshots: board, detail view, filtered view.
// Serves the built output/ over loopback so ../data.js loads with the right MIME, drives the
// playwright-cached headless Chromium with --screenshot, then re-encodes to ~320 KB JPEG via sharp
// if present, else falls back to Chrome's own JPEG output scaled by --force-device-scale-factor.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, statSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(join(here, 'out'));
const pageRoot = resolve(join(here, 'out', 'dashboard'));
const shotsDir = join(here, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const chrome = process.env.CHROME
  ?? join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell');
if (!statSync(chrome, { throwIfNoEntry: false })) {
  console.error('no chrome at', chrome);
  process.exit(1);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const f = resolve(join(root, normalize(p)));
  if (!f.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  // The page lives at /index.html (out/dashboard/index.html) so ../data.js resolves to /data.js.
  const real = f === join(root, 'index.html') ? join(pageRoot, 'index.html')
    : f === join(root, 'app.css') ? join(pageRoot, 'app.css')
    : f === join(root, 'app.js') ? join(pageRoot, 'app.js')
    : f;
  try {
    const size = statSync(real).size;
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'content-length': size });
    createReadStream(real).pipe(res);
  } catch { res.writeHead(404).end(); }
});

function capture(url, out) {
  return new Promise((resP, rejP) => {
    const args = ['--headless', '--no-sandbox', '--disable-gpu', '--window-size=1440,810', '--force-device-scale-factor=1', '--hide-scrollbars', '--virtual-time-budget=6000', `--screenshot=${out}`, url];
    const c = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', rejP);
    c.on('exit', (code) => (code === 0 ? resP() : rejP(new Error(`chrome exited ${code}: ${err.slice(-300)}`))));
  });
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;
const jobs = [
  ['1-board.jpg', `${base}?shot=board`],
  ['2-detail.jpg', `${base}?shot=detail`],
  ['3-filtered.jpg', `${base}?shot=filtered`],
];
for (const [name, url] of jobs) {
  await capture(url, join(shotsDir, name));
  console.log('captured', name);
}
server.close();
process.exit(0);
