import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { getAblyRest } from "./ably";

export function realtimeScopeVersion(context: AuthenticatedContext) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        role: context.role,
        locations: [...(context.scope?.locationIds ?? [])].sort(),
        teams: [...(context.scope?.teamIds ?? [])].sort(),
      }),
    )
    .digest("hex");
}

export async function realtimeToken(context: AuthenticatedContext) {
  const client = getAblyRest();
  if (!client) return null;
  // Subscribe only. The organization channel carries invalidation hints, never
  // task contents, names, resource identifiers, or permission-sensitive data.
  return client.auth.createTokenRequest({
    clientId: context.userId,
    capability: JSON.stringify({
      [`user:${context.userId}:notifications`]: ["subscribe"],
      [`org:${context.organizationId}:notifications`]: ["subscribe"],
      [`org:${context.organizationId}:sync`]: ["subscribe"],
    }),
    ttl: 10 * 60 * 1000,
  });
}

export function mobileMutationKinds(request: Request): string[] {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return [];
  const path = new URL(request.url).pathname;
  if (
    /\/notifications\/[^/]+\/read$/.test(path) ||
    path.endsWith("/installations/test")
  )
    return ["NOTIFICATIONS_CHANGED"];
  if (/\/tasks\/[^/]+\/[^/]+$/.test(path) && !path.endsWith("/uploads"))
    return ["TASK_CHANGED", "EXECUTION_CHANGED"];
  if (/\/executions\/[^/]+\/complete$/.test(path))
    return ["EXECUTION_CHANGED", "TASK_CHANGED"];
  return []; // Auth/device bookkeeping and upload chunks do not change the board.
}

export async function publishSyncRequired(
  organizationId: string,
  kinds: string[] = ["ALL"],
  userId?: string,
) {
  const client = getAblyRest();
  if (!client) return false;
  try {
    const channel = userId
      ? `user:${userId}:notifications`
      : `org:${organizationId}:sync`;
    await client.channels.get(channel).publish({
      id: randomUUID(),
      name: "sync:required",
      data: { organizationId, kinds },
    });
    return true;
  } catch {
    // Persistent replay remains authoritative after a missed hint. Never log
    // tokens, channel credentials, task contents, or personal information.
    console.warn(
      "[realtime] Invalidation delivery failed; replay will recover.",
    );
    return false;
  }
}
