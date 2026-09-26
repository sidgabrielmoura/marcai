"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { getSuperadminContext } from "@/application/security/auth-context";
import { subscriptionSchema } from "@/application/superadmin/manual-subscription";
import { revalidatePath } from "next/cache";

export type ActionResult = { success?: boolean; error?: string };
const idSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(5, "Descreva o motivo com pelo menos 5 caracteres.").max(2000);
const statusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

export async function toggleOrganizationStatusAction(targetOrgId: string, newStatus: "ACTIVE" | "SUSPENDED", reason: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ id: idSchema, status: statusSchema, reason: reasonSchema }).safeParse({ id: targetOrgId, status: newStatus, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.data.id} FOR UPDATE`;
    const org = await tx.organization.findUnique({ where: { id: input.data.id }, select: { status: true } });
    if (!org) return { error: "Organização não encontrada." };
    if (org.status === input.data.status) return { success: true };
    await tx.organization.update({ where: { id: input.data.id }, data: { status: input.data.status } });
    await tx.activityLog.create({ data: { organizationId: input.data.id, actorId: actor.userId, action: input.data.status === "ACTIVE" ? "ORGANIZATION_ACTIVATED" : "ORGANIZATION_SUSPENDED", entityType: "ORGANIZATION", entityId: input.data.id, metadata: { previousStatus: org.status, newStatus: input.data.status, reason: input.data.reason } } });
    return { success: true };
  });
  revalidatePath("/superadmin");
  return result;
}

export async function updatePlatformUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED", reason: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ userId: idSchema, status: statusSchema, reason: reasonSchema }).safeParse({ userId, status, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-user-status'))`;
    const user = await tx.user.findUnique({ where: { id: input.data.userId }, include: { memberships: { select: { organizationId: true, role: true, status: true } } } });
    if (!user) return { error: "Usuário não encontrado." };
    if (user.id === actor.userId || user.platformRole === "SUPERADMIN") return { error: "Contas de superadmin não podem ser suspensas por esta operação." };
    if (!user.memberships.length) return { error: "Este usuário não tem organização para registrar a auditoria. Regularize o vínculo antes de alterar o acesso." };
    if (input.data.status === "SUSPENDED") {
      for (const membership of user.memberships.filter((member) => member.role === "OWNER" && member.status === "ACTIVE")) {
        const anotherOwner = await tx.organizationMember.count({ where: { organizationId: membership.organizationId, role: "OWNER", status: "ACTIVE", userId: { not: user.id }, user: { status: "ACTIVE" } } });
        if (!anotherOwner) return { error: "Este usuário é o único proprietário ativo de uma organização. Cadastre outro proprietário antes de suspender o acesso." };
      }
    }
    if (user.status === input.data.status) return { success: true };
    await tx.user.update({ where: { id: user.id }, data: { status: input.data.status } });
    await tx.activityLog.createMany({ data: user.memberships.map((member) => ({ organizationId: member.organizationId, actorId: actor.userId, action: "PLATFORM_USER_STATUS_CHANGED", entityType: "USER", entityId: user.id, metadata: { previousStatus: user.status, newStatus: input.data.status, reason: input.data.reason } })) });
    return { success: true };
  });
  revalidatePath("/superadmin");
  return result;
}

export async function saveManualSubscriptionAction(organizationId: string, value: unknown, reason: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ organizationId: idSchema, subscription: subscriptionSchema, reason: reasonSchema }).safeParse({ organizationId, subscription: value, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.data.organizationId} FOR UPDATE`;
    const org = await tx.organization.findUnique({ where: { id: input.data.organizationId }, select: { settings: true } });
    if (!org) return { error: "Organização não encontrada." };
    const previous = org.settings && typeof org.settings === "object" && !Array.isArray(org.settings) ? org.settings : {};
    const settings = { ...previous, platformSubscription: input.data.subscription } as Prisma.InputJsonObject;
    await tx.organization.update({ where: { id: input.data.organizationId }, data: { settings } });
    await tx.activityLog.create({ data: { organizationId: input.data.organizationId, actorId: actor.userId, action: "MANUAL_SUBSCRIPTION_UPDATED", entityType: "ORGANIZATION", entityId: input.data.organizationId, metadata: { previous: previous.platformSubscription ?? null, subscription: input.data.subscription, reason: input.data.reason } } });
    return { success: true };
  });
  revalidatePath("/superadmin");
  return result;
}

export async function addSupportNoteAction(organizationId: string, status: string, note: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ organizationId: idSchema, status: z.enum(["OPEN", "FOLLOW_UP", "RESOLVED"]), note: reasonSchema }).safeParse({ organizationId, status, note });
  if (!input.success) return { error: input.error.issues[0].message };
  const org = await prisma.organization.findUnique({ where: { id: input.data.organizationId }, select: { id: true } });
  if (!org) return { error: "Organização não encontrada." };
  await prisma.activityLog.create({ data: { organizationId: org.id, actorId: actor.userId, action: "SUPPORT_NOTE_ADDED", entityType: "ORGANIZATION", entityId: org.id, metadata: { status: input.data.status, note: input.data.note } } });
  revalidatePath("/superadmin");
  return { success: true };
}
