import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function test() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log("No org found");
    return;
  }
  console.log("Testing org:", org.id, org.name);

  // Test Locations query
  try {
    const locations = await prisma.location.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
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
                member: { status: "ACTIVE" },
              },
            },
            tasks: {
              where: {
                deletedAt: null,
                status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
              },
            },
          },
        },
      },
    });
    console.log("Locations query succeeded, count:", locations.length);
    const formattedLoc = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      teams: loc.teams.map((tl) => ({ id: tl.team.id, name: tl.team.name })),
    }));
    console.log("Locations formatted succeeded:", formattedLoc);
  } catch (err) {
    console.error("Locations query failed:", err);
  }

  // Test Teams query
  try {
    const teams = await prisma.team.findMany({
      where: { organizationId: org.id, status: "ACTIVE" },
      include: {
        locations: { include: { location: true } },
        members: {
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
                deletedAt: null,
                status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
              },
            },
          },
        },
      },
    });
    console.log("Teams query succeeded, count:", teams.length);
    const formattedTeams = teams.map((t) => ({
      id: t.id,
      name: t.name,
      locations: t.locations.map((tl) => ({ id: tl.location.id, name: tl.location.name })),
    }));
    console.log("Teams formatted succeeded:", formattedTeams);
  } catch (err) {
    console.error("Teams query failed:", err);
  }
}

test().finally(() => prisma.$disconnect());
