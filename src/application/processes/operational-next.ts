import { prisma } from '@/infrastructure/database/prisma';
import { retryStates } from '@/application/jobs/scheduled-job';
import { pendingSlaMilestone } from '@/domain/rules/operational-work';
import type { OperationalPhase } from './operational-phases';
const activeStatuses = ['AVAILABLE', 'IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'NEEDS_CORRECTION'] as const;
type TickProgress = {
    nextRoutineAt: Date | null;
    routineMore: boolean;
    dependencyMore: boolean;
    incomplete: boolean;
};
export type NextOperationalRun = {
    at: Date;
    complete: boolean;
};
// Keep this policy aligned with pendingSlaMilestone, including the local day cutoff.
export function nextTaskSlaAt(due: Date, settings: unknown, categories: string[], now: Date): Date | null {
    if (pendingSlaMilestone(due, settings, categories, now) !== null)
        return new Date(Math.max(now.getTime(), due.getTime() + 1));
    const raw = (settings as {
        delayMilestones?: unknown;
    } | null)?.delayMilestones;
    const milestones = [0, ...(Array.isArray(raw) ? raw : [15, 30, 60, 120])]
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
    const processed = categories.reduce((max, c) => {
        const n = c.startsWith('SLA_') ? Number(c.slice(4)) : NaN;
        return Number.isFinite(n) ? Math.max(max, n) : max;
    }, -1);
    const cutoff = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999).getTime();
    const times = milestones.filter(n => n > processed).map(n => due.getTime() + n * 60000 + (n === 0 ? 1 : 0))
        .filter(t => t > now.getTime() && t <= cutoff);
    return times.length ? new Date(Math.min(...times)) : null;
}
export async function nextOperationalRun(organizationId: string, phase: OperationalPhase, now: Date, reconcileAt: Date, progress: TickProgress, stopAt: number): Promise<NextOperationalRun> {
    if (progress.incomplete || Date.now() >= stopAt)
        return { at: new Date(now.getTime() + 60000), complete: false };
    let at = reconcileAt;
    const consider = (date: Date | null | undefined) => { if (date && date < at)
        at = date; };
    if (phase === 'ROUTINES') {
        consider(progress.nextRoutineAt);
        return { at: progress.routineMore ? new Date(now.getTime() + 1000) : at, complete: !progress.routineMore };
    }
    if (phase === 'EXECUTIONS') {
        const row = await prisma.processExecution.findFirst({ where: { organizationId, status: 'SCHEDULED', process: { status: 'ACTIVE' } }, orderBy: { availableAt: 'asc' }, select: { availableAt: true } });
        consider(row?.availableAt);
    }
    else if (phase === 'DEPENDENCIES') {
        if (progress.dependencyMore)
            return { at: new Date(now.getTime() + 1000), complete: false };
        // Eligibility can change with time alone, without another write to signal it.
        const access = await prisma.memberLocationAccess.findFirst({ where: { member: { organizationId, status: 'ACTIVE' }, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { startsAt: true } });
        consider(access?.startsAt);
    }
    else if (phase === 'APPROVALS') {
        const [row] = await prisma.$queryRaw<Array<{
            at: Date | null;
        }>> `
      SELECT min(GREATEST(s."deadlineAt", COALESCE(r."nextAttemptAt", s."deadlineAt"))) AS at
      FROM approval_steps s JOIN approval_workflows w ON w.id=s."workflowId"
      JOIN tasks t ON t.id=w."taskId" LEFT JOIN scheduled_job_states r ON r.name='retry:approval:'||s.id
      WHERE t."organizationId"=${organizationId} AND t.status='SUBMITTED' AND t."deletedAt" IS NULL
      AND s.status='PENDING' AND w.status='PENDING' AND s."deadlineAt" IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM activity_logs l WHERE l."entityId"=s.id AND l.action='APPROVAL_DEADLINE_EXCEEDED')`;
        consider(row?.at);
    }
    else if (phase === 'REPORTS') {
        const [row] = await prisma.$queryRaw<Array<{
            at: Date | null;
        }>> `
      SELECT min(GREATEST(s."nextRunAt", COALESCE(r."nextAttemptAt",s."nextRunAt"))) AS at
      FROM scheduled_reports s LEFT JOIN scheduled_job_states r ON r.name='retry:report:'||s.id
      WHERE s."organizationId"=${organizationId} AND s.status='ACTIVE' AND s."nextRunAt" IS NOT NULL`;
        consider(row?.at);
    }
    else if (phase === 'TASKS') {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
        let cursor = '';
        while (Date.now() < stopAt) {
            const tasks = await prisma.task.findMany({ where: { organizationId, id: { gt: cursor }, deletedAt: null, status: { in: [...activeStatuses] } },
                orderBy: { id: 'asc' }, take: 500, select: { id: true, status: true, slaDueAt: true, createdAt: true, updatedAt: true,
                    assignments: { where: { removedAt: null }, take: 1, select: { id: true } },
                    occurrences: { where: { OR: [{ type: 'SLA_BREACH' }, { type: 'IMPEDIMENT', category: 'UNASSIGNED_TIMEOUT' }] }, select: { type: true, category: true } } } });
            if (!tasks.length)
                return { at, complete: true };
            const slaEnabled = process.env.MOBILE_OUTBOX_ENABLED !== '1';
            const warned = slaEnabled ? new Set((await prisma.activityLog.findMany({ where: { organizationId, entityId: { in: tasks.map(t => t.id) }, action: 'TASK_EXPIRING_SOON' }, select: { entityId: true }, distinct: ['entityId'] })).map(l => l.entityId)) : new Set<string>();
            const retries = await retryStates(tasks.flatMap(t => ['sla:', 'warning:', 'unassigned:'].map(prefix => prefix + t.id)));
            for (const task of tasks) {
                const candidate = (date: Date | null, kind: string) => {
                    if (!date)
                        return;
                    const retry = retries.get(kind + ':' + task.id);
                    consider(retry?.nextAttemptAt && task.updatedAt <= retry.updatedAt && retry.nextAttemptAt > date ? retry.nextAttemptAt : date);
                };
                if (slaEnabled && task.slaDueAt) {
                    candidate(nextTaskSlaAt(task.slaDueAt, org?.settings, task.occurrences.filter(o => o.type === 'SLA_BREACH').map(o => o.category), now), 'sla');
                    if (!warned.has(task.id) && task.slaDueAt > now)
                        candidate(new Date(task.slaDueAt.getTime() - 30 * 60000), 'warning');
                }
                if (task.status === 'AVAILABLE' && !task.assignments.length && !task.occurrences.some(o => o.type === 'IMPEDIMENT' && o.category === 'UNASSIGNED_TIMEOUT'))
                    candidate(new Date(task.createdAt.getTime() + 15 * 60000), 'unassigned');
            }
            cursor = tasks[tasks.length - 1].id;
            if (tasks.length < 500)
                return { at, complete: true };
        }
        return { at: new Date(now.getTime() + 60000), complete: false };
    }
    return { at, complete: true };
}
