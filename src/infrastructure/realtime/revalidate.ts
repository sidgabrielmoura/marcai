import { revalidatePath as invalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/infrastructure/security/session";
import { publishSyncRequired } from "./sync";

const notified = new WeakMap<
  object,
  { organizations: Set<string>; current?: ReturnType<typeof getSession> }
>();

function notifyAfterMutation(target?: string, kinds = ["ALL"]) {
  if (!process.env.ABLY_API_KEY) return;
  after(async () => {
    const request = await headers();
    let state = notified.get(request);
    if (!state) {
      state = { organizations: new Set() };
      notified.set(request, state);
    }
    const session=target?null:await(state.current??=getSession());
    const organizationId=target??session?.activeOrgId;
    if (!organizationId) return;
    const noticesOnly=kinds.every(kind=>kind==='NOTIFICATIONS_CHANGED');
    // A preceding private notice must not swallow a later structural change.
    const key=organizationId+(noticesOnly?':NOTICES':':ALL');
    if (state.organizations.has(organizationId+':ALL') || state.organizations.has(key)) return;
    state.organizations.add(key);
    await publishSyncRequired(organizationId, kinds,noticesOnly?session?.userId:undefined);
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
  notifyAfterMutation(undefined, args[0] === "/notifications" ? ["NOTIFICATIONS_CHANGED"] : ["ALL"]);
}
