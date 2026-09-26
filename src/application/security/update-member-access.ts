import type { Prisma } from "@prisma/client";
import type { AuthenticatedContext } from "./auth-context";
import { memberAccessSchema, canManageMember } from "@/domain/rules/member-access";

export async function updateMemberAccess(tx: Prisma.TransactionClient, c: AuthenticatedContext, input: unknown) {
  const parsed = memberAccessSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"member:" + data.memberId}))`;
  const member = await tx.organizationMember.findFirst({ where: { id: data.memberId, organizationId: c.organizationId }, include: { teamMemberships: true, locationAccesses: true } });
  if (!member || !canManageMember(c.role, c.memberId, member, data.role)) return { error: "Você não pode alterar as permissões desta pessoa." };
  const teams = await tx.team.count({ where: { organizationId: c.organizationId, status: "ACTIVE", id: { in: data.teamIds } } });
  const locations = await tx.location.count({ where: { organizationId: c.organizationId, status: "ACTIVE", id: { in: data.locations.map(location => location.locationId) } } });
  if (teams !== data.teamIds.length || locations !== data.locations.length) return { error: "Selecione apenas equipes e unidades ativas desta organização." };
  const oldAccess = { role: member.role, teamIds: member.teamMemberships.map(team => team.teamId), locations: member.locationAccesses.map(location => ({ locationId: location.locationId, type: location.type, startsAt: location.startsAt?.toISOString() ?? null, expiresAt: location.expiresAt?.toISOString() ?? null })) };
  await tx.organizationMember.update({ where: { id: member.id, organizationId: c.organizationId }, data: { role: data.role } });
  await tx.teamMember.deleteMany({ where: { organizationMemberId: member.id, teamId: { notIn: data.teamIds } } });
  for (const teamId of data.teamIds) await tx.teamMember.upsert({ where: { teamId_organizationMemberId: { teamId, organizationMemberId: member.id } }, create: { teamId, organizationMemberId: member.id, isPrimary: teamId === data.primaryTeamId }, update: { isPrimary: teamId === data.primaryTeamId } });
  await tx.memberLocationAccess.deleteMany({ where: { memberId: member.id, locationId: { notIn: data.locations.map(location => location.locationId) } } });
  for (const location of data.locations) {
    const access = { type: location.type, startsAt: location.startsAt ? new Date(location.startsAt) : null, expiresAt: location.expiresAt ? new Date(location.expiresAt) : null, grantedBy: c.memberId };
    await tx.memberLocationAccess.upsert({ where: { memberId_locationId: { memberId: member.id, locationId: location.locationId } }, create: { memberId: member.id, locationId: location.locationId, ...access }, update: access });
  }
  await tx.activityLog.create({ data: { organizationId: c.organizationId, actorId: c.memberId, action: "MEMBER_ACCESS_UPDATED", entityType: "USER", entityId: member.id, metadata: { previous: oldAccess, updated: data } } });
  return { success: true };
}
