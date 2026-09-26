import type { Prisma } from "@prisma/client";
import type { AuthenticatedContext } from "./auth-context";
import { prisma } from "@/infrastructure/database/prisma";

export function isManagement(context: AuthenticatedContext) {
  return ["OWNER", "ADMIN", "MANAGER"].includes(context.role);
}

export function taskScope(context: AuthenticatedContext): Prisma.TaskWhereInput {
  return {
    organizationId: context.organizationId,
    ...(context.role === "MANAGER" ? {
      locationId: { in: context.scope?.locationIds ?? [] },
      teamId: { in: context.scope?.teamIds ?? [] },
    } : context.role === "EMPLOYEE" ? {
      assignments: { some: { memberId: context.memberId, removedAt: null } },
      AND: [
        { OR: [{ locationId: null }, { locationId: { in: context.scope?.locationIds ?? [] } }] },
        { OR: [{ teamId: null }, { teamId: { in: context.scope?.teamIds ?? [] } }, { assignments: { some: { memberId: context.memberId, removedAt: null, type: "COLLABORATOR" } } }] },
      ],
    } : !isManagement(context) ? { id: "__denied__" } : {}),
  };
}

export function processScope(context: AuthenticatedContext): Prisma.ProcessWhereInput {
  return {
    organizationId: context.organizationId,
    ...(context.role === "MANAGER" ? { locationId: { in: context.scope?.locationIds ?? [] } } : {}),
    ...(!isManagement(context) ? { id: "__denied__" } : {}),
  };
}

export async function eligibleMember(organizationId: string, memberId: string, locationId: string | null, teamId: string | null, db: Pick<Prisma.TransactionClient, "organizationMember"> = prisma, now = new Date()) {
  return db.organizationMember.findFirst({
    where: {
      id: memberId, organizationId, status: "ACTIVE", user: { status: "ACTIVE" },
      ...(teamId ? { teamMemberships: { some: { teamId, team: { organizationId, status: "ACTIVE" } } } } : {}),
      ...(locationId ? { locationAccesses: { some: { locationId, location: { organizationId, status: "ACTIVE" }, AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ] } } } : {}),
    },
    select: { id: true, userId: true },
  });
}
