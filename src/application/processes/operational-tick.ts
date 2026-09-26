import { lockTask } from "@/application/tasks/task-lock";
import { prisma } from "@/infrastructure/database/prisma";
import { generateRoutineExecution } from "./generate-execution";
import { notifyManagers } from "@/application/tasks/notify-managers";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
// Called by a protected scheduler, never as a side effect of viewing a page.
export async function operationalTick(now = new Date()) {
    let generated = 0, releasedCount = 0, alerts = 0;
    const failures: {
        kind: string;
        id: string;
    }[] = [];
    let routineCursor = "";
    while (true) {
        const routines = await prisma.routine.findMany({ where: { id: { gt: routineCursor }, status: "ACTIVE", process: { status: "ACTIVE", organization: { status: "ACTIVE" } } }, include: { process: { include: { organization: true } } }, take: 200, orderBy: { id: "asc" } });
        if (!routines.length)
            break;
        for (const routine of routines) {
            try {
                const result = await generateRoutineExecution(routine.id, { userId: "", userName: "Agendador", userEmail: null, memberId: "", role: "OWNER", organizationId: routine.process.organizationId, organizationName: routine.process.organization.name, organizationSlug: routine.process.organization.slug }, now, true);
                if (result.success && result.generated)
                    generated++;
            }
            catch {
                failures.push({ kind: "routine", id: routine.id });
            }
        }
        routineCursor = routines[routines.length - 1].id;
    }
    let executionCursor = "";
    while (true) {
        const due = await prisma.processExecution.findMany({ where: { id: { gt: executionCursor }, status: "SCHEDULED", availableAt: { lte: now }, organization: { status: "ACTIVE" } }, take: 500, orderBy: { id: "asc" } });
        if (!due.length)
            break;
        for (const execution of due) {
            try {
                const released = await prisma.$transaction(async (tx) => {
                    await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${"execution:" + execution.id}))`;
                    const released = await tx.processExecution.updateMany({ where: { id: execution.id, organizationId: execution.organizationId, status: "SCHEDULED", availableAt: { lte: now } }, data: { status: "AVAILABLE" } });
                    if (!released.count)
                        return false;
                    const tasks = await tx.task.findMany({ where: { executionId: execution.id, organizationId: execution.organizationId, deletedAt: null, status: "AVAILABLE", slaDueAt: null, slaStartEvent: "ON_AVAILABLE" } });
                    for (const task of tasks)
                        if (task.slaDurationMinutes)
                            await tx.task.update({ where: { id: task.id }, data: { slaDueAt: new Date(execution.availableAt.getTime() + task.slaDurationMinutes * 60000) } });
                    await tx.activityLog.create({ data: { organizationId: execution.organizationId, action: "EXECUTION_AVAILABLE", entityType: "EXECUTION", entityId: execution.id } });
                    await synchronizeExecution(tx, execution.organizationId, execution.id, now);
                    return true;
                });
                if (released)
                    releasedCount++;
            }
            catch {
                failures.push({ kind: "execution", id: execution.id });
            }
        }
        executionCursor = due[due.length - 1].id;
    }
    let taskCursor = "";
    while (true) {
        const overdue = await prisma.task.findMany({ where: { id: { gt: taskCursor }, deletedAt: null, slaDueAt: { lt: now }, status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] }, organization: { status: "ACTIVE" } }, select: { id: true, organizationId: true }, take: 500, orderBy: { id: "asc" } });
        if (!overdue.length)
            break;
        for (const candidate of overdue) {
            try {
                const newAlerts = await prisma.$transaction(async (tx) => {
                    let count = 0;
                    await lockTask(tx, candidate.organizationId, candidate.id);
                    const task = await tx.task.findFirst({ where: { id: candidate.id, organizationId: candidate.organizationId, deletedAt: null, slaDueAt: { lt: now }, status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] }, organization: { status: "ACTIVE" } }, include: { organization: { select: { settings: true } } } });
                    if (!task?.slaDueAt)
                        return 0;
                    const settings = task.organization.settings as {
                        delayMilestones?: number[];
                    } | null;
                    const minutes = (now.getTime() - task.slaDueAt!.getTime()) / 60000;
                    for (const milestone of [0, ...(settings?.delayMilestones ?? [15, 30, 60, 120])].filter(v => Number.isFinite(v) && v >= 0 && v <= minutes)) {
                        const category = "SLA_" + milestone;
                        if (await tx.taskOccurrence.findFirst({ where: { taskId: task.id, type: "SLA_BREACH", category } }))
                            continue;
                        await tx.taskOccurrence.create({ data: { taskId: task.id, type: "SLA_BREACH", category, severity: task.criticality, reason: milestone ? "SLA excedido há " + milestone + " minutos." : "O prazo de SLA foi excedido." } });
                        await tx.task.update({ where: { id: task.id }, data: { slaExceededAt: task.slaDueAt } });
                        await notifyManagers(tx, task, "Prazo de SLA excedido", task.title);
                        const assignments = await tx.taskAssignment.findMany({ where: { taskId: task.id, removedAt: null }, include: { member: { select: { userId: true } } } });
                        for (const a of assignments)
                            await tx.notification.create({ data: { organizationId: task.organizationId, userId: a.member.userId, type: "TASK_OVERDUE", priority: task.priority, title: "Prazo de SLA excedido", message: task.title, data: { taskId: task.id } } });
                        await tx.activityLog.create({ data: { organizationId: task.organizationId, action: "TASK_OVERDUE", entityType: "TASK", entityId: task.id, metadata: { milestone } } });
                        count++;
                    }
                    return count;
                });
                alerts += newAlerts;
            }
            catch {
                failures.push({ kind: "task", id: candidate.id });
            }
        }
        taskCursor = overdue[overdue.length - 1].id;
    }

    // 4. Detecção de pausas prolongadas com emissão de PAUSE_ALERT (Item 20)
    let pauseCursor = "";
    while (true) {
        const pausedTasks = await prisma.task.findMany({
            where: {
                id: { gt: pauseCursor },
                status: "PAUSED",
                deletedAt: null,
                organization: { status: "ACTIVE" },
            },
            include: {
                sessions: {
                    include: {
                        pauses: {
                            where: { endedAt: null },
                            orderBy: { startedAt: "desc" },
                            take: 1,
                        },
                    },
                },
                organization: { select: { settings: true } },
            },
            take: 200,
            orderBy: { id: "asc" },
        });

        if (!pausedTasks.length) break;

        for (const task of pausedTasks) {
            try {
                const activePause = task.sessions.flatMap(s => s.pauses).find(p => !p.endedAt);
                if (!activePause) continue;

                const settings = (task.organization.settings as Record<string, any>) || {};
                const maxPause = settings.maxPauseDurationMinutes ?? 30;
                const minutesPaused = Math.floor((now.getTime() - activePause.startedAt.getTime()) / 60000);

                if (minutesPaused >= maxPause) {
                    await prisma.$transaction(async (tx) => {
                        await lockTask(tx, task.organizationId, task.id);
                        const existing = await tx.taskOccurrence.findFirst({
                            where: { taskId: task.id, type: "PAUSE_ALERT", category: "LONG_PAUSE" },
                        });
                        if (existing) return;

                        await tx.taskOccurrence.create({
                            data: {
                                taskId: task.id,
                                type: "PAUSE_ALERT",
                                category: "LONG_PAUSE",
                                severity: "MEDIUM",
                                reason: `A tarefa está pausada há ${minutesPaused} minutos (limite: ${maxPause} min).`,
                            },
                        });

                        await notifyManagers(tx, task, "Pausa prolongada", `A tarefa “${task.title}” está pausada há ${minutesPaused} minutos.`);
                        alerts++;
                    });
                }
            } catch {
                failures.push({ kind: "pause", id: task.id });
            }
        }

        pauseCursor = pausedTasks[pausedTasks.length - 1].id;
    }

    // 5. Alerta de tarefas sem responsável aguardando além do tempo limite (Item 17)
    let unassignedCursor = "";
    while (true) {
        const unassignedTasks = await prisma.task.findMany({
            where: {
                id: { gt: unassignedCursor },
                status: "AVAILABLE",
                deletedAt: null,
                assignments: { none: { removedAt: null } },
                createdAt: { lte: new Date(now.getTime() - 15 * 60000) },
                organization: { status: "ACTIVE" },
            },
            take: 200,
            orderBy: { id: "asc" },
        });

        if (!unassignedTasks.length) break;

        for (const task of unassignedTasks) {
            try {
                await prisma.$transaction(async (tx) => {
                    await lockTask(tx, task.organizationId, task.id);
                    const existing = await tx.taskOccurrence.findFirst({
                        where: { taskId: task.id, type: "IMPEDIMENT", category: "UNASSIGNED_TIMEOUT" },
                    });
                    if (existing) return;

                    await tx.taskOccurrence.create({
                        data: {
                            taskId: task.id,
                            type: "IMPEDIMENT",
                            category: "UNASSIGNED_TIMEOUT",
                            severity: task.criticality,
                            reason: "Tarefa disponível há mais de 15 minutos sem nenhum responsável atribuído.",
                        },
                    });

                    await notifyManagers(tx, task, "Tarefa sem responsável", `A tarefa “${task.title}” aguarda atribuição na unidade.`);
                    alerts++;
                });
            } catch {
                failures.push({ kind: "unassigned", id: task.id });
            }
        }

        unassignedCursor = unassignedTasks[unassignedTasks.length - 1].id;
    }

    return { generated, released: releasedCount, alerts, failures };
}
