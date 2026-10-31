import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { publishToChannel } from "@/infrastructure/realtime/ably";

type RevokedSession = { id: string; user_id: string };
type Effects = { sessions: RevokedSession[]; nativeTokens: string[] };
const pending = new WeakMap<Prisma.TransactionClient, Effects>();

/** Serialize even the first two logins, when there are no session rows to lock. */
export async function lockDeviceLogin(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
}

/** Must run inside deviceLoginTransaction, before inserting the new session. */
export async function replaceDeviceSessions(
  tx: Prisma.TransactionClient,
  user: { id: string },
  organizationId: string,
  platform: "web" | "native" = "web",
) {
  const effects = pending.get(tx);
  if (!effects) throw new Error("Device replacement requires a login transaction.");
  const web = platform === "web" ? await tx.$queryRaw<RevokedSession[]>`
    UPDATE web_auth_sessions SET revoked_at=now()
    WHERE user_id=${user.id} AND revoked_at IS NULL AND expires_at>now()
    RETURNING id::text, user_id` : [];
  const mobile = platform === "native" ? await tx.$queryRaw<RevokedSession[]>`
    UPDATE mobile_sessions s SET revoked_at=now()
    WHERE s.user_id=${user.id}
      AND s.revoked_at IS NULL AND s.expires_at>now()
    RETURNING s.id::text, s.user_id` : [];
  if (!web.length && !mobile.length) return;

  const webIds = web.map(s => s.id);
  const mobileIds = mobile.map(s => s.id);
  if (webIds.length) await tx.userDeviceToken.deleteMany({ where: { sessionId: { in: webIds } } });
  if (mobileIds.length) {
    const tokens = await tx.$queryRaw<Array<{ token: string | null }>>`
      UPDATE mobile_installations SET revoked_at=now()
      WHERE user_id=${user.id} AND session_id=ANY(${mobileIds}::uuid[]) AND revoked_at IS NULL
      RETURNING token`;
    effects.nativeTokens.push(...tokens.flatMap(row => row.token ? [row.token] : []));
  }
  effects.sessions.push(...web, ...mobile);
  // A platform-only account has no tenant for an internal notification.
  if (organizationId) await tx.notification.create({ data: {
    organizationId, userId: user.id, type: "SECURITY_ALERT", priority: "HIGH",
    title: "Desconexão de segurança",
    message: "Outro dispositivo conectou-se à sua conta. A sessão no aparelho anterior foi encerrada por segurança.",
  } });
}

/** Commit revocation and login together; no network work can escape a rollback. */
export async function deviceLoginTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const effects: Effects = { sessions: [], nativeTokens: [] };
  const result = await notificationTransaction(async tx => {
    pending.set(tx, effects);
    try { return await work(tx); }
    finally { pending.delete(tx); }
  });
  if (effects.sessions.length) {
    const dispatch = async () => {
      await Promise.allSettled(effects.sessions.map(session => publishToChannel(
        `user:${session.user_id}:session:${session.id}`, "session:revoked", { reason: "CONCURRENT_DEVICE_LOGIN" },
      )));
      if (effects.nativeTokens.length) {
        try {
          const { sendWebPushNotification } = await import("@/infrastructure/firebase/firebase-admin");
          await sendWebPushNotification({
            tokens: [...new Set(effects.nativeTokens)], platform: "native",
            title: "Desconexão de segurança",
            body: "Outro dispositivo conectou-se à sua conta. Sua sessão neste aparelho foi encerrada.",
            data: { type: "SESSION_REVOKED", reason: "CONCURRENT_DEVICE_LOGIN" },
          });
        } catch { console.warn("[Security] Falha no push de desconexão."); }
      }
    };
    let scheduled = false;
    try { after(dispatch); scheduled = true; } catch { /* CLI has no request lifecycle. */ }
    if (!scheduled) await dispatch();
  }
  return result;
}
