import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { PeopleClient } from "@/presentation/components/organization/people-client";

export default async function ManagementPeoplePage() {
  const context = await getManagementContext();
  if (!context) return null;
  const now = new Date();
  const validAccess = { AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };

  const [members, locations, teams] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        ...(context.role === "MANAGER" ? { teamMemberships: { some: { teamId: { in: context.scope?.teamIds ?? [] } } }, locationAccesses: { some: { locationId: { in: context.scope?.locationIds ?? [] }, ...validAccess } } } : {}),
      },
      include: {
        user: true,
        locationAccesses: { ...(context.role === "MANAGER" ? { where: { locationId: { in: context.scope?.locationIds ?? [] }, ...validAccess } } : {}), include: { location: true } },
        teamMemberships: { ...(context.role === "MANAGER" ? { where: { teamId: { in: context.scope?.teamIds ?? [] } } } : {}), include: { team: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.location.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER" ? { id: { in: context.scope?.locationIds ?? [] } } : {}),
      },
      select: { id: true, name: true },
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

  const formatted = members.map((m) => ({
    id: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    employeeCode: m.employeeCode,
    availabilityStatus: m.availabilityStatus,
    manualAvailability: m.manualAvailability,
    locations: m.locationAccesses.map((la) => la.location.name),
    teams: m.teamMemberships.map((tm) => tm.team.name),
    access: {
      teamIds: m.teamMemberships.map(team => team.teamId),
      primaryTeamId: m.teamMemberships.find(team => team.isPrimary)?.teamId ?? m.teamMemberships[0]?.teamId ?? "",
      locations: m.locationAccesses.map(location => ({ locationId: location.locationId, type: location.type, startsAt: location.startsAt?.toISOString() ?? null, expiresAt: location.expiresAt?.toISOString() ?? null })),
    },
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <PeopleClient
        members={formatted}
        locations={locations}
        teams={teams}
        userRole={context.role}
        currentMemberId={context.memberId}
      />
    </ManagementShell>
  );
}
