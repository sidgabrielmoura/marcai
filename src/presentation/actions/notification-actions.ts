"use server";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { revalidatePath } from "next/cache";
export async function markNotificationReadAction(form: FormData) {
  const c = await getAuthenticatedContext();
  if (!c) return;
  const id = String(form.get("id") || "");
  await prisma.notification.updateMany({ where: { organizationId: c.organizationId, userId: c.userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}
