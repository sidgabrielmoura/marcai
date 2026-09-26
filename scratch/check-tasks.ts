import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const tasks = await prisma.task.findMany({
    include: {
      assignments: { include: { member: { include: { user: true } } } },
      location: true,
      team: true,
      process: true,
    },
  });

  console.log(`=== CURRENT TASKS (${tasks.length}) ===`);
  for (const t of tasks) {
    console.log(`Task: [${t.status}] ${t.title}`);
    console.log(`  Assigned: ${t.assignments.map(a => a.member.user.name).join(", ") || "UNASSIGNED"}`);
    console.log(`  Location: ${t.location?.name}, Team: ${t.team?.name}, Deadline: ${t.deadlineAt?.toISOString()}`);
  }
}

main().finally(() => prisma.$disconnect());
