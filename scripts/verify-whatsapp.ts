import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, createHmac, createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { prisma } from "../src/infrastructure/database/prisma";

const url = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.DATABASE_EFFICIENCY_ISOLATED, "1");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "56433");
const requireNode = createRequire(import.meta.url);
const env = { ...process.env, AUTH_SECRET: "synthetic-webhook-secret-longer-than-thirty-two-characters", WAHA_BASE_URL: "https://waha.synthetic.invalid", WAHA_KEY: "synthetic-api-key", BASE_URL: "https://backend.synthetic.invalid" };
let context: any;
let failProvider = false, failPublishing = false, blockGet: Promise<void> | undefined;
let qrRace: "connected" | "missing" | "failed" | null = null;
const sessions = new Map<string, any>();
const calls: Array<{ method: string; pathname: string; body?: any }> = [];
const publications: Array<{ channel: string; messages: any[] }> = [];
const tokenRequests: any[] = [];
const background: Promise<unknown>[] = [];
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0]);
async function provider(input: string, options: RequestInit = {}) {
  const target = new URL(input);
  assert.equal(target.origin, env.WAHA_BASE_URL);
  assert.equal((options.headers as Record<string, string>)["X-Api-Key"], env.WAHA_KEY);
  assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
  const method = options.method || "GET";
  const body = typeof options.body === "string" ? JSON.parse(options.body) : undefined;
  calls.push({ method, pathname: target.pathname, body });
  if (failProvider) return new Response("PRIVATE_PROVIDER_DETAIL", { status: 500 });
  if (method === "GET" && target.pathname.startsWith("/api/sessions/") && blockGet) await blockGet;
  if (target.pathname === "/api/contacts/check-exists") { const phone = target.searchParams.get("phone")!; return Response.json({ numberExists: true, chatId: phone.slice(0, 4) + phone.slice(5) + "@c.us" }); }
  if (target.pathname === "/api/sendText") return Response.json({ id: "synthetic-provider-" + randomUUID() });
  if (target.pathname.includes("/auth/qr")) {
    if (qrRace) {
      const race = qrRace; qrRace = null;
      const session = sessions.get(decodeURIComponent(target.pathname.split("/")[2]));
      if (race !== "failed" && session) { session.status = "WORKING"; session.me = { id: "5511999999999@c.us", pushName: "Synthetic WhatsApp" }; }
      return new Response(null, { status: race === "missing" ? 404 : 400 });
    }
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  }
  if (target.pathname === "/api/sessions" && method === "POST") {
    if (sessions.has(body.name)) return new Response("", { status: 422 });
    const remote = { name: body.name, status: "SCAN_QR_CODE", config: body.config, me: null };
    sessions.set(body.name, remote); return Response.json(remote);
  }
  const name = decodeURIComponent(target.pathname.split("/")[3] || "");
  const remote = sessions.get(name);
  if (!remote) return new Response(null, { status: 404 });
  if (method === "PUT") { remote.config = body.config; return Response.json(remote); }
  if (method === "DELETE") { sessions.delete(name); return new Response(null, { status: 204 }); }
  const operation = target.pathname.split("/")[4];
  if (operation === "stop" || operation === "logout") { remote.status = "STOPPED"; remote.me = null; }
  if (operation === "start" || operation === "restart") remote.status = "SCAN_QR_CODE";
  return Response.json(remote);
}
const cache = new Map<string, any>();
function load(relative: string): any {
  const absolute = path.resolve(relative.endsWith(".ts") ? relative : relative + ".ts");
  if (cache.has(absolute)) return cache.get(absolute);
  const exports: Record<string, any> = {}; cache.set(absolute, exports);
  const code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mockedRequire = (name: string): any => {
    if (name === "@/infrastructure/database/prisma") return { prisma };
    if (name === "@/application/security/auth-context") return { getAuthenticatedContext: async () => context };
    if (name === "next/server") return { after: (work: () => Promise<unknown>) => { background.push(Promise.resolve().then(work)); } };
    if (name === "@/infrastructure/realtime/ably") return { getAblyRest: () => ({
      auth: { createTokenRequest: async (params: any) => { tokenRequests.push(params); return { capability: params.capability, ttl: params.ttl }; } },
      channels: { get: (channel: string) => ({ publish: async (messages: any[]) => { if (failPublishing) throw new Error("PRIVATE_ABLY_DETAIL"); publications.push({ channel, messages }); } }) },
    }) };
    if (name.startsWith("@/")) return load(path.join("src", name.slice(2)));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(absolute), name));
    return requireNode(name);
  };
  vm.runInNewContext(code, { exports, require: mockedRequire, process: { env }, Buffer, URL, URLSearchParams, AbortSignal, Response, Request, Headers, fetch: provider, console, setTimeout, clearTimeout, Date }, { filename: absolute });
  return exports;
}
const actions = load("src/presentation/actions/whatsapp-actions");
const service = load("src/application/whatsapp/instances");
const security = load("src/infrastructure/whatsapp/webhook-security");
const webhooks = load("src/application/whatsapp/webhooks");
const realtime = load("src/infrastructure/whatsapp/realtime");
const auth = load("src/application/whatsapp/authorization");
const repository = load("src/infrastructure/whatsapp/repository").whatsappRepository;
const webhookRoute = load("src/app/api/whatsapp/webhooks/[session]/route");
const instanceRoute = load("src/app/api/whatsapp/instances/[id]/route");
const tokenRoute = load("src/app/api/whatsapp/instances/[id]/token/route");
function signed(session: string, event: any, valid = true) {
  const body = JSON.stringify(event);
  const signature = createHmac("sha512", security.webhookKey(session)).update(body).digest("hex");
  return new Request("https://backend.synthetic.invalid/api/whatsapp/webhooks/" + session, { method: "POST", body, headers: { "X-Webhook-Hmac": valid ? signature : "0".repeat(128), "X-Webhook-Hmac-Algorithm": "sha512" } });
}
function status(session: string, value: string, timestamp = Date.now(), me: any = null, id = "evt_" + randomUUID()) {
  return { id, timestamp, session, event: "session.status", me, payload: { name: session, status: value } };
}
async function main() {
  const org = await prisma.organization.create({ data: { name: "WAHA synthetic", slug: randomUUID() } });
  const other = await prisma.organization.create({ data: { name: "Other synthetic", slug: randomUUID() } });
  const user = await prisma.user.create({ data: { name: "Synthetic owner" } });
  const member = await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
  const location = await prisma.location.create({ data: { organizationId: org.id, name: "Center" } });
  const foreign = await prisma.location.create({ data: { organizationId: other.id, name: "Other" } });
  context = { organizationId: org.id, userId: user.id, memberId: member.id, role: "ADMIN" };
  let instance: any;
  try {
    assert.ok((await actions.createWhatsAppInstanceAction({ name: "One", locationId: location.id })).error);
    assert.ok((await actions.saveWhatsAppRecipientsAction([])).error);
    await assert.rejects(actions.getWhatsAppSettingsAction());
    context.role = "OWNER";
    assert.ok((await actions.createWhatsAppInstanceAction({ name: "Other", locationId: foreign.id })).error);
    const attempts = await Promise.all([actions.createWhatsAppInstanceAction({ name: "One", locationId: location.id }), actions.createWhatsAppInstanceAction({ name: "Two", locationId: location.id })]);
    assert.equal(attempts.filter(result => result.data).length, 1);
    instance = await prisma.whatsAppInstance.findFirstOrThrow({ where: { organizationId: org.id } });
    assert.match(instance.session, /^INSTANCE-[A-F0-9]{24}$/); assert.equal(instance.status, "PENDING"); assert.equal(calls.length, 0);
    const five = Array.from({ length: 5 }, (_, i) => ({ name: "Contact " + i, phone: "551199999000" + i }));
    assert.ok((await actions.saveWhatsAppRecipientsAction([...five, five[0]])).error);
    assert.ok((await actions.saveWhatsAppRecipientsAction([five[0], { ...five[0], phone: "+55 (11) 99999-0000" }])).error);
    assert.ok((await actions.saveWhatsAppRecipientsAction([{ name: "Invalid", phone: "55859922954704343" }])).error);
    assert.ok((await actions.saveWhatsAppRecipientsAction(five)).data);
    context.organizationId = other.id;
    assert.ok((await actions.manageWhatsAppInstanceAction(instance.id, "connect")).error);
    await assert.rejects(auth.whatsAppRealtimeToken(instance.id));
    context.organizationId = org.id;
    const connected = await actions.manageWhatsAppInstanceAction(instance.id, "connect"); assert.ok(connected.data);
    assert.equal(connected.data.status, "SCAN_QR_CODE"); assert.ok(connected.data.qr.startsWith("data:image/png;base64,"));
    const creation = calls.find(call => call.method === "POST" && call.pathname === "/api/sessions")!.body;
    assert.equal(creation.config.noweb.store.enabled, true); assert.equal(creation.config.noweb.store.fullSync, false);
    assert.equal(creation.config.webhooks[0].hmac.key, security.webhookKey(instance.session));
    assert.equal(creation.config.webhooks[0].url, env.BASE_URL + "/api/whatsapp/webhooks/" + instance.session);
    assert.deepEqual(Array.from(creation.config.webhooks[0].events), ["session.status", "message", "message.any", "message.ack"]);
    await actions.manageWhatsAppInstanceAction(instance.id, "connect");
    assert.equal(calls.filter(call => call.method === "POST" && call.pathname === "/api/sessions").length, 1);
    const stable = await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } });
    const eventCount = await prisma.whatsAppWebhookEvent.count({ where: { instanceId: instance.id } });
    await service.readWhatsAppQr(instance.id);
    assert.equal((await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).revision, stable.revision);
    assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { instanceId: instance.id } }), eventCount);
    qrRace = "connected";
    const pairedDuringQr = await actions.getWhatsAppQrAction(instance.id);
    assert.equal(pairedDuringQr.error, undefined);
    assert.equal(pairedDuringQr.data?.status, "WORKING");
    assert.equal(pairedDuringQr.data?.qr, null);
    sessions.get(instance.session).status = "SCAN_QR_CODE";
    await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status: "SCAN_QR_CODE" } });
    qrRace = "missing";
    const pairedDuringRefresh = await actions.manageWhatsAppInstanceAction(instance.id, "refresh");
    assert.equal(pairedDuringRefresh.error, undefined);
    assert.equal(pairedDuringRefresh.data?.status, "WORKING");
    sessions.get(instance.session).status = "SCAN_QR_CODE";
    await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status: "SCAN_QR_CODE" } });
    qrRace = "failed";
    assert.ok((await actions.getWhatsAppQrAction(instance.id)).error);
    env.BASE_URL = "https://changed.synthetic.invalid";
    await service.manageWhatsAppInstance(instance.id, "refresh");
    assert.equal(sessions.get(instance.session).config.webhooks[0].url, env.BASE_URL + "/api/whatsapp/webhooks/" + instance.session);
    assert.ok(calls.some(call => call.method === "PUT"));
    const remote = sessions.get(instance.session);
    remote.status = "FAILED"; await service.manageWhatsAppInstance(instance.id, "connect"); assert.ok(calls.some(call => call.pathname.endsWith("/restart")));
    await service.manageWhatsAppInstance(instance.id, "stop"); await service.manageWhatsAppInstance(instance.id, "start");
    const beforeDisconnect = calls.length;
    await service.manageWhatsAppInstance(instance.id, "disconnect");
    const disconnect = calls.slice(beforeDisconnect).map(call => call.pathname.split("/").at(-1));
    assert.ok(disconnect.indexOf("logout") < disconnect.indexOf("stop"));
    let release!: () => void;
    blockGet = new Promise(resolve => { release = resolve; });
    const first = service.manageWhatsAppInstance(instance.id, "connect");
    while (!(await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).operationToken) await new Promise(resolve => setTimeout(resolve, 10));
    await assert.rejects(service.manageWhatsAppInstance(instance.id, "disconnect"), (error: any) => error.code === "OPERATION_IN_PROGRESS");
    release(); blockGet = undefined; await first;
    const operationKey = createHash("sha256").update("whatsapp:operation:" + org.id + ":" + user.id + ":" + instance.id).digest("hex");
    await prisma.nativeRateLimit.deleteMany({ where: { key: operationKey } });
    const now = Date.now();
    const working = status(instance.session, "WORKING", now, { id: "5511999999999@c.us", pushName: "Synthetic WhatsApp" });
    await webhooks.receiveWhatsAppWebhook(signed(instance.session, working), instance.session);
    const revision = (await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).revision;
    await webhooks.receiveWhatsAppWebhook(signed(instance.session, working), instance.session);
    assert.equal((await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).revision, revision);
    await assert.rejects(webhooks.receiveWhatsAppWebhook(signed(instance.session, working, false), instance.session), (error: any) => error.code === "INVALID_SIGNATURE");
    const stale = status(instance.session, "SCAN_QR_CODE", now - 10000);
    await webhooks.receiveWhatsAppWebhook(signed(instance.session, stale), instance.session);
    assert.equal((await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).status, "WORKING");
    const stopped = status(instance.session, "STOPPED", now + 1);
    const response = await webhookRoute.POST(signed(instance.session, stopped), { params: Promise.resolve({ session: instance.session }) }); assert.equal(response.status, 202);
    const saved = await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } });
    assert.equal(saved.connectedPhone, "5511999999999"); assert.equal(saved.connectedName, "Synthetic WhatsApp");
    const mismatched = { ...status(instance.session, "WORKING"), session: "INSTANCE-other" };
    await assert.rejects(webhooks.receiveWhatsAppWebhook(signed(instance.session, mismatched), instance.session), (error: any) => error.code === "SESSION_MISMATCH");
    const expired = status(instance.session, "WORKING", now - 600000);
    await assert.rejects(webhooks.receiveWhatsAppWebhook(signed(instance.session, expired), instance.session), (error: any) => error.code === "EXPIRED_EVENT");
    for (const kind of ["message", "message.any", "message.ack"]) {
      const event = { id: "evt_" + randomUUID(), timestamp: Date.now(), session: instance.session, event: kind, me: null, payload: { id: "synthetic-message", fromMe: false, body: "PRIVATE_MESSAGE_BODY", ack: 3 } };
      await webhooks.receiveWhatsAppWebhook(signed(instance.session, event), instance.session);
      await webhooks.receiveWhatsAppWebhook(signed(instance.session, event), instance.session);
      const receipt = await prisma.whatsAppWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
      assert.ok(!JSON.stringify(receipt.data).includes("PRIVATE_MESSAGE_BODY"));
    }
    await auth.whatsAppRealtimeToken(instance.id);
    const expectedChannel = "whatsapp:" + org.id + ":" + location.id + ":" + instance.id;
    assert.deepEqual(JSON.parse(tokenRequests.at(-1).capability), { [expectedChannel]: ["subscribe"] }); assert.equal(tokenRequests.at(-1).ttl, 120000);
    context.role = "ADMIN"; const denied = await tokenRoute.GET(new Request("https://backend.synthetic.invalid"), { params: Promise.resolve({ id: instance.id }) }); assert.equal(denied.status, 403); context.role = "OWNER";
    await Promise.all(background); await realtime.publishWhatsAppPending(instance.id);
    assert.ok(publications.length > 0);
    assert.ok(publications.every(row => row.channel === expectedChannel));
    assert.ok(publications.every(row => !JSON.stringify(row.messages).includes("base64") && !JSON.stringify(row.messages).includes("5511999999999")));
    const failedStatus = status(instance.session, "FAILED", now + 2); await webhooks.receiveWhatsAppWebhook(signed(instance.session, failedStatus), instance.session);
    failPublishing = true; await realtime.publishWhatsAppPending(instance.id); assert.ok(await prisma.whatsAppWebhookEvent.count({ where: { instanceId: instance.id, publishedAt: null } }));
    failPublishing = false; await realtime.publishWhatsAppPending(instance.id); assert.equal(await prisma.whatsAppWebhookEvent.count({ where: { instanceId: instance.id, publishedAt: null } }), 0);
    await repository.rate("synthetic-rate:" + org.id, 2); await repository.rate("synthetic-rate:" + org.id, 2);
    await assert.rejects(repository.rate("synthetic-rate:" + org.id, 2), (error: any) => error.status === 429);
    failProvider = true; const failure = await actions.manageWhatsAppInstanceAction(instance.id, "refresh"); assert.ok(failure.error); assert.ok(!JSON.stringify(failure).includes("PRIVATE_PROVIDER_DETAIL")); failProvider = false;
    assert.equal((await prisma.whatsAppInstance.findUniqueOrThrow({ where: { id: instance.id } })).operationToken, null);
    const wrongOrigin = await instanceRoute.DELETE(new Request("https://changed.synthetic.invalid/api/whatsapp/instances/" + instance.id, { method: "DELETE", headers: { origin: "https://untrusted.invalid" } }), { params: Promise.resolve({ id: instance.id }) }); assert.equal(wrongOrigin.status, 403);
    await prisma.organization.update({ where: { id: org.id }, data: { settings: { whatsappAlerts: { enabled: true, notificationTypes: ["APPROVAL_PENDING"], criticalityFilter: "ALL", triggerStep: 0, businessHoursOnly: false } } } });
    await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status: "WORKING" } });
    const task = await prisma.task.create({ data: { organizationId: org.id, locationId: location.id, title: "Synthetic task" } });
    const sender = load("src/infrastructure/whatsapp/waha-service");
    const before = calls.filter(call => call.pathname === "/api/sendText").length;
    const params = { organizationId: org.id, taskId: task.id, type: "APPROVAL_REQUESTED", priority: "MEDIUM", title: "Synthetic", message: "Fixture only" };
    assert.equal((await sender.maybeDispatchWhatsAppAlert(params)).success, true);
    assert.equal(calls.filter(call => call.pathname === "/api/sendText").length - before, 5);
    assert.ok(calls.filter(call => call.pathname === "/api/sendText").every(call => call.body.session === instance.session && call.body.chatId.endsWith("@c.us")));
    const countQueries = calls.filter(call => call.pathname === "/api/contacts/check-exists");
    assert.equal(countQueries.length, 5);
    assert.deepEqual(calls.filter(call => call.pathname === "/api/sendText").map(call => call.body.chatId).sort(), five.map(row => row.phone.slice(0, 4) + row.phone.slice(5) + "@c.us").sort());
    await sender.maybeDispatchWhatsAppAlert({ ...params, organizationId: other.id }); assert.equal(calls.filter(call => call.pathname === "/api/sendText").length - before, 5);
    const beforeDelete = calls.length;
    const removed = await service.manageWhatsAppInstance(instance.id, "delete"); assert.equal(removed.deleted, true);
    assert.equal(sessions.has(instance.session), false); assert.equal(await prisma.whatsAppInstance.count({ where: { id: instance.id } }), 0);
    const deletion = calls.slice(beforeDelete); assert.ok(deletion.findIndex(call => call.pathname.endsWith("/logout")) < deletion.findIndex(call => call.method === "DELETE"));
    console.log("PASS: owner/tenant/unit authorization, validation, limits, random sessions, NOWEB config and PUT, PNG QR, lifecycle, leases, signed/idempotent/ordered webhooks, identity retention, private Ably tokens/hints, retry receipts, check-exists and five-recipient routing, logout then DELETE");
  } finally {
    failProvider = false; failPublishing = false; await Promise.allSettled(background);
    await prisma.task.deleteMany({ where: { organizationId: org.id } });
    await prisma.$executeRaw`DELETE FROM mobile_events WHERE organization_id IN (${org.id},${other.id})`;
    const identities = [
      "create:" + org.id + ":" + user.id, "recipients:" + org.id + ":" + user.id,
      "token:" + org.id + ":" + user.id, "snapshot:" + org.id + ":" + user.id, "synthetic-rate:" + org.id,
      ...(instance ? ["operation:" + org.id + ":" + user.id + ":" + instance.id, "qr:" + org.id + ":" + user.id + ":" + instance.id, "webhook:" + instance.session] : []),
    ];
    await prisma.nativeRateLimit.deleteMany({ where: { key: { in: identities.map(id => createHash("sha256").update("whatsapp:" + id).digest("hex")) } } });
    await prisma.organization.delete({ where: { id: org.id } }); await prisma.organization.delete({ where: { id: other.id } }); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
