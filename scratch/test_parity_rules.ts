import { prisma } from '../src/infrastructure/database/prisma';
import { boardState, processBadge, columnFor, taskBadge, deadline } from '../src/domain/rules/employee-workflow';

async function main() {
  const executions = await prisma.processExecution.findMany({
    include: {
      process: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        include: {
          assignments: { where: { removedAt: null }, select: { memberId: true, type: true } },
          dependencies: true,
        }
      }
    }
  });

  const now = Date.now();
  console.log(`Current time: ${new Date(now).toISOString()}`);

  for (const exec of executions) {
    const pTasks = exec.tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      deadlineAt: t.deadlineAt,
      slaDueAt: t.slaDueAt,
      scheduledDate: t.scheduledDate,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      toleranceMinutes: t.toleranceMinutes,
      maxDuration: t.maxDuration,
      isUnassigned: !t.assignments.some(a => a.type === 'PRIMARY'),
      managementBlocked: (t as any).managementBlocked ?? false,
      dependencies: t.dependencies.map(d => ({ type: d.type, logic: d.logic, satisfied: false })),
    }));

    const summary = boardState(pTasks, now);
    const badge = processBadge(summary);

    if (summary.column === 'overdue' || summary.anyOverdue) {
      console.log('Overdue Process:', {
        executionId: exec.id,
        processName: exec.process.name,
        column: summary.column,
        attention: summary.attention,
        anyOverdue: summary.anyOverdue,
        badgeLabel: badge.label,
        badgeVariant: badge.variant,
        tasks: pTasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          col: columnFor(t, now),
          taskBadge: taskBadge(t, now),
        }))
      });
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
