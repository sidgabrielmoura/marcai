import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { taskScope } from "../src/application/security/operational-scope";
import { Role } from "../src/domain/types";

async function test() {
  const org = await prisma.organization.findFirst({
    include: {
      members: {
        include: {
          user: true,
          locationAccesses: true,
          teamMemberships: true,
        },
      },
    },
  });

  if (!org) {
    console.log("No org found");
    return;
  }

  for (const member of org.members) {
    console.log("Testing with member:", member.user.name, member.role);
    const context = {
      userId: member.user.id,
      userName: member.user.name,
      userEmail: member.user.email,
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      memberId: member.id,
      role: member.role as Role,
      scope: {
        locationIds: member.locationAccesses.map((la) => la.locationId),
        teamIds: member.teamMemberships.map((tm) => tm.teamId),
      },
    };

    // Test Locations Page query
    try {
      const whereClauseLoc: any = {
        organizationId: context.organizationId,
        status: "ACTIVE",
      };
      if (context.role === "MANAGER" && context.scope) {
        whereClauseLoc.id = { in: context.scope.locationIds };
      }

      const [locations, allTeams] = await Promise.all([
        prisma.location.findMany({
          where: whereClauseLoc,
          include: {
            teams: { include: { team: true } },
            _count: {
              select: {
                memberAccesses: {
                  where: {
                    AND: [
                      { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
                      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                    ],
                    member: {
                      status: "ACTIVE",
                      ...(context.role === "MANAGER"
                        ? {
                            teamMemberships: {
                              some: { teamId: { in: context.scope?.teamIds ?? [] } },
                            },
                          }
                        : {}),
                    },
                  },
                },
                tasks: {
                  where: {
                    ...taskScope(context as any),
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
            ...(context.role === "MANAGER"
              ? { id: { in: context.scope?.teamIds ?? [] } }
              : {}),
          },
          select: { id: true, name: true },
        }),
      ]);

      const formattedLoc = locations.map((loc) => ({
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
      console.log("Locations success for role:", member.role, "count:", formattedLoc.length);
    } catch (err) {
      console.error("Locations FAILED for role:", member.role, err);
    }

    // Test Teams Page query
    try {
      const whereClauseTeam: any = {
        organizationId: context.organizationId,
        status: "ACTIVE",
      };
      if (context.role === "MANAGER" && context.scope) {
        whereClauseTeam.id = { in: context.scope.teamIds };
      }

      const [teams, managers, allLocations] = await Promise.all([
        prisma.team.findMany({
          where: whereClauseTeam,
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
                            AND: [
                              { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
                              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                            ],
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
                    ...taskScope(context as any),
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
      ]);

      const formattedTeams = teams.map((t) => {
        const manager = managers.find((m) => m.id === t.managerMemberId);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          managerName: manager?.user.name || null,
          managerMemberId: t.managerMemberId,
          membersCount: t.members.length,
          activeTasksCount: t._count.tasks,
          members: t.members.map((m) => m.member.user.name),
          locations: t.locations.map((tl) => ({ id: tl.location.id, name: tl.location.name })),
        };
      });
      console.log("Teams success for role:", member.role, "count:", formattedTeams.length);
    } catch (err) {
      console.error("Teams FAILED for role:", member.role, err);
    }
  }
}

test().finally(() => prisma.$disconnect());
