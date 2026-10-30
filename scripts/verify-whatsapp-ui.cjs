const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

// Runs the real component and hook with synthetic server actions and Ably.
// No .env, database, WAHA server or external credentials are read.
async function main() {
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'tmp/whatsapp-ui');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'entry.tsx'), `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { WhatsAppInstances } from '../../src/presentation/components/organization/whatsapp-instances';
    const root = createRoot(document.getElementById('root'));
    window.mount = () => root.render(<WhatsAppInstances />);
    window.hideSettings = () => root.render(null);
    window.mount();
  `);
  const imageA = await require('qrcode').toDataURL('SYNTHETIC-PAIRING-A');
  const imageB = await require('qrcode').toDataURL('SYNTHETIC-PAIRING-B');
  const actions = `
    const images = {a:${JSON.stringify(imageA)}, b:${JSON.stringify(imageB)}};
    const states = { a:{status:'PENDING',revision:0}, b:{status:'PENDING',revision:0} };
    window.fixture = { operations:[], qrCalls:[], snapshots:[], tokens:[], states, images };
    export async function getWhatsAppSettingsAction() {
      return { instances:['a','b'].map(id=>({ id, name:id==='a'?'Alpha':'Beta', locationId:'unit-'+id,
        location:{name:'Unit '+id}, ...states[id] })), recipients:[], locations:[], recipientLimit:5 };
    }
    export async function createWhatsAppInstanceAction(){ throw Error('unused'); }
    export async function saveWhatsAppRecipientsAction(){ throw Error('unused'); }
    export async function sendWhatsAppTestMessageAction(){ return { data: { sentCount: 1, totalCount: 1 } }; }
    function connection(id) { return { ...states[id], qr:states[id].status==='SCAN_QR_CODE'?images[id]:null,
      qrExpiresAt:states[id].status==='SCAN_QR_CODE'?Date.now()+18000:null }; }
    export async function manageWhatsAppInstanceAction(id, operation) {
      fixture.operations.push({id,operation});
      states[id] = { status:operation==='disconnect'?'STOPPED':'SCAN_QR_CODE', revision:states[id].revision+1 };
      return {data:connection(id)};
    }
    export async function getWhatsAppQrAction(id) {
      fixture.qrCalls.push(id);
      if(fixture.holdQr) return new Promise(resolve=>fixture.resolveQr=resolve);
      return {data:connection(id)};
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      const match = String(url).match(/^\\/api\\/whatsapp\\/instances\\/([ab])(\\/token)?$/);
      if (!match) return originalFetch(url,options);
      const id = match[1];
      if(match[2]) {
        fixture.tokens.push(id);
        return Response.json({data:{channel:'whatsapp:fixture:unit-'+id+':'+id,tokenRequest:{ttl:120000}}});
      }
      fixture.snapshots.push(id);
      if(fixture.denySnapshot) return Response.json({error:'Unauthorized'},{status:403});
      const body = {data:{id,...states[id]}};
      if(fixture.holdSnapshot) return new Promise((resolve,reject)=>{
        fixture.resolveSnapshot = () => resolve(Response.json(body));
        options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
      });
      return Response.json(body);
    };
  `;
  const ably = `export class Realtime {
    constructor() {
      this.connection={on(){}};
      this.channels={get:()=>({on:(_,cb)=>{fixture.attached=cb},
        subscribe:async(_,cb)=>{fixture.emitStatus=data=>cb({data})},attach:async()=>{}})};
    }
    connect(){} close(){fixture.closed=(fixture.closed||0)+1}
  }`;
  await build({
    entryPoints:[path.join(dir,'entry.tsx')], bundle:true, outfile:path.join(dir,'bundle.js'),
    jsx:'automatic', define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'synthetic-transports', setup(builder) {
      builder.onResolve({filter:/whatsapp-actions/},()=>({path:'actions',namespace:'mock'}));
      builder.onResolve({filter:/^ably$/},()=>({path:'ably',namespace:'mock'}));
      builder.onLoad({filter:/.*/,namespace:'mock'},arg=>({contents:arg.path==='ably'?ably:actions,loader:'js'}));
    }}],
  });
  const components = [
    'src/presentation/components/organization/whatsapp-instances.tsx',
    'src/presentation/components/organization/whatsapp-connection-dialog.tsx',
    ...['badge','alert','spinner','input','phone-input','dialog','button','toast'].map(name=>'src/components/ui/'+name+'.tsx'),
  ];
  const source = components.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  const { compile } = require('@tailwindcss/node');
  const compiler = await compile('@import "tailwindcss";', {base:root,onDependency(){}});
  const classes = [...source.matchAll(/(?:"|`)([^"`\n]+)(?:"|`)/g)].flatMap(match=>match[1].split(/\s+/));
  const css = compiler.build(classes);
  const html = `<html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--surface:white;--canvas:#f7f8f7;--text-secondary:#68756d;--border-subtle:#e7ece8;--color-background:white;--color-foreground:#1c2420;--color-popover:white;--color-popover-foreground:#1c2420}body{font-family:Arial,sans-serif;margin:0;padding:20px}#root{max-width:880px;margin:auto}</style><div id="root"></div><script src="/bundle.js"></script></html>`;
  const server = http.createServer((request,response)=>{
    response.setHeader('Content-Type', request.url==='/bundle.js'?'application/javascript':'text/html');
    response.end(request.url==='/bundle.js'?fs.readFileSync(path.join(dir,'bundle.js')):html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({channel:'chrome',headless:true});
    for (const width of [1200,390]) {
      const page = await browser.newPage({viewport:{width,height:1000}});
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.install();
      await page.goto('http://127.0.0.1:'+server.address().port);
      const dialog = page.getByRole('dialog');
      const qr = page.getByAltText('QR code para conectar o WhatsApp desta unidade');
      const settle = () => page.waitForFunction(()=>{
        const button=document.querySelector('[aria-label="Atualizar status e QR code"]');
        return button && !button.disabled;
      });
      const open = async name => {
        await page.getByRole('button',{name:new RegExp(name)}).click();
        await settle();
        await page.clock.runFor(20);
        await settle();
      };
      const close = async () => {
        await dialog.getByRole('button',{name:'Fechar',exact:true}).first().click();
        await dialog.waitFor({state:'detached'});
      };

      await open('Alpha');
      assert.equal(await qr.getAttribute('src'), imageA);
      assert.equal(await page.evaluate(()=>fixture.operations.length),1);
      // Existing early refresh was at 17 s. Use the full 18 s deadline now.
      await page.clock.runFor(17000);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),0);
      const expiryStart = await page.evaluate(()=>Date.now());
      await close(); await open('Alpha');
      assert.equal(await qr.getAttribute('src'),imageA);
      assert.equal(await page.evaluate(()=>fixture.operations.length),1);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),0);
      assert.equal(await page.evaluate(()=>fixture.snapshots.length),1);
      await page.clock.runFor(Math.max(0, expiryStart+1000-await page.evaluate(()=>Date.now()))+10);
      await page.waitForFunction(()=>fixture.qrCalls.length===1);
      await settle();

      // Closed modals never renew; expiry is not reset on reopening.
      await close(); await page.clock.runFor(22000);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),1);
      await open('Alpha');
      await page.waitForFunction(()=>fixture.qrCalls.length===2);
      await settle();
      // Images are isolated by instance, including when switching back.
      await close(); await open('Beta');
      assert.equal(await qr.getAttribute('src'),imageB);
      await close(); await open('Alpha');
      assert.equal(await qr.getAttribute('src'),imageA);
      assert.equal(await page.evaluate(()=>fixture.operations.length),2);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),2);

      // Duplicate hints and healthy channel attachments do no extra work.
      const counts = await page.evaluate(()=>({qr:fixture.qrCalls.length,snapshots:fixture.snapshots.length}));
      await page.evaluate(()=>{
        fixture.emitStatus({instanceId:'a',...fixture.states.a});
        fixture.attached({resumed:true});
      });
      assert.equal(await qr.getAttribute('src'),imageA);
      assert.deepEqual(await page.evaluate(()=>({qr:fixture.qrCalls.length,snapshots:fixture.snapshots.length})),counts);
      await page.evaluate(()=>fixture.attached({resumed:false}));
      await page.waitForFunction(count=>fixture.snapshots.length===count+1,counts.snapshots);
      await settle();
      assert.equal(await page.evaluate(()=>fixture.operations.length),2);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),2);

      // An authorized snapshot recovers WORKING missed while the modal was closed.
      await close();
      await page.evaluate(()=>fixture.states.a={status:'WORKING',revision:100});
      await open('Alpha');
      await dialog.getByText('Conexão ativa',{exact:true}).waitFor();
      assert.equal(await qr.count(),0);
      await page.clock.runFor(25000);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),2);
      await close(); await open('Beta');

      // One QR flight is reused when closing and opening while it is pending.
      const beforeFlight = await page.evaluate(()=>fixture.qrCalls.length);
      await page.evaluate(()=>fixture.holdQr=true);
      await page.clock.runFor(18010);
      await page.waitForFunction(count=>fixture.qrCalls.length===count+1 && fixture.resolveQr,beforeFlight);
      await close();
      await page.getByRole('button',{name:/Beta/}).click();
      await page.clock.runFor(10);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),beforeFlight+1);
      await page.evaluate(()=>fixture.resolveQr({data:{...fixture.states.b,qr:fixture.images.b,qrExpiresAt:Date.now()+18000}}));
      await settle(); await qr.waitFor();
      // Preserve the previous race fix: WORKING wins over a delayed QR failure.
      await page.clock.runFor(18010);
      await page.waitForFunction(count=>fixture.qrCalls.length===count+2,beforeFlight);
      await page.evaluate(()=>{
        fixture.states.b={status:'WORKING',revision:101};
        fixture.emitStatus({instanceId:'b',...fixture.states.b});
        fixture.resolveQr({error:'Synthetic provider unavailable',code:'PROVIDER_UNAVAILABLE'});
      });
      await settle();
      assert.equal(await dialog.getByRole('alert').count(),0);
      assert.equal(await qr.count(),0);
      await close();

      // A refused authorization discards cached images and stops renewals.
      await page.evaluate(()=>{fixture.holdQr=false; fixture.states.b={status:'SCAN_QR_CODE',revision:102}});
      await open('Beta'); await qr.waitFor(); await close();
      const beforeDenied = await page.evaluate(()=>fixture.qrCalls.length);
      await page.evaluate(()=>fixture.denySnapshot=true);
      await open('Beta');
      await dialog.getByRole('alert').waitFor();
      assert.equal(await qr.count(),0);
      await page.clock.runFor(25000);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),beforeDenied);
      await close();

      // Component teardown discards images; remount cannot reuse another context.
      await page.evaluate(()=>{fixture.denySnapshot=false;window.hideSettings()});
      await page.getByText('Instâncias',{exact:true}).waitFor({state:'detached'});
      await page.evaluate(()=>window.mount());
      const beforeRemount = await page.evaluate(()=>fixture.operations.length);
      await open('Beta'); await qr.waitFor();
      assert.equal(await page.evaluate(()=>fixture.operations.length),beforeRemount+1);
      await page.evaluate(()=>{
        Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const beforeHidden = await page.evaluate(()=>fixture.qrCalls.length);
      await page.clock.runFor(25000);
      assert.equal(await page.evaluate(()=>fixture.qrCalls.length),beforeHidden);
      assert.deepEqual(errors,[]);
      await page.close();
      console.log('PASS '+width+': QR reuse across modal reopen, original expiry, no early renewal, closed/hidden idle, per-instance isolation, single QR flight, local recovery, revision race, authorization and teardown');
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
