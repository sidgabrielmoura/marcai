import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { taskTiming } from "../src/domain/rules/task-metrics";

async function main() {
  const member = await prisma.organizationMember.findFirst({
    where: { user: { email: "lucas@alphavarejo.com" } },
    include: {
      teamMemberships: true,
      locationAccesses: true,
    },
  });

  if (!member) {
    console.log("Lucas not found");
    return;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const selectFields = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    criticality: true,
    origin: true,
    scheduledDate: true,
    deadlineAt: true,
    completedAt: true,
    startedAt: true,
    slaDueAt: true,
    location: { select: { id: true, name: true, timezone: true } },
    team: { select: { id: true, name: true } },
    process: { select: { name: true } },
    execution: { select: { process: { select: { name: true } } } },
    evidenceRequirements: { select: { id: true, required: true } },
    occurrences: {
      where: { type: "IMPEDIMENT" },
      select: { id: true, reason: true },
      take: 1,
    },
  } as const;

  const assigned = await prisma.task.findMany({
    where: {
      organizationId: member.organizationId,
      deletedAt: null,
      assignments: { some: { memberId: member.id, removedAt: null } },
      OR: [
        { status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] } },
        { status: "COMPLETED", completedAt: { gte: startOfToday } },
      ],
    },
    select: selectFields,
  });

  const memberTeamIds = member.teamMemberships.map((t) => t.teamId);
  const memberLocationIds = member.locationAccesses.map((l) => l.locationId);

  const unassigned = await prisma.task.findMany({
    where: {
      organizationId: member.organizationId,
      deletedAt: null,
      status: { in: ["AVAILABLE", "BLOCKED"] },
      teamId: { in: memberTeamIds },
      locationId: { in: memberLocationIds },
      assignments: { none: { type: "PRIMARY", removedAt: null } },
    },
    select: selectFields,
  });

  const allTasks = [
    ...assigned.map((t) => ({ ...t, isUnassigned: false, timing: taskTiming(t, now) })),
    ...unassigned.map((t) => ({ ...t, isUnassigned: true, timing: taskTiming(t, now) })),
  ];

  const groups: Record<string, any[]> = {
    today: [],
    overdue: [],
    unassigned: [],
    completed: [],
    upcoming: [],
  };

  for (const task of allTasks) {
    if (task.isUnassigned) {
      groups.unassigned.push(task);
      continue;
    }
    if (task.status === "COMPLETED") {
      groups.completed.push(task);
      continue;
    }
    if (task.timing.slaExceeded || (task.deadlineAt && new Date(task.deadlineAt) < now)) {
      groups.overdue.push(task);
      continue;
    }
    const targetDate = task.scheduledDate || task.deadlineAt;
    if (targetDate) {
      const d = new Date(targetDate);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      if (d > todayEnd) {
        groups.upcoming.push(task);
        continue;
      }
    }
    groups.today.push(task);
  }

  for (const [col, tasksInCol] of Object.entries(groups)) {
    console.log(`\n=== COLUMN: ${col.toUpperCase()} (${tasksInCol.length} tasks) ===`);
    for (const t of tasksInCol) {
      console.log(`- [${t.status}] ${t.title}`);
      console.log(`  origin: ${t.origin}, process: ${t.process?.name || t.execution?.process?.name || null}`);
      console.log(`  location: ${t.location?.name}, deadline: ${t.deadlineAt}, scheduled: ${t.scheduledDate}`);
      console.log(`  description: "${t.description?.slice(0, 40)}..."`);
    }
  }
}

main().finally(() => prisma.$disconnect());
