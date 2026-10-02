import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { TeamsClient } from "@/presentation/components/organization/teams-client";
import { Role } from "@/domain/types";
import { taskScope } from "@/application/security/operational-scope";

export default async function ManagementTeamsPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const now = new Date();
  const validAccess = {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };

  const whereClause: any = {
    organizationId: context.organizationId,
    status: "ACTIVE",
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.id = { in: context.scope.teamIds };
  }

  const [teams, managers, allLocations, allMembers] = await Promise.all([
    prisma.team.findMany({
      where: whereClause,
      include: {
        locations: { include: { location: true } },
        members: {
          where:
            context.role === "MANAGER"
              ? {
                  member: {
                    locationAccesses: {
                      some: {
                        locationId: { in: context.scope?.locationIds ?? [] },
                        ...validAccess,
                      },
                    },
                  },
                }
              : {},
          include: {
            member: {
              include: { user: true },
            },
          },
        },
        _count: {
          select: {
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
    prisma.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        role: { in: [Role.OWNER, Role.ADMIN, Role.MANAGER] },
        status: "ACTIVE",
      },
      include: { user: true },
    }),
    prisma.location.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER"
          ? { id: { in: context.scope?.locationIds ?? [] } }
          : {}),
      },
      select: { id: true, name: true },
    }),
    prisma.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER"
          ? {
              locationAccesses: {
                some: {
                  locationId: { in: context.scope?.locationIds ?? [] },
                  ...validAccess,
                },
              },
            }
          : {}),
      },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const formatted = teams.map((t) => {
    const manager = managers.find((m) => m.id === t.managerMemberId);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      managerName: manager?.user.name || null,
      managerMemberId: t.managerMemberId,
      membersCount: t.members.length,
      activeTasksCount: t._count.tasks,
      members: t.members.map((m) => ({
        id: m.member.id,
        name: m.member.user.name,
        email: m.member.user.email,
        role: m.member.role,
        isPrimary: m.isPrimary,
      })),
      locations: t.locations.map((tl) => ({
        id: tl.location.id,
        name: tl.location.name,
      })),
    };
  });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <TeamsClient
        teams={formatted}
        managers={managers.map((m) => ({ id: m.id, name: m.user.name }))}
        locations={allLocations}
        allMembers={allMembers.map((m) => ({
          id: m.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        }))}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
