import { prisma } from "@/infrastructure/database/prisma";
import { getEvidenceRound } from "@/application/tasks/evidence-round";
import { eligibleMember } from "@/application/security/operational-scope";
export async function eligibleRecipient(n: {
    userId: string;
    organizationId: string;
    type: string;
    data: unknown;
}) {
    const m = await prisma.organizationMember.findFirst({ where: { userId: n.userId, organizationId: n.organizationId, status: 'ACTIVE', user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } }, include: { locationAccesses: { where: { location: { organizationId: n.organizationId, status: "ACTIVE" } } }, teamMemberships: { where: { team: { organizationId: n.organizationId, status: "ACTIVE" } } } } });
    if (!m)
        return false;
    const d = n.data as {
        taskId?: string;
        executionId?: string;
        cycle?: string;
    } | null;
    if (!d?.taskId) {
        if (d?.executionId) {
            const e = await prisma.processExecution.findFirst({ where: { id: d.executionId, organizationId: n.organizationId }, include: { tasks: { where: { deletedAt: null }, include: { assignments: { where: { removedAt: null } } } } } });
            if (!e || n.type === "EXECUTION_COMPLETED" && e.status !== "COMPLETED")
                return false;
            if (["OWNER", "ADMIN"].includes(m.role))
                return true;
            return e.tasks.some(t => m.role === "MANAGER" ? !!t.teamId && !!t.locationId && m.teamMemberships.some(tm => tm.teamId === t.teamId) && m.locationAccesses.some(la => la.locationId === t.locationId && (!la.startsAt || la.startsAt <= new Date()) && (!la.expiresAt || la.expiresAt > new Date())) : t.assignments.some(a => a.memberId === m.id) && (!t.teamId || m.teamMemberships.some(tm => tm.teamId === t.teamId)) && (!t.locationId || m.locationAccesses.some(la => la.locationId === t.locationId && (!la.startsAt || la.startsAt <= new Date()) && (!la.expiresAt || la.expiresAt > new Date()))));
        }
        return true;
    }
    const task = await prisma.task.findFirst({ where: { id: d.taskId, organizationId: n.organizationId }, include: { assignments: { where: { removedAt: null } } } });
    if (!task)
        return false;
    if (['TASK_CANCELLED', 'TASK_TRANSFERRED_OUT'].includes(n.type))
        return true;
    if (task.deletedAt || ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status) && !["APPROVAL_UPDATED", "TASK_COMPLETED", "IMPEDIMENT_REPORTED", "OPERATIONAL_ALERT"].includes(n.type))
        return false;
    if (n.type === "APPROVAL_REQUESTED" && task.status !== "SUBMITTED")
        return false;
    if (d.cycle) {
        const round = await getEvidenceRound(prisma, n.organizationId, task.id);
        const cycle = JSON.stringify({ roundId: round?.id ?? "initial", deadline: task.deadlineAt, sla: task.slaDueAt, tolerance: task.toleranceMinutes, assignees: task.assignments.map(a => a.memberId + ":" + a.assignedAt.toISOString()).sort() });
        if (cycle !== d.cycle)
            return false;
    }
    if (n.type === 'TASK_CORRECTION_REQUESTED' && task.status !== 'NEEDS_CORRECTION')
        return false;
    if (n.type === 'TASK_UNBLOCKED') {
        const due = [task.deadlineAt?.getTime(), task.slaDueAt?.getTime()].filter((d): d is number => d !== undefined);
        if (task.status === 'BLOCKED' || task.scheduledDate && task.scheduledDate > new Date() || due.length && Date.now() > Math.min(...due) + (task.toleranceMinutes ?? 20) * 60000)
            return false;
    }
    if (['OWNER', 'ADMIN'].includes(m.role))
        return true;
    if (m.role === 'MANAGER')
        return !!task.locationId && !!task.teamId && m.teamMemberships.some(t => t.teamId === task.teamId) && m.locationAccesses.some(l => l.locationId === task.locationId && (!l.startsAt || l.startsAt <= new Date()) && (!l.expiresAt || l.expiresAt > new Date()));
    if (m.role === 'EMPLOYEE')
        return task.assignments.some(a => a.memberId === m.id) && !!await eligibleMember(n.organizationId, m.id, task.locationId, task.teamId);
    return false;
}
