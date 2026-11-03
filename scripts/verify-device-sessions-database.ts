import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";
import { Client } from "pg";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession, decryptSession } from "../src/infrastructure/security/session";
import { issue, authenticate, refresh } from "../src/application/mobile/security";

assert.equal(process.env.DATABASE_EFFICIENCY_ISOLATED, "1");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "56433"); assert.equal(url.pathname, "/tarefai_efficiency");
for (const key of ["ABLY_API_KEY", "FIREBASE_PRIVATE_KEY", "FIREBASE_SERVICE_ACCOUNT_KEY", "RESEND_API_KEY"])
  assert.equal(process.env[key], undefined);
globalThis.fetch = async () => { throw Error("External transport forbidden"); };
const sql: string[] = [];
const query = Client.prototype.query;
(Client.prototype as any).query = function (...args: any[]) {
  sql.push(typeof args[0] === 'string' ? args[0] : args[0]?.text);
  return (query as any).apply(this, args);
};
async function check(name: string, run: () => Promise<void>) { await run(); console.log("PASS: " + name); }

async function main() {
  const org = await prisma.organization.create({ data: { name: "Device test", slug: "device-test-" + randomUUID() } });
  const user = await prisma.user.create({ data: { name: "Synthetic device", passwordHash: "synthetic-password" } });
  const member = await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "EMPLOYEE", pinHash: "synthetic-pin" } });
  const other = await prisma.user.create({ data: { name: "Other account", passwordHash: "synthetic-password" } });
  const otherMember = await prisma.organizationMember.create({ data: { organizationId: org.id, userId: other.id, role: "OWNER" } });
  const base = { userId: user.id, name: user.name, email: null, activeOrgId: org.id, activeMemberId: member.id, role: "EMPLOYEE" as const };
  try {
    const otherToken = await encryptSession({ ...base, userId: other.id, activeMemberId: otherMember.id, role: "OWNER" });
    let current = "";
    await check("device 1 -> 2 -> 1: old JWT rejected, latest accepted, push binding removed and notice persisted", async () => {
      const first = await encryptSession(base);
      await prisma.userDeviceToken.create({ data: { userId: user.id, token: "synthetic-device-token", sessionId: String(decodeJwt(first).sessionId) } });
      const second = await encryptSession(base);
      assert.equal(await decryptSession(first), null);
      assert.ok(await decryptSession(second));
      assert.equal(await prisma.userDeviceToken.count({ where: { userId: user.id } }), 0);
      current = await encryptSession(base);
      assert.equal(await decryptSession(second), null); assert.ok(await decryptSession(current));
      assert.equal(await prisma.notification.count({ where: { userId: user.id, type: "SECURITY_ALERT" } }), 2);
      assert.ok(await decryptSession(otherToken));
    });
    await check("simultaneous browser logins leave exactly one active session, including an empty session table", async () => {
      for (const initiallyEmpty of [false, true]) {
        if (initiallyEmpty) await prisma.webAuthSession.deleteMany({ where: { userId: user.id } });
        const tokens = await Promise.all([encryptSession(base), encryptSession(base)]);
        const valid = await Promise.all(tokens.map(decryptSession));
        assert.equal(valid.filter(Boolean).length, 1);
        assert.equal(await prisma.webAuthSession.count({ where: { userId: user.id, revokedAt: null } }), 1);
        current = tokens[valid[0] ? 0 : 1];
      }
    });
    await check("failed login rolls back both revocations and security notifications", async () => {
      const notices = await prisma.notification.count({ where: { userId: user.id } });
      const secret = process.env.AUTH_SECRET; process.env.AUTH_SECRET = "invalid";
      try { await assert.rejects(encryptSession(base)); } finally { process.env.AUTH_SECRET = secret; }
      assert.ok(await decryptSession(current));
      assert.equal(await prisma.notification.count({ where: { userId: user.id } }), notices);
    });
    await check("single active device across platforms: native login revokes browser, browser login revokes native", async () => {
      const native = await issue(member.id, randomUUID());
      assert.equal(await decryptSession(current), null);
      const request = new Request("http://localhost", { headers: { authorization: "Bearer " + native.accessToken } });
      assert.ok(await authenticate(request));
      const latest = await issue(member.id, randomUUID());
      await assert.rejects(authenticate(request), (e: any) => e.code === "SESSION_REVOKED");
      await assert.rejects(refresh({ refreshToken: native.refreshToken, requestKey: randomUUID() }));
      const latestReq = new Request("http://localhost", { headers: { authorization: "Bearer " + latest.accessToken } });
      assert.ok(await authenticate(latestReq));

      // Browser login revokes active native session
      current = await encryptSession(base);
      assert.ok(await decryptSession(current));
      await assert.rejects(authenticate(latestReq), (e: any) => e.code === "SESSION_REVOKED");
      await assert.rejects(refresh({ refreshToken: latest.refreshToken, requestKey: randomUUID() }));
    });
    await check("simultaneous native logins leave only one usable credential", async () => {
      const sessions = await Promise.all([issue(member.id, randomUUID()), issue(member.id, randomUUID())]);
      const valid = await Promise.all(sessions.map(native => authenticate(new Request("http://localhost", { headers: { authorization: "Bearer " + native.accessToken } })).then(() => true, () => false)));
      assert.equal(valid.filter(Boolean).length, 1);
    });
    await check("simultaneous cross-platform logins leave only one usable credential", async () => {
      const [webToken, nativeSession] = await Promise.all([encryptSession(base), issue(member.id, randomUUID())]);
      const webValid = Boolean(await decryptSession(webToken));
      const nativeValid = await authenticate(new Request("http://localhost", { headers: { authorization: "Bearer " + nativeSession.accessToken } })).then(() => true, () => false);
      assert.equal(Number(webValid) + Number(nativeValid), 1);
    });
    await check("session validation remains one SQL read; no polling or writes", async () => {
      current = await encryptSession(base);
      const before = sql.length; assert.ok(await decryptSession(current));
      assert.equal(sql.length - before, 1); assert.match(sql.at(-1)!, /^SELECT/);
    });
    await check("the one-device rule also protects superadmin accounts", async () => {
      await prisma.user.update({ where: { id: other.id }, data: { platformRole: "SUPERADMIN" } });
      const data = { ...base, userId: other.id, activeMemberId: "", activeOrgId: "", role: "SUPERADMIN" as const };
      const a = await encryptSession(data), b = await encryptSession(data);
      assert.equal(await decryptSession(a), null); assert.ok(await decryptSession(b));
    });
  } finally {
    await prisma.$executeRaw`DELETE FROM mobile_sessions WHERE user_id=${user.id}`;
    await prisma.webAuthSession.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Client.prototype.query = query; await prisma.$disconnect();
});
