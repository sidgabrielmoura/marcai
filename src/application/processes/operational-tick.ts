import { lockTask } from "@/application/tasks/task-lock";
import { prisma } from "@/infrastructure/database/prisma";
import { generateRoutineExecution } from "./generate-execution";
import { notifyManagers } from "@/application/tasks/notify-managers";
import { dispatchNotificationAsync } from "@/infrastructure/notifications/notification-service";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { sendScheduledReportEmail } from "@/infrastructure/email";
// Called by a protected scheduler, never as a side effect of viewing a page.
export async function operationalTick(now = new Date()) {
    let generated = 0, releasedCount = 0, alerts = 0, escalationsCount = 0, reportsCount = 0, purgedOrgsCount = 0;
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
                    const released = await tx.processExecution.updateMany({ where: { id: execution.id, organizationId: execution.organizationId, status: "SCHEDULED", availableAt: { lte: now } }, data: { status: "IN_PROGRESS", startedAt: now } });
                    if (!released.count)
                        return false;
                    const tasks = await tx.task.findMany({ where: { executionId: execution.id, organizationId: execution.organizationId, deletedAt: null, status: "AVAILABLE" }, include: { assignments: { where: { removedAt: null, type: "PRIMARY" } } } });
                    for (const task of tasks) {
                        const hasAssignee = task.assignments.length > 0;
                        const effectiveBase = Math.max(execution.availableAt.getTime(), now.getTime());
                        const freshSla = undefined;
                        const freshDeadline = undefined;

                        if (hasAssignee) {
                            await tx.task.update({
                                where: { id: task.id },
                                data: {
                                    status: "IN_PROGRESS",
                                    startedAt: now,
                                    ...(freshDeadline ? { slaDueAt: freshDeadline } : {}),
                                    ...(freshDeadline ? { deadlineAt: freshDeadline } : {}),
                                },
                            });
                            for (const assignment of task.assignments) {
                                await tx.taskExecutionSession.create({ data: { taskId: task.id, memberId: assignment.memberId, startedAt: now } });
                            }
                        } else if (freshSla || freshDeadline) {
                            await tx.task.update({
                                where: { id: task.id },
                                data: {
                                    ...(freshDeadline ? { slaDueAt: freshDeadline } : {}),
                                    ...(freshDeadline ? { deadlineAt: freshDeadline } : {}),
                                },
                            });
                        }
                    }
                    await tx.activityLog.create({ data: { organizationId: execution.organizationId, action: "EXECUTION_STARTED", entityType: "EXECUTION", entityId: execution.id } });
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

    // 2.5. Sincronização periódica de dependências e desbloqueio de tarefas
    try {
        const blockedExecutions = await prisma.task.findMany({
            where: {
                status: "BLOCKED",
                deletedAt: null,
                executionId: { not: null },
                organization: { status: "ACTIVE" },
            },
            select: { organizationId: true, executionId: true },
            distinct: ["executionId"],
            take: 50,
        });

        for (const item of blockedExecutions) {
            if (!item.executionId) continue;
            try {
                await prisma.$transaction(async (tx) => {
                    await synchronizeExecution(tx, item.organizationId, item.executionId, now);
                });
            } catch {
                failures.push({ kind: "synchronize_execution", id: item.executionId });
            }
        }
    } catch {
        failures.push({ kind: "synchronize_execution_query", id: "query" });
    }

    if(process.env.MOBILE_OUTBOX_ENABLED !== "1") {
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
                    const refDate = task.slaDueAt!;
                    const endOfDay = new Date(
                        refDate.getFullYear(),
                        refDate.getMonth(),
                        refDate.getDate(),
                        23,
                        59,
                        59,
                        999
                    );
                    const effectiveNow = now > endOfDay ? endOfDay : now;
                    const minutes = Math.max(0, (effectiveNow.getTime() - task.slaDueAt!.getTime()) / 60000);
                    const settings = task.organization?.settings as {
                        delayMilestones?: number[];
                    } | null;
                    const allMilestones = [0, ...(settings?.delayMilestones ?? [15, 30, 60, 120])]
                        .filter((v) => Number.isFinite(v) && v >= 0)
                        .sort((a, b) => a - b);

                    const existingBreaches = await tx.taskOccurrence.findMany({
                        where: { taskId: task.id, type: "SLA_BREACH" },
                        select: { category: true },
                    });

                    const maxProcessedMilestone = existingBreaches.reduce((max, occ) => {
                        if (occ.category.startsWith("SLA_")) {
                            const val = Number(occ.category.slice(4));
                            return Number.isFinite(val) ? Math.max(max, val) : max;
                        }
                        return max;
                    }, -1);

                    const candidateMilestones = allMilestones.filter(
                        (m) => m > maxProcessedMilestone && m <= minutes
                    );

                    if (candidateMilestones.length > 0) {
                        // Seleciona unicamente o marco mais recente/crítico alcançado, evitando tempestade de notificações
                        const milestone = Math.max(...candidateMilestones);
                        const category = "SLA_" + milestone;
                        const reason = milestone
                            ? `Prazo limite excedido há ${milestone} minutos.`
                            : "O prazo limite foi excedido.";
                        const notifTitle = milestone
                            ? `Prazo excedido há ${milestone} minutos`
                            : "Prazo limite excedido";

                        await tx.taskOccurrence.create({
                            data: {
                                taskId: task.id,
                                type: "SLA_BREACH",
                                category,
                                severity: task.criticality,
                                reason,
                            },
                        });

                        await tx.task.update({
                            where: { id: task.id },
                            data: { slaExceededAt: task.slaDueAt },
                        });

                        await notifyManagers(tx, task, notifTitle, `${task.title} (${reason})`);

                        const assignments = await tx.taskAssignment.findMany({
                            where: { taskId: task.id, removedAt: null },
                            include: { member: { select: { userId: true } } },
                        });

                        const assigneeUserIds: string[] = [];
                        for (const a of assignments) {
                            await tx.notification.create({
                                data: {
                                    organizationId: task.organizationId,
                                    userId: a.member.userId,
                                    type: "TASK_OVERDUE",
                                    priority: task.priority,
                                    title: notifTitle,
                                    message: `${task.title} (${reason})`,
                                    data: { taskId: task.id },
                                },
                            });
                            assigneeUserIds.push(a.member.userId);
                        }

                        if (assigneeUserIds.length > 0) {
                            void dispatchNotificationAsync({
                                organizationId: task.organizationId,
                                userIds: assigneeUserIds,
                                type: "TASK_OVERDUE",
                                priority: task.priority,
                                title: notifTitle,
                                message: `${task.title} (${reason})`,
                                data: { taskId: task.id },
                                clickAction: `/tasks/${task.id}`,
                                forcePush: true,
                            });
                        }

                        await tx.activityLog.create({
                            data: {
                                organizationId: task.organizationId,
                                action: "TASK_OVERDUE",
                                entityType: "TASK",
                                entityId: task.id,
                                metadata: { milestone },
                            },
                        });

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

    // 3.5. Detecção preventiva de tarefas prestes a vencer (TASK_EXPIRING_SOON)
    const warningHorizon = new Date(now.getTime() + 30 * 60000); // Próximos 30 minutos
    let expiringCursor = "";
    while (true) {
        const expiringSoon = await prisma.task.findMany({
            where: {
                id: { gt: expiringCursor },
                deletedAt: null,
                slaDueAt: { gt: now, lte: warningHorizon },
                status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] },
                organization: { status: "ACTIVE" },
            },
            select: { id: true, organizationId: true },
            take: 200,
            orderBy: { id: "asc" },
        });
        if (!expiringSoon.length) break;

        for (const candidate of expiringSoon) {
            try {
                await prisma.$transaction(async (tx) => {
                    await lockTask(tx, candidate.organizationId, candidate.id);
                    const task = await tx.task.findFirst({
                        where: {
                            id: candidate.id,
                            organizationId: candidate.organizationId,
                            deletedAt: null,
                            slaDueAt: { gt: now, lte: warningHorizon },
                            status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] },
                        },
                    });
                    if (!task?.slaDueAt) return;

                    // Deduplicação estrita via activityLog
                    const existingWarning = await tx.activityLog.findFirst({
                        where: { entityId: task.id, action: "TASK_EXPIRING_SOON" },
                    });
                    if (existingWarning) return;

                    const remainingMin = Math.max(1, Math.round((task.slaDueAt.getTime() - now.getTime()) / 60000));

                    await tx.activityLog.create({
                        data: {
                            organizationId: task.organizationId,
                            action: "TASK_EXPIRING_SOON",
                            entityType: "TASK",
                            entityId: task.id,
                            metadata: { remainingMin },
                        },
                    });

                    const assignments = await tx.taskAssignment.findMany({
                        where: { taskId: task.id, removedAt: null },
                        include: { member: { select: { userId: true } } },
                    });
                    const assigneeUserIds = [...new Set(assignments.map((a) => a.member.userId))];

                    for (const userId of assigneeUserIds) {
                        await tx.notification.create({
                            data: {
                                organizationId: task.organizationId,
                                userId,
                                type: "TASK_EXPIRING_SOON",
                                priority: "HIGH",
                                title: "Tarefa próxima do vencimento",
                                message: `A tarefa “${task.title}” vence em ${remainingMin} minutos.`,
                                data: { taskId: task.id },
                            },
                        });
                    }

                    if (assigneeUserIds.length > 0) {
                        void dispatchNotificationAsync({
                            organizationId: task.organizationId,
                            userIds: assigneeUserIds,
                            type: "TASK_EXPIRING_SOON",
                            priority: "HIGH",
                            title: "Tarefa próxima do vencimento",
                            message: `A tarefa “${task.title}” vence em ${remainingMin} minutos.`,
                            data: { taskId: task.id },
                            clickAction: `/tasks/${task.id}`,
                            forcePush: true,
                        });
                    }

                    if (task.criticality === "CRITICAL" || task.priority === "CRITICAL") {
                        await notifyManagers(
                            tx,
                            task,
                            "Tarefa crítica próxima do vencimento",
                            `A tarefa urgente “${task.title}” vence em ${remainingMin} minutos.`,
                            { type: "CRITICAL_TASK_ALERT", priority: "HIGH" }
                        );
                    }

                    alerts++;
                });
            } catch {
                failures.push({ kind: "task_expiring", id: candidate.id });
            }
        }
        expiringCursor = expiringSoon[expiringSoon.length - 1].id;
    }



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

    // 6. Escalação de prazos em fluxos de aprovação (ApprovalStep.deadlineAt)
    try {
        const expiredSteps = await prisma.approvalStep.findMany({
            where: {
                status: "PENDING",
                deadlineAt: { lte: now },
                workflow: {
                    status: "PENDING",
                    task: {
                        status: "SUBMITTED",
                        deletedAt: null,
                        organization: { status: "ACTIVE" },
                    },
                },
            },
            include: {
                workflow: {
                    include: {
                        task: {
                            include: {
                                assignments: {
                                    where: { removedAt: null },
                                    include: { member: { select: { userId: true } } },
                                },
                            },
                        },
                    },
                },
            },
            take: 100,
        });

        for (const step of expiredSteps) {
            try {
                const task = step.workflow.task;
                await prisma.$transaction(async (tx) => {
                    const alreadyEscalated = await tx.activityLog.findFirst({
                        where: {
                            entityId: step.id,
                            action: "APPROVAL_DEADLINE_EXCEEDED",
                        },
                    });
                    if (alreadyEscalated) return;

                    await tx.activityLog.create({
                        data: {
                            organizationId: task.organizationId,
                            action: "APPROVAL_DEADLINE_EXCEEDED",
                            entityType: "APPROVAL_STEP",
                            entityId: step.id,
                            metadata: {
                                taskId: task.id,
                                stepSequence: step.sequence,
                                deadlineAt: step.deadlineAt?.toISOString(),
                            },
                        },
                    });

                    // Se houver aprovador substituto configurado (fallback), avisa diretamente
                    if (step.fallbackMemberId) {
                        const fallbackMember = await tx.organizationMember.findFirst({
                            where: { id: step.fallbackMemberId, status: "ACTIVE" },
                            select: { userId: true },
                        });
                        if (fallbackMember?.userId) {
                            await tx.notification.create({
                                data: {
                                    organizationId: task.organizationId,
                                    userId: fallbackMember.userId,
                                    type: "APPROVAL_REQUESTED",
                                    priority: "HIGH",
                                    title: "Aprovação pendente (Substituto)",
                                    message: `A tarefa “${task.title}” expirou o prazo do titular e aguarda sua aprovação.`,
                                    data: { taskId: task.id, stepId: step.id },
                                },
                            });

                            void dispatchNotificationAsync({
                                organizationId: task.organizationId,
                                userIds: [fallbackMember.userId],
                                type: "APPROVAL_REQUESTED",
                                priority: "HIGH",
                                title: "Aprovação pendente (Substituto)",
                                message: `A tarefa “${task.title}” expirou o prazo do titular e aguarda sua aprovação.`,
                                data: { taskId: task.id, stepId: step.id },
                                clickAction: `/tasks/${task.id}`,
                                forcePush: true,
                            });
                        }
                    }

                    await notifyManagers(
                        tx,
                        task,
                        "Prazo de aprovação expirado",
                        `A aprovação da tarefa “${task.title}” (etapa ${step.sequence}) excedeu o prazo limite.`,
                        { type: "APPROVAL_OVERDUE", priority: "HIGH" }
                    );

                    escalationsCount++;
                });
            } catch {
                failures.push({ kind: "approval_escalation", id: step.id });
            }
        }
    } catch {
        failures.push({ kind: "approval_escalation_query", id: "query" });
    }

    // 7. Processamento e avanço de relatórios agendados (ScheduledReport)
    try {
        const dueReports = await prisma.scheduledReport.findMany({
            where: {
                status: "ACTIVE",
                nextRunAt: { lte: now },
                organization: { status: "ACTIVE" },
            },
            take: 50,
        });

        for (const report of dueReports) {
            try {
                const nextDate = new Date(now.getTime() + (report.frequency === "WEEKLY" ? 7 : 30) * 86400000);
                await prisma.scheduledReport.update({
                    where: { id: report.id },
                    data: {
                        lastRunAt: now,
                        nextRunAt: nextDate,
                    },
                });

                await prisma.activityLog.create({
                    data: {
                        organizationId: report.organizationId,
                        action: "SCHEDULED_REPORT_EXECUTED",
                        entityType: "REPORT",
                        entityId: report.id,
                        metadata: {
                            name: report.name,
                            frequency: report.frequency,
                            recipients: report.recipients,
                            executedAt: now.toISOString(),
                            nextRunAt: nextDate.toISOString(),
                        },
                    },
                });
                const recipients = report.recipients
                    .split(",")
                    .map((e) => e.trim())
                    .filter(Boolean);

                if (recipients.length > 0) {
                    const org = await prisma.organization.findUnique({
                        where: { id: report.organizationId },
                        select: { name: true },
                    });

                    const origin =
                        process.env.NEXT_PUBLIC_APP_URL ||
                        process.env.APP_URL ||
                        "http://localhost:3000";

                    void sendScheduledReportEmail(recipients, {
                        orgName: org?.name || "Marcai",
                        reportName: report.name,
                        frequency: report.frequency,
                        format: report.format,
                        periodLabel:
                            report.frequency === "WEEKLY"
                                ? "Últimos 7 dias"
                                : "Últimos 30 dias",
                        downloadUrl: `${origin}/management/reports`,
                    });
                }

                reportsCount++;
            } catch {
                failures.push({ kind: "scheduled_report", id: report.id });
            }
        }
    } catch {
        failures.push({ kind: "scheduled_reports_query", id: "query" });
    }

    // O expurgo de retenção e lixeira agora é gerenciado por rotas dedicadas de cron-job:
    // /api/jobs/retention/history (de 6 em 6 meses) e /api/jobs/retention/trash (mensal).

    return {
        generated,
        released: releasedCount,
        alerts,
        escalations: escalationsCount,
        reports: reportsCount,
        purgedOrganizations: purgedOrgsCount,
        failures,
    };
}
