import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { LocationsClient } from "@/presentation/components/organization/locations-client";
import { taskScope } from "@/application/security/operational-scope";

export default async function ManagementLocationsPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const whereClause: any = {
    organizationId: context.organizationId,
    status: "ACTIVE",
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.id = { in: context.scope.locationIds };
  }

  const [locations, allTeams] = await Promise.all([
    prisma.location.findMany({
      where: whereClause,
    include: {
      teams: { include: { team: true } },
      _count: {
        select: {
          memberAccesses: { where: {
            AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            member: { status: "ACTIVE", ...(context.role === "MANAGER" ? { teamMemberships: { some: { teamId: { in: context.scope?.teamIds ?? [] } } } } : {}) },
          } },
          tasks: {
            where: {
              ...taskScope(context),
              deletedAt: null,
              status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }),
  prisma.team.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      ...(context.role === "MANAGER" ? { id: { in: context.scope?.teamIds ?? [] } } : {}),
    },
    select: { id: true, name: true },
  }),
]);

  const formatted = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    address: loc.address,
    timezone: loc.timezone,
    openingTime: loc.openingTime,
    closingTime: loc.closingTime,
    operatingDays: loc.operatingDays,
    membersCount: loc._count.memberAccesses,
    tasksCount: loc._count.tasks,
    teams: loc.teams.map((tl) => ({ id: tl.team.id, name: tl.team.name })),
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <LocationsClient locations={formatted} teams={allTeams} userRole={context.role} />
    </ManagementShell>
  );
}
