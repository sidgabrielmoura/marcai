import { revalidatePath as invalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/infrastructure/security/session";
import { publishSyncRequired } from "./sync";

const notified = new WeakMap<
  object,
  { organizations: Set<string>; current?: Promise<string | undefined> }
>();

function notifyAfterMutation(target?: string) {
  if (!process.env.ABLY_API_KEY) return;
  after(async () => {
    const request = await headers();
    let state = notified.get(request);
    if (!state) {
      state = { organizations: new Set() };
      notified.set(request, state);
    }
    const organizationId =
      target ??
      (await (state.current ??= getSession().then(
        (session) => session?.activeOrgId,
      )));
    if (!organizationId) return;
    if (state.organizations.has(organizationId)) return;
    state.organizations.add(organizationId);
    await publishSyncRequired(organizationId);
  });
}

/** Server-authorized target, used when a superadmin changes another tenant. */
export function revalidateOrganization(organizationId: string) {
  notifyAfterMutation(organizationId);
}

/** Call only after committed writes, just like Next's revalidatePath. */
export function revalidatePath(...args: Parameters<typeof invalidatePath>) {
  invalidatePath(...args);
  // No cross-request cache of authorization. Explicit targets and current-tenant
  // invalidations are coalesced independently within this request.
  notifyAfterMutation();
}
