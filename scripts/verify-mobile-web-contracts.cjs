// Authorization and cost boundaries against the real modules; no environment or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; if (name.startsWith('node:')) return require(name); throw Error('Unstubbed ' + name); }, URL, Response, Request, Date, Buffer, Uint8Array, console, process: { env: {} } });
  return module.exports;
}
async function main() {
  const c = { userId: 'user-a', organizationId: 'org-a' };
  const session = { sessionId: 'session-a', userId: c.userId };
  let current = c, token = true, recent = false, reads = 0;
  const sent = [];
  const actions = load('src/presentation/actions/push-notification-actions.ts', {
    zod: require('zod'), '@/infrastructure/security/session': { getSession: async () => session },
    '@/application/security/auth-context': { getAuthenticatedContext: async () => current },
    '@/infrastructure/database/prisma': { prisma: {
      userDeviceToken: { findFirst: async ({ where }) => { reads++; assert.equal(where.userId, c.userId); assert.equal(where.sessionId, session.sessionId); return token ? { id: 'token-a' } : null; } },
      notification: { findFirst: async ({ where }) => { reads++; assert.equal(where.organizationId, c.organizationId); assert.equal(where.userId, c.userId); assert.equal(where.type, 'PUSH_TEST'); return recent ? { id: 'recent' } : null; } },
    } },
    '@/infrastructure/notifications/notification-service': { sendNotification: async args => sent.push(args) },
  });
  assert.ok((await actions.sendCurrentSessionPushTestAction('other-session')).error); assert.equal(reads, 0);
  current = null; assert.ok((await actions.sendCurrentSessionPushTestAction(session.sessionId)).error); assert.equal(reads, 0); current = c;
  token = false; assert.ok((await actions.sendCurrentSessionPushTestAction(session.sessionId)).error); assert.equal(sent.length, 0); token = true;
  recent = true; assert.ok((await actions.sendCurrentSessionPushTestAction(session.sessionId)).error); assert.equal(sent.length, 0); recent = false;
  assert.ok((await actions.sendCurrentSessionPushTestAction(session.sessionId)).success);
  assert.equal(sent[0].userId, c.userId); assert.equal(sent[0].organizationId, c.organizationId); assert.equal(sent[0].data.testWebSessionId, session.sessionId);
  assert.deepEqual(Array.from(sent[0].channels), ['INTERNAL', 'PUSH']);
  console.log('PASS: teste push restrito à sessão/usuário/organização, registro obrigatório e intervalo de um minuto');

  let nativeReads = 0, webReads = 0, pushed = [];
  const notice = { id: 'notice-a', userId: c.userId, organizationId: c.organizationId, title: 'Teste', message: 'Mensagem', type: 'PUSH_TEST', priority: 'MEDIUM', data: { testWebSessionId: session.sessionId }, deliveries: [{ id: 'delivery-a', channel: 'PUSH' }] };
  const service = load('src/infrastructure/notifications/notification-service.ts', {
    '@prisma/client': { Prisma: { join: values => values } }, '@/domain/types': { Priority: { MEDIUM: 'MEDIUM' } },
    '@/infrastructure/database/prisma': { prisma: {
      $queryRaw: async (parts, ...values) => { const sql = parts.join('?'); if (sql.includes('UPDATE mobile_push_outbox')) return [{ id: notice.id }]; if (sql.includes('FROM user_device_tokens')) { webReads++; assert.ok(values.includes(session.sessionId)); return [{ token: 'synthetic', sessionId: session.sessionId }]; } if (sql.includes('FROM mobile_installations')) nativeReads++; throw Error('Unexpected query'); },
      $executeRaw: async () => 1, notification: { findMany: async () => [notice] },
      notificationDelivery: { update: async () => {}, create: async () => {} },
    } },
    '@/infrastructure/firebase/firebase-admin': { sendWebPushNotification: async payload => { pushed.push(payload); return { successCount: 1, failureCount: 0, invalidTokens: [], errors: [] }; } },
    '@/infrastructure/realtime/ably': { publishRealtimeNotification: async () => {} }, '@/infrastructure/email': {},
    './recipient': { eligibleRecipient: async () => true }, '@/application/mobile/security': {}, './transaction': {},
    '@/application/whatsapp/alerts': { registerOperationalAlert: async () => {} },
  });
  await service.dispatchPersistedNotifications([notice.id]);
  assert.equal(webReads, 1); assert.equal(nativeReads, 0); assert.equal(pushed.length, 1); assert.equal(pushed[0].platform, 'web'); assert.equal(pushed[0].data.sessionId, session.sessionId);
  console.log('PASS: entrega de teste usa somente o navegador alvo e não consulta instalações nativas');

  const task = { id: 'task-a', roundId: 'new-round', dependencies: [], occurrences: [], requirements: [{ id: 'req-a', stage: 'ON_COMPLETE', submissions: [{ id: 'old', hasFile: true, roundId: 'previous', validationStatus: 'VALID' }, { id: 'current', hasFile: true, roundId: 'new-round', validationStatus: 'REJECTED' }] }] };
  let detailReads = 0;
  const adapter = load('src/application/mobile/web-task-contract.ts', { '@/infrastructure/security/session': { getSession: async () => session }, './data': { taskDetail: async () => { detailReads++; return task; } } });
  const result = await adapter.webTaskDetail(c, task.id);
  assert.equal(detailReads, 1); assert.equal(result.evidenceRequirements[0].submissions.length, 1); assert.equal(result.evidenceRequirements[0].submissions[0].id, 'current');
  assert.equal(result.evidenceRequirements[0].previousSubmissions[0].id, 'old'); assert.ok(result.draftScope.includes(session.sessionId));
  console.log('PASS: rodada anterior fica visível sem completar exigência atual nem adicionar consultas');

  let answer = { storageKey: 'opaque-upload-id', fileUrl: 'https://res.cloudinary.com/synthetic/image/upload/photo.png', fileName: 'foto.png', mimeType: 'image/png' };
  let authorized = true, storageReads = 0, taskReads = 0;
  const route = load('src/app/api/tasks/[id]/form-file/[key]/route.ts', {
    '@/application/security/auth-context': { getAuthenticatedContext: async () => authorized ? c : null },
    '@/application/security/operational-scope': {}, '@/application/mobile/data': { taskDetailScope: context => ({ organizationId: context.organizationId, scoped: true }) },
    '@/infrastructure/database/prisma': { prisma: { task: { findFirst: async ({ where }) => { taskReads++; assert.equal(where.organizationId, c.organizationId); assert.equal(where.scoped, true); return { formAnswers: { photo: answer } }; } } } },
    '@/infrastructure/storage/evidence-storage': { readEvidence: async () => { storageReads++; return new Uint8Array([1, 2]); } },
    '@/infrastructure/cloudinary/cloudinary-service': { isAuthorizedCloudinaryUrl: url => url.startsWith('https://res.cloudinary.com/synthetic/') },
  });
  const get = key => route.GET(new Request('https://fixture.invalid/api'), { params: Promise.resolve({ id: task.id, key }) });
  authorized = false; assert.equal((await get(answer.storageKey)).status, 401); assert.equal(taskReads, 0); authorized = true;
  assert.equal((await get('another-key')).status, 403); assert.equal(storageReads, 0);
  const redirect = await get(answer.storageKey); assert.equal(redirect.status, 307); assert.equal(redirect.headers.get('cache-control'), 'private, no-store');
  answer.fileUrl = 'https://evil.invalid/foto.png'; assert.equal((await get(answer.storageKey)).status, 404);
  answer = { storageKey: '../../secret' }; assert.equal((await get(answer.storageKey)).status, 404); assert.equal(storageReads, 0);
  answer = { storageKey: '00000000-0000-4000-8000-000000000001', fileName: 'legado.png', mimeType: 'image/png' };
  assert.equal((await get(answer.storageKey)).status, 200); assert.equal(storageReads, 1);
  console.log('PASS: anexo exige escopo e chave persistida, bloqueia URL externa/traversal e preserva arquivo legado');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
