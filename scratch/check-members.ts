import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const orgs = await prisma.organization.findMany({
    include: {
      locations: true,
      teams: true,
      members: {
        include: {
          user: true,
          teamMemberships: { include: { team: true } },
          locationAccesses: { include: { location: true } },
        },
      },
    },
  });

  for (const org of orgs) {
    console.log(`\n=== ORG: ${org.name} (${org.id}) ===`);
    console.log(`Locations (${org.locations.length}):`, org.locations.map(l => `${l.name} (${l.id})`).join(", "));
    console.log(`Teams (${org.teams.length}):`, org.teams.map(t => `${t.name} (${t.id})`).join(", "));
    console.log(`Members (${org.members.length}):`);
    for (const m of org.members) {
      console.log(` - ${m.user.name} | Role: ${m.role} | Email: ${m.user.email} | MemberId: ${m.id}`);
      console.log(`   Teams: ${m.teamMemberships.map(t => t.team.name).join(", ") || "none"}`);
      console.log(`   Locations: ${m.locationAccesses.map(l => l.location.name).join(", ") || "none"}`);
    }
  }

  // Check current tasks
  const tasksCount = await prisma.task.count();
  console.log(`\nTotal tasks in DB: ${tasksCount}`);
}

main().finally(() => prisma.$disconnect());
