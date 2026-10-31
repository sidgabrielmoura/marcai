// Real sources, synthetic transports. Does not load .env or production credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { if (name in dependencies) return dependencies[name]; if (name.startsWith('node:')) return require(name); throw Error(name); },
    console, URLSearchParams, AbortController, setTimeout, clearTimeout, ...extra });
  return exports;
}
async function check(name, run) { await run(); console.log('PASS: ' + name); }
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

async function hookFixture({ denied = false, follower = false, denyAfterAttach = false } = {}) {
  const effects = [], clients = [], redirects = [], hints = [], timers = new Map(), listeners = new Map();
  let calls = 0, refreshes = 0, sequence = 0, receive, status = denied ? 401 : 200;
  class Realtime {
    constructor(options) {
      this.options = options; this.auth = { clientId: 'user-a' }; this.events = new Map(); this.bindings = new Map();
      this.connection = { on: (name, cb) => this.events.set(name, cb) };
      this.channels = { get: name => {
        if (!this.bindings.has(name)) this.bindings.set(name, { on() {}, subscribe: async cb => { this.bindings.get(name).callback = cb; if (denyAfterAttach && name.includes(':session:')) status = 401; } });
        return this.bindings.get(name);
      } }; clients.push(this);
    }
    connect() { this.options.authCallback({}, () => this.events.get('connected')?.()); }
    close() { this.closed = true; }
  }
  const document = { hidden: false, addEventListener: (name, cb) => listeners.set(name, cb), removeEventListener: name => listeners.delete(name) };
  const transport = { publish: hint => hints.push(hint), close() { this.closed = true; } };
  const hook = load('src/presentation/hooks/use-realtime-events.ts', {
    react: { useEffect: cb => effects.push(cb), useRef: current => ({ current }), useTransition: () => [false, cb => cb()] },
    'next/navigation': { useRouter: () => ({ refresh: () => refreshes++ }) },
    ably: { Realtime },
    '@/presentation/realtime/resource-events': { subscribeAppliedChanges: () => () => {}, acceptResourceChange: () => true, setResourceContext() {}, dispatchResourceChange: () => false, routeNeedsChange: () => true },
    '@/presentation/realtime/tab-transport': { shareTabTransport: (_key, start, cb) => { receive = cb; if (!follower) start(); return transport; } },
  }, {
    document, window: { location: { pathname: '/tasks', replace: url => redirects.push(url) }, addEventListener() {}, removeEventListener() {} },
    fetch: async () => { calls++; return { ok: status === 200, status, json: async () => ({ protocol: 2, contextKey: 'session-context', scopeVersion: 'scope', tokenRequest: { clientId: 'user-a', capability: JSON.stringify({ 'user:user-a:notifications': ['subscribe'], 'org:org-a:notifications': ['subscribe'], 'user:user-a:session:session-a': ['subscribe'] }) } }) }; },
    setTimeout: cb => { const id = ++sequence; timers.set(id, cb); return id; }, clearTimeout: id => timers.delete(id),
  });
  hook.useRealtimeEvents(); const cleanup = effects[0](); await settle();
  return { clients, redirects, hints, timers, document, listeners, transport, cleanup, receive: hint => receive(hint), deny: () => { status = 401; }, calls: () => calls, refreshes: () => refreshes };
}

