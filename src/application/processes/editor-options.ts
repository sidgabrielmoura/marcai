import type { AuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
export async function processEditorOptions(context: AuthenticatedContext) {
  const [locations, teams, rawMembers] = await Promise.all([
    prisma.location.findMany({ where: { organizationId: context.organizationId, status: "ACTIVE", ...(context.role === "MANAGER" ? { id: { in: context.scope?.locationIds ?? [] } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { organizationId: context.organizationId, status: "ACTIVE", ...(context.role === "MANAGER" ? { id: { in: context.scope?.teamIds ?? [] } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId: context.organizationId, status: "ACTIVE", ...(context.role === "MANAGER" ? { teamMemberships: { some: { teamId: { in: context.scope?.teamIds ?? [] } } }, locationAccesses: { some: { locationId: { in: context.scope?.locationIds ?? [] } } } } : {}) }, select: { id: true, role: true, user: { select: { name: true } }, teamMemberships: { select: { teamId: true } }, locationAccesses: { where: { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] }, select: { locationId: true } } } }),
  ]);
  return { locations, teams, members: rawMembers.map(m => ({ id: m.id, name: m.user.name, role: m.role, teamIds: m.teamMemberships.map(t => t.teamId), locationIds: m.locationAccesses.map(l => l.locationId) })) };
}
