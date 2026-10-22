import { lockTask } from "@/application/tasks/task-lock";
import { prisma } from "@/infrastructure/database/prisma";
import { generateRoutineExecution, routineScheduledAt } from "./generate-execution";
import { canGenerateExecutionForRoutine } from "@/domain/rules/routine-generator";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { pendingSlaMilestone } from "@/domain/rules/operational-work";
import { recordWorkFailure, retryStates, clearWorkFailure } from "@/application/jobs/scheduled-job";
import { notifyManagers } from "@/application/tasks/notify-managers";
import { dispatchNotificationAsync } from "@/infrastructure/notifications/notification-service";
import { synchronizeExecution } from "@/application/tasks/synchronize-execution";
import { sendScheduledReportEmail } from "@/infrastructure/email";
// Called by a protected scheduler, never as a side effect of viewing a page.
export async function operationalTick(now = new Date()) {
    const stopAt = Date.now() + 45_000;
    let generated = 0, releasedCount = 0, alerts = 0, escalationsCount = 0, reportsCount = 0, purgedOrgsCount = 0;
    const failures: {
        kind: string;
        id: string;
    }[] = [];
    let routineCursor = "";
    while (Date.now() < stopAt) {
        const routines = await prisma.routine.findMany({ where: { id: { gt: routineCursor }, status: "ACTIVE", process: { status: "ACTIVE", organization: { status: "ACTIVE" } }, executions: { none: { scheduledAt: { gt: now } } } }, include: { process: { select: { organizationId: true, updatedAt: true, validFrom: true, validUntil: true, organization: { select: { name: true, slug: true } } } }, executions: { orderBy: { scheduledAt: "desc" }, take: 1, select: { id: true, status: true, scheduledAt: true } } }, take: 200, orderBy: { id: "asc" } });
        if (!routines.length)
            break;
        const retries = await retryStates(routines.map(r => 'routine:'+r.id));
        for (const routine of routines) {
            if (Date.now() >= stopAt) break;
            const key='routine:'+routine.id;
            const retry = retries.get(key);
            if ((retry?.nextAttemptAt?.getTime() ?? 0) > Date.now() && routine.updatedAt <= retry!.updatedAt && routine.process.updatedAt <= retry!.updatedAt) continue;
            if (!canGenerateExecutionForRoutine(routine.pendingPreviousPolicy, routine.executions[0], now).shouldGenerate) continue;
            const scheduledAt=routineScheduledAt(routine,routine.executions[0],now,true);
            if (!scheduledAt || scheduledAt.getTime()>now.getTime()+routine.generationLeadTime*60000) continue;
            try {
                const result = await generateRoutineExecution(routine.id, { userId: "", userName: "Agendador", userEmail: null, memberId: "", role: "OWNER", organizationId: routine.process.organizationId, organizationName: routine.process.organization.name, organizationSlug: routine.process.organization.slug }, now, true);
                if (result.success && result.generated)
                    generated++;
                if (result.error) { failures.push({kind:'routine',id:routine.id}); await recordWorkFailure(key); }
                else if (retries.has(key)) await clearWorkFailure(key);
            }
            catch {
                failures.push({ kind: "routine", id: routine.id });
                await recordWorkFailure(key);
            }
        }
        routineCursor = routines[routines.length - 1].id;
    }
    let executionCursor = "";
    while (Date.now() < stopAt) {
        const due = await prisma.processExecution.findMany({ where: { id: { gt: executionCursor }, status: "SCHEDULED", availableAt: { lte: now }, organization: { status: "ACTIVE" } }, select: { id: true, organizationId: true, availableAt: true }, take: 500, orderBy: { id: "asc" } });
        if (!due.length)
            break;
        for (const execution of due) {
            if (Date.now() >= stopAt) break;
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
        const previous = await prisma.scheduledJobState.findUnique({ where: { name: 'operational:blocked-cursor' }, select: { cursor: true } });
        const blockedExecutions = await prisma.task.findMany({
            where: {
                id: { gt: previous?.cursor ?? '' },
                status: "BLOCKED",
                managementBlocked: false,
                deletedAt: null,
                executionId: { not: null },
                organization: { status: "ACTIVE" },
                dependencies: { some: { type: { in: ["BLOCKING", "APPROVAL_CONDITION"] } } },
            },
            select: { id: true, organizationId: true, executionId: true, dependencies: { select: { dependsOnId: true, type: true, logic: true, dependsOnTask: { select: { status: true, approvalWorkflow: { select: { status: true } } } } } } },
            orderBy: { id: 'asc' },
            take: 200,
        });

        const synchronized = new Set<string>();
        let lastBlockedId = previous?.cursor ?? '';
        for (const item of blockedExecutions) {
            if (Date.now() >= stopAt) break;
            lastBlockedId = item.id;
            if (!item.executionId) continue;
            if (synchronized.has(item.executionId) || evaluateTaskDependencies(item.dependencies.map(d => ({dependsOnTaskId:d.dependsOnId,dependsOnStatus:d.dependsOnTask.status,dependsOnApprovalStatus:d.dependsOnTask.approvalWorkflow?.status,type:d.type,logic:d.logic}))).isBlocked) continue;
            synchronized.add(item.executionId);
            try {
                await prisma.$transaction(async (tx) => {
                    await synchronizeExecution(tx, item.organizationId, item.executionId, now);
                });
            } catch {
                failures.push({ kind: "synchronize_execution", id: item.executionId });
            }
        }
        if (blockedExecutions.length || previous?.cursor) await prisma.scheduledJobState.upsert({where:{name:'operational:blocked-cursor'},create:{name:'operational:blocked-cursor',cursor:lastBlockedId},update:{cursor:blockedExecutions.length?lastBlockedId:''}});
    } catch {
        failures.push({ kind: "synchronize_execution_query", id: "query" });
    }

    if(process.env.MOBILE_OUTBOX_ENABLED !== "1") {
    let taskCursor = "";
    while (Date.now() < stopAt) {
        const overdue = await prisma.task.findMany({ where: { id: { gt: taskCursor }, deletedAt: null, slaDueAt: { lt: now }, status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] }, organization: { status: "ACTIVE" } }, select: { id: true, organizationId: true, slaDueAt: true, updatedAt:true, organization: { select: { settings: true } } }, take: 500, orderBy: { id: "asc" } });
        if (!overdue.length)
            break;
        const breaches = await prisma.taskOccurrence.findMany({where:{taskId:{in:overdue.map(t=>t.id)},type:'SLA_BREACH'},select:{taskId:true,category:true}});
        const breachesByTask = new Map<string,string[]>();
        const taskRetries = await retryStates(overdue.map(t=>'sla:'+t.id));
        for (const breach of breaches) breachesByTask.set(breach.taskId,[...(breachesByTask.get(breach.taskId)??[]),breach.category]);
        for (const candidate of overdue) {
            if (Date.now() >= stopAt) break;
            if (!candidate.slaDueAt || pendingSlaMilestone(candidate.slaDueAt,candidate.organization.settings,breachesByTask.get(candidate.id)??[],now)===null) continue;
            const retry = taskRetries.get('sla:'+candidate.id);
            if ((retry?.nextAttemptAt?.getTime()??0)>Date.now() && candidate.updatedAt<=retry!.updatedAt) continue;
            try {
                const newAlerts = await prisma.$transaction(async (tx) => {
                    let count = 0;
                    await lockTask(tx, candidate.organizationId, candidate.id);
                    const task = await tx.task.findFirst({ where: { id: candidate.id, organizationId: candidate.organizationId, deletedAt: null, slaDueAt: { lt: now }, status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] }, organization: { status: "ACTIVE" } }, include: { organization: { select: { settings: true } } } });
                    if (!task?.slaDueAt)
                        return 0;
                    const existingBreaches = await tx.taskOccurrence.findMany({
                        where: { taskId: task.id, type: "SLA_BREACH" },
                        select: { category: true },
                    });

                    const milestone = pendingSlaMilestone(task.slaDueAt, task.organization.settings, existingBreaches.map(b=>b.category), now);
                    if (milestone !== null) {
                        // Seleciona unicamente o marco mais recente/crítico alcançado, evitando tempestade de notificações
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
                if (taskRetries.has('sla:'+candidate.id)) await clearWorkFailure('sla:'+candidate.id);
            }
            catch {
                failures.push({ kind: "task", id: candidate.id });
                await recordWorkFailure('sla:'+candidate.id);
            }
        }
        taskCursor = overdue[overdue.length - 1].id;
    }

    // 3.5. Detecção preventiva de tarefas prestes a vencer (TASK_EXPIRING_SOON)
    const warningHorizon = new Date(now.getTime() + 30 * 60000); // Próximos 30 minutos
    let expiringCursor = "";
    while (Date.now() < stopAt) {
        const expiringSoon = await prisma.task.findMany({
            where: {
                id: { gt: expiringCursor },
                deletedAt: null,
                slaDueAt: { gt: now, lte: warningHorizon },
                status: { in: ["AVAILABLE", "IN_PROGRESS", "PAUSED", "SUBMITTED", "NEEDS_CORRECTION"] },
                organization: { status: "ACTIVE" },
            },
            select: { id: true, organizationId: true, updatedAt: true },
            take: 200,
            orderBy: { id: "asc" },
        });
        if (!expiringSoon.length) break;

        const warned = new Set((await prisma.activityLog.findMany({where:{entityId:{in:expiringSoon.map(t=>t.id)},action:'TASK_EXPIRING_SOON'},select:{entityId:true},distinct:['entityId']})).map(row=>row.entityId));
        const warningRetries = await retryStates(expiringSoon.map(t=>'warning:'+t.id));
        for (const candidate of expiringSoon) {
            if (Date.now() >= stopAt) break;
            if (warned.has(candidate.id)) continue;
            const retry = warningRetries.get('warning:'+candidate.id);
            if ((retry?.nextAttemptAt?.getTime()??0)>Date.now() && candidate.updatedAt<=retry!.updatedAt) continue;
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
                if (warningRetries.has('warning:'+candidate.id)) await clearWorkFailure('warning:'+candidate.id);
            } catch {
                failures.push({ kind: "task_expiring", id: candidate.id });
                await recordWorkFailure('warning:'+candidate.id);
            }
        }
        expiringCursor = expiringSoon[expiringSoon.length - 1].id;
    }



    }
    // 5. Alerta de tarefas sem responsável aguardando além do tempo limite (Item 17)
    let unassignedCursor = "";
    while (Date.now() < stopAt) {
        const unassignedTasks = await prisma.task.findMany({
            where: {
                id: { gt: unassignedCursor },
                status: "AVAILABLE",
                deletedAt: null,
                assignments: { none: { removedAt: null } },
                occurrences: { none: { type: "IMPEDIMENT", category: "UNASSIGNED_TIMEOUT" } },
                createdAt: { lte: new Date(now.getTime() - 15 * 60000) },
                organization: { status: "ACTIVE" },
            },
            take: 200,
            orderBy: { id: "asc" },
            select: { id:true,organizationId:true,locationId:true,teamId:true,title:true,criticality:true,updatedAt:true },
        });

        if (!unassignedTasks.length) break;

        const assignmentRetries = await retryStates(unassignedTasks.map(t=>'unassigned:'+t.id));
        for (const task of unassignedTasks) {
            if (Date.now() >= stopAt) break;
            const retry = assignmentRetries.get('unassigned:'+task.id);
            if ((retry?.nextAttemptAt?.getTime()??0)>Date.now() && task.updatedAt<=retry!.updatedAt) continue;
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
                if (assignmentRetries.has('unassigned:'+task.id)) await clearWorkFailure('unassigned:'+task.id);
            } catch {
                failures.push({ kind: "unassigned", id: task.id });
                await recordWorkFailure('unassigned:'+task.id);
            }
        }

        unassignedCursor = unassignedTasks[unassignedTasks.length - 1].id;
    }

    // 6. Escalação de prazos em fluxos de aprovação (ApprovalStep.deadlineAt)
    try {
        // Filter already-escalated/backed-off rows before LIMIT so they cannot
        // permanently occupy the first batch and starve subsequent approvals.
        const approvalIds = Date.now() >= stopAt ? [] : await prisma.$queryRaw<Array<{id:string}>>`
          SELECT s.id FROM approval_steps s JOIN approval_workflows w ON w.id=s."workflowId"
          JOIN tasks t ON t.id=w."taskId" JOIN organizations o ON o.id=t."organizationId"
          WHERE s.status='PENDING' AND s."deadlineAt"<=${now} AND w.status='PENDING'
          AND t.status='SUBMITTED' AND t."deletedAt" IS NULL AND o.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM activity_logs l WHERE l."entityId"=s.id AND l.action='APPROVAL_DEADLINE_EXCEEDED')
          AND NOT EXISTS(SELECT 1 FROM scheduled_job_states r WHERE r.name='retry:approval:'||s.id AND r."nextAttemptAt">now())
          ORDER BY s."deadlineAt",s.id LIMIT 100`;
        const expiredSteps = await prisma.approvalStep.findMany({
            where: {
                id: { in: approvalIds.map(row=>row.id) },
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
                workflow: { select: { task: { select: { id:true,organizationId:true,locationId:true,teamId:true,title:true,priority:true } } } },
            },
            take: 100,
        });

        for (const step of expiredSteps) {
            if (Date.now() >= stopAt) break;
            try {
                const task = step.workflow.task;
                await prisma.$transaction(async (tx) => {
                    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'approval:'+step.id}))`;
                    const stillPending = await tx.approvalStep.findFirst({where:{id:step.id,status:'PENDING',deadlineAt:{lte:now},workflow:{status:'PENDING',task:{status:'SUBMITTED',deletedAt:null,organization:{status:'ACTIVE'}}}},select:{id:true}});
                    if (!stillPending) return;
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
                            where: { id: step.fallbackMemberId, organizationId: task.organizationId, status: "ACTIVE", user: { status: "ACTIVE" } },
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
                await clearWorkFailure('approval:'+step.id);
            } catch {
                failures.push({ kind: "approval_escalation", id: step.id });
                await recordWorkFailure('approval:'+step.id);
            }
        }
    } catch {
        failures.push({ kind: "approval_escalation_query", id: "query" });
    }

    // 7. Processamento e avanço de relatórios agendados (ScheduledReport)
    try {
        const reportIds = Date.now() >= stopAt ? [] : await prisma.$queryRaw<Array<{id:string}>>`
          SELECT r.id FROM scheduled_reports r JOIN organizations o ON o.id=r."organizationId"
          WHERE r.status='ACTIVE' AND r."nextRunAt"<=${now} AND o.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM scheduled_job_states retry WHERE retry.name='retry:report:'||r.id AND retry."nextAttemptAt">now())
          ORDER BY r."nextRunAt",r.id LIMIT 50`;
        const dueReports = await prisma.scheduledReport.findMany({
            where: {
                id: { in: reportIds.map(row=>row.id) },
                status: "ACTIVE",
                nextRunAt: { lte: now },
                organization: { status: "ACTIVE" },
            },
            take: 50,
        });

        for (const report of dueReports) {
            if (Date.now() >= stopAt) break;
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
                await clearWorkFailure('report:'+report.id);
            } catch {
                failures.push({ kind: "scheduled_report", id: report.id });
                await recordWorkFailure('report:'+report.id);
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
        budgetExhausted: Date.now() >= stopAt,
    };
}