async function main() {
  await check('revocation publishes only after commit; rollback never schedules transport', async () => {
    const afters = [], messages = []; let committed = false, created = 0;
    const tx = { $queryRaw: async (parts) => parts.join('').includes('UPDATE web_auth_sessions') ? [{ id: 'old-session', user_id: 'user-a' }] : [],
      userDeviceToken: { deleteMany: async () => {} }, notification: { create: async () => created++ } };
    const service = load('src/infrastructure/security/device-sessions.ts', {
      'next/server': { after: cb => afters.push(cb) },
      '@/infrastructure/notifications/transaction': { notificationTransaction: async work => { committed = false; const result = await work(tx); committed = true; return result; } },
      '@/infrastructure/realtime/ably': { publishToChannel: async (...args) => { assert.equal(committed, true); messages.push(args); } },
    });
    await service.deviceLoginTransaction(async db => { await service.lockDeviceLogin(db, 'user-a'); await service.replaceDeviceSessions(db, { id: 'user-a', platformRole: null }, 'org-a'); });
    assert.equal(messages.length, 0); assert.equal(afters.length, 1); assert.equal(created, 1);
    await afters.shift()(); assert.equal(messages[0][0], 'user:user-a:session:old-session'); assert.equal(messages[0][1], 'session:revoked');
    assert.equal(JSON.stringify(messages).includes('password'), false);
    await assert.rejects(service.deviceLoginTransaction(async db => { await service.replaceDeviceSessions(db, { id: 'user-a', platformRole: null }, 'org-a'); throw Error('rollback'); }));
    assert.equal(afters.length, 0); assert.equal(messages.length, 1);
  });
  await check('Ably token grants subscribe only to its own session; tab groups isolate sessions', async () => {
    const issued = [];
    const sync = load('src/infrastructure/realtime/sync.ts', { './ably': { getAblyRest: () => ({ auth: { createTokenRequest: async value => { issued.push(value); return value; } } }) } });
    const context = { userId: 'user-a', memberId: 'member-a', organizationId: 'org-a', role: 'EMPLOYEE' };
    const a = await sync.realtimeAuthorization(context, '2', 'session-a'), b = await sync.realtimeAuthorization(context, '2', 'session-b');
    assert.notEqual(a.contextKey, b.contextKey);
    const capability = JSON.parse(a.tokenRequest.capability);
    assert.deepEqual(capability['user:user-a:session:session-a'], ['subscribe']);
    assert.equal(capability['user:user-a:session:session-b'], undefined);
    assert.ok(Object.values(capability).every(operations => operations.join() === 'subscribe'));
    assert.equal(a.tokenRequest.ttl, 600000);
    assert.equal((await sync.realtimeAuthorization(context, null)).protocol, undefined);
    const platform = await sync.realtimeAuthorization({ ...context, organizationId: '', memberId: '', role: 'SUPERADMIN' }, '2', 'platform-session');
    assert.deepEqual(Object.keys(JSON.parse(platform.tokenRequest.capability)), ['user:user-a:session:platform-session']);
  });
  await check('shared tab transport forwards the security control and strips private fields', async () => {
    const channels = [], received = [], messages = []; let started = 0;
    class BroadcastChannel {
      constructor(name) { this.name = name; channels.push(this); }
      postMessage(value) { messages.push(value); for (const c of channels) if (c !== this && c.name === this.name && !c.closed) c.onmessage?.({ data: value }); }
      close() { this.closed = true; }
    }
    let locked = false;
    const tabs = load('src/presentation/realtime/tab-transport.ts', { './resource-events': { CHANGE_KINDS: ['ALL', 'TASK_CHANGED', 'EXECUTION_CHANGED', 'NOTIFICATIONS_CHANGED'] } }, {
      BroadcastChannel, navigator: { locks: { request: (_name, _options, callback) => { if (!locked) { locked = true; return callback(); } return new Promise(() => {}); } } },
    });
    const leader = tabs.shareTabTransport('session-a', () => { started++; return () => {}; }, hint => received.push(hint));
    const follower = tabs.shareTabTransport('session-a', () => { started++; return () => {}; }, hint => received.push(hint));
    leader.publish({ kinds: ['ALL'], sessionRevoked: true, token: 'private', sessionId: 'private', title: 'private' });
    assert.equal(started, 1); assert.equal(received[0].sessionRevoked, true);
    assert.deepEqual(Object.keys(messages[0]).sort(), ['changeId', 'kinds', 'sessionRevoked']);
    assert.equal(JSON.stringify(messages).includes('private'), false);
    leader.close(); follower.close();
  });
  await check('live security event closes old transport, notifies sibling tabs and navigates without board refresh', async () => {
    const f = await hookFixture(); const client = f.clients[0];
    assert.equal(f.calls(), 2); // initial authorization + one attach race check
    assert.equal(f.timers.size, 0);
    client.bindings.get('user:user-a:session:session-a').callback({ name: 'session:revoked', data: { reason: 'CONCURRENT_DEVICE_LOGIN' } });
    assert.equal(f.redirects[0], '/login?reason=session-replaced'); assert.equal(client.closed, true); assert.equal(f.transport.closed, true);
    assert.equal(f.hints[0].sessionRevoked, true); assert.equal(f.refreshes(), 0); assert.equal(f.timers.size, 0);
    f.cleanup();
  });
  await check('follower tab receives the security control without another Ably connection', async () => {
    const f = await hookFixture({ follower: true }); assert.equal(f.clients.length, 0);
    f.receive({ kinds: ['ALL'], sessionRevoked: true }); assert.equal(f.redirects[0], '/login?reason=session-replaced'); f.cleanup();
  });
  await check('revoked token on startup or between issuance and attach cannot leave a logged-in screen', async () => {
    for (const options of [{ denied: true }, { denyAfterAttach: true }]) {
      const f = await hookFixture(options);
      assert.equal(f.redirects[0], '/login?reason=session-ended'); assert.equal(f.timers.size, 0);
      if (f.clients.length) assert.equal(f.clients[0].closed, true); f.cleanup();
    }
  });
  await check('resume and network reconnection reauthorize once without periodic checks', async () => {
    const f = await hookFixture(); const calls = f.calls();
    await settle(); assert.equal(f.calls(), calls);
    f.clients[0].events.get('connected')(); await settle(); assert.equal(f.calls(), calls + 1);
    f.document.hidden = true; f.listeners.get('visibilitychange')(); f.deny();
    f.document.hidden = false; f.listeners.get('visibilitychange')(); await settle();
    assert.equal(f.redirects[0], '/login?reason=session-ended'); f.cleanup();
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
