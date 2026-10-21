import { prisma } from '../src/infrastructure/database/prisma';
import { columnFor } from '../src/application/mobile/policy';
import { getTaskDeadlineStatus } from '../src/domain/rules/task-metrics';
import { buildKanbanItems } from '../src/presentation/components/mobile/employee-kanban-board';

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      taskType: true,
      origin: true,
      status: true,
      deadlineAt: true,
      slaDueAt: true,
      scheduledDate: true,
      startedAt: true,
      completedAt: true,
      toleranceMinutes: true,
      executionId: true,
      assignments: {
        where: { removedAt: null },
        select: { memberId: true, type: true }
      },
      execution: {
        select: {
          id: true,
          status: true,
          process: {
            select: { name: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const now = Date.now();

  console.log('=== VERIFYING PROPOSED LOGIC ON DISCREPANCIES ===');
  for (const t of tasks) {
    const isUnassigned = !t.assignments.some(a => a.type === 'PRIMARY');
    const col = columnFor({
      deadlineAt: t.deadlineAt,
      slaDueAt: t.slaDueAt,
      scheduledDate: t.scheduledDate,
      startedAt: t.startedAt,
      toleranceMinutes: t.toleranceMinutes,
      status: t.status,
      isUnassigned,
    }, now);

    const deadlineInfoOld = getTaskDeadlineStatus({
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      slaDueAt: t.slaDueAt ? t.slaDueAt.toISOString() : null,
      toleranceMinutes: t.toleranceMinutes,
      scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
      status: t.status,
    }, now);

    // Proposed new logic
    const tz = 'America/Sao_Paulo';
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
    const scheduledInstant = t.scheduledDate ? t.scheduledDate.getTime() : null;
    const isPastScheduled = scheduledInstant !== null && new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(scheduledInstant)) < todayKey;
    const startedInstant = t.startedAt ? t.startedAt.getTime() : null;
    const isPastStarted = startedInstant !== null && new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startedInstant)) < todayKey;
    
    const d = {
      phase: isPastStarted || (startedInstant && now - startedInstant > 12 * 3600 * 1000) ? 'EXCEEDED' : 'NONE'
    };

    const isOverdue = col === 'overdue' || isPastScheduled || isPastStarted || d.phase === 'EXCEEDED';
    const newLabel = isOverdue ? 'Atrasada' : (t.deadlineAt || t.slaDueAt) ? 'Dentro do prazo' : 'Sem prazo fixo';

    if (col === 'overdue' || t.taskType === 'FORM' || deadlineInfoOld.label !== newLabel) {
      console.log({
        id: t.id,
        title: t.title,
        taskType: t.taskType,
        origin: t.origin,
        col,
        oldLabel: deadlineInfoOld.label,
        newLabel,
      });
    }
  }

  // Also check Process executions
  console.log('=== PROCESS EXECUTIONS ===');
  const executions = await prisma.processExecution.findMany({
    where: {},
    include: {
      process: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          taskType: true,
          origin: true,
          status: true,
          deadlineAt: true,
          slaDueAt: true,
          scheduledDate: true,
          startedAt: true,
          completedAt: true,
          toleranceMinutes: true,
          executionId: true,
          assignments: {
            where: { removedAt: null },
            select: { memberId: true, type: true }
          }
        }
      }
    }
  });

  for (const exec of executions) {
    const pTasks = exec.tasks.map(t => {
      const isUnassigned = !t.assignments.some(a => a.type === 'PRIMARY');
      const col = columnFor({
        deadlineAt: t.deadlineAt,
        slaDueAt: t.slaDueAt,
        scheduledDate: t.scheduledDate,
        startedAt: t.startedAt,
        toleranceMinutes: t.toleranceMinutes,
        status: t.status,
        isUnassigned,
      }, now);
      return {
        ...t,
        isUnassigned,
        col,
        deadlineAt: t.deadlineAt?.toISOString() ?? null,
        slaDueAt: t.slaDueAt?.toISOString() ?? null,
        scheduledDate: t.scheduledDate?.toISOString() ?? null,
        startedAt: t.startedAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        slaExceeded: !!t.slaDueAt && t.slaDueAt.getTime() < now,
        evidenceCount: 0,
        hasRequiredEvidence: false,
        hasImpediment: false,
        delayMinutes: 0,
        timezone: 'America/Sao_Paulo',
        roundId: 'initial',
        priority: 'MEDIUM' as const,
        criticality: 'MEDIUM' as const,
        origin: 'PROCESS',
        locationName: null,
        teamName: null,
        processName: exec.process.name,
        elapsedSeconds: null,
        timerRunning: false,
      };
    });

    const items = buildKanbanItems(pTasks as any, now);
    const procItem = items.find(it => it.type === 'PROCESS');
    if (procItem && procItem.type === 'PROCESS') {
      const columns = procItem.tasks.map(task => columnFor(task, now));
      const active = columns.filter(c => c !== 'completed');
      const column = active.includes('overdue') ? 'overdue' : active.includes('today') ? 'today' : active[0] ?? columns[0] ?? 'today';
      console.log('Process Kanban:', {
        executionId: exec.id,
        processName: exec.process.name,
        column,
        anyOverdue: procItem.anyOverdue,
        allCompleted: procItem.allCompleted,
        isScheduled: procItem.isScheduled,
        hasImpediment: procItem.hasImpediment,
        tasksSummary: procItem.tasks.map(t => ({ id: t.id, title: t.title, status: t.status, col: (t as any).col, deadlineAt: t.deadlineAt, slaDueAt: t.slaDueAt, slaExceeded: t.slaExceeded }))
      });
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
