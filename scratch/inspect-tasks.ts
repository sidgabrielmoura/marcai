import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const tasks = await prisma.task.findMany({
    include: {
      location: true,
      team: true,
      process: true,
      execution: { include: { process: true } },
      evidenceRequirements: true,
      occurrences: true,
      assignments: { include: { member: { include: { user: true } } } },
    },
  });

  console.log("Total tasks in DB:", tasks.length);
  for (const t of tasks) {
    console.log(
      JSON.stringify({
        id: t.id,
        title: t.title,
        hasDescription: !!t.description,
        descriptionLen: t.description?.length || 0,
        status: t.status,
        origin: t.origin,
        processName: t.process?.name || t.execution?.process?.name || null,
        locationName: t.location?.name || null,
        teamName: t.team?.name || null,
        scheduledDate: t.scheduledDate,
        deadlineAt: t.deadlineAt,
        evidenceCount: t.evidenceRequirements.length,
        hasImpediment: t.occurrences.length > 0,
        assignees: t.assignments.map((a) => a.member.user.name),
      })
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
