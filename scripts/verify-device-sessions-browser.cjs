// Actual hook, tab transport and login notice in Chromium, with synthetic Ably/auth.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..'), dir = path.join(root, 'tmp/session-browser'); fs.mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  fs.writeFileSync(entry, `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {useRealtimeEvents} from '../../src/presentation/hooks/use-realtime-events';
    import {SessionEndedNotice} from '../../src/presentation/components/shared/session-ended-notice';
    function Active(){useRealtimeEvents();return <h1>Conta conectada</h1>}
    createRoot(document.getElementById('root')).render(location.pathname==='/login'?<main><h1>Acesse sua conta</h1><SessionEndedNotice/></main>:<Active/>);`);
  const ably = `window.transports=[];export class Realtime {
    constructor(options){this.options=options;this.auth={clientId:'user-a'};this.events={};this.bindings={};window.transports.push(this);
      this.connection={on:(n,cb)=>this.events[n]=cb};this.channels={get:n=>this.bindings[n]??=( {on(){},subscribe:async cb=>{this.bindings[n].callback=cb}} )};}
    connect(){this.options.authCallback({},()=>queueMicrotask(()=>this.events.connected?.()));}close(){this.closed=true;}
  }
  window.emitRevocation=()=>{for(const c of window.transports)for(const [n,b]of Object.entries(c.bindings))if(n.includes(':session:'))b.callback?.({name:'session:revoked',data:{reason:'CONCURRENT_DEVICE_LOGIN'}})};`;
  await build({ entryPoints: [entry], outfile: path.join(dir, 'bundle.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    alias: { '@': path.join(root, 'src') }, plugins: [{ name: 'synthetic-transports', setup(b) {
      b.onResolve({ filter: /^(ably|next\/navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'ably' ? ably : `const router={refresh(){window.refreshes=(window.refreshes||0)+1}};export const useRouter=()=>router;` }));
    } }] });
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process('@import "tailwindcss";', { from: path.join(root, 'src/app/globals.css') });
  let current = 'session-a'; const requests = [];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/ably/token')) {
      requests.push(req.headers.cookie);
      if (!req.headers.cookie?.includes('sid=' + current)) { res.writeHead(401); res.end('{}'); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ protocol: 2, contextKey: current, scopeVersion: 'scope', tokenRequest: { clientId: 'user-a', capability: JSON.stringify({ ['user:user-a:session:' + current]: ['subscribe'] }) } })); return;
    }
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(`<html><style>${css.css}body{font-family:Arial;background:#f5f6f5;padding:24px}main{max-width:440px;margin:40px auto;background:white;padding:24px;border-radius:16px}h1{font-size:26px;margin-bottom:24px}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const a = await browser.newContext(), b = await browser.newContext();
    // Model two simultaneously visible windows sharing a browser session.
    await a.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => false }));
    await b.addInitScript(() => Object.defineProperty(document, 'hidden', { get: () => false }));
    await a.addCookies([{ name: 'sid', value: 'session-a', url: base }]);
    const first = await a.newPage(), sibling = await a.newPage();
    await first.goto(base + '/tasks'); await sibling.goto(base + '/tasks');
    await first.waitForFunction(() => window.emitRevocation); await sibling.waitForFunction(() => window.emitRevocation);
    await first.waitForFunction(() => window.transports.some(c => Object.keys(c.bindings).length));
    assert.equal((await first.evaluate(() => window.transports.length)) + (await sibling.evaluate(() => window.transports.length)), 1);
    current = 'session-b'; await b.addCookies([{ name: 'sid', value: current, url: base }]);
    const latest = await b.newPage(); await latest.goto(base + '/tasks');
    await latest.waitForFunction(() => window.transports.some(c => Object.keys(c.bindings).length));
    await first.evaluate(() => window.emitRevocation());
    await first.waitForURL('**/login?reason=session-replaced'); await sibling.waitForURL('**/login?reason=session-replaced');
    assert.ok(latest.url().endsWith('/tasks'));
    await first.getByRole('alert').filter({ hasText: 'Outro dispositivo conectou-se' }).waitFor();
    for (const width of [1440, 1024, 768, 390]) {
      await first.setViewportSize({ width, height: 900 });
      assert.ok(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await first.screenshot({ path: path.join(dir, `notice-${width}.png`), fullPage: true });
    }
    const before = requests.length; await latest.waitForTimeout(500); assert.equal(requests.length, before);
    console.log('PASS: two isolated browsers, sibling tab logout, latest session preserved, visible notice at 1440/1024/768/390px and no polling');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
