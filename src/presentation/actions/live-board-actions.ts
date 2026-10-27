"use server";
import { getAuthenticatedContext, getManagementContext } from '@/application/security/auth-context';
import { listTasks } from '@/application/mobile/data';
import { prisma } from '@/infrastructure/database/prisma';
import { realtimeContextKey } from '@/infrastructure/realtime/sync';
import { taskTiming } from '@/domain/rules/task-metrics';
import { resolveEffectiveTimezone } from '@/domain/rules/date-time';
import { getSubscriptionNotice } from '@/application/superadmin/manual-subscription';
import type { TaskStatus, Priority, Criticality } from '@/domain/types';
import type { OverviewTask } from '@/presentation/components/dashboard/overview-dashboard-client';
import type { EmployeeTask, ColumnId } from '@/presentation/components/mobile/employee-kanban-board';
export async function readEmployeeBoard() {
    const c = await getAuthenticatedContext();
    if (!c)
        return null;
    const now = new Date();
    const items = new Map<string, Awaited<ReturnType<typeof listTasks>>['items'][number]>();
    let cursor: string | null = null;
    const boardCache: NonNullable<Parameters<typeof listTasks>[5]> = {};
    do {
        const page = await listTasks(c, cursor, '', 'all', now, boardCache);
        for (const t of page.items)
            items.set(t.id, t);
        cursor = page.nextCursor;
    } while (cursor);
    const tasks: EmployeeTask[] = [...items.values()].map(t => ({ ...t, column: t.column as ColumnId, completedAt: t.status === 'COMPLETED' ? t.endedAt : null, evidenceCount: t.requirements.length, hasRequiredEvidence: t.requirements.some(r => r.required), hasImpediment: t.occurrences.length > 0, slaExceeded: !!t.slaDueAt && Date.parse(t.slaDueAt) < now.getTime(), delayMinutes: t.slaDueAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(t.slaDueAt)) / 60000)) : 0 }));
    return { contextKey: realtimeContextKey(c), tasks, snapshotAt: now.getTime(), userName: c.userName, orgName: c.organizationName, role: c.role };
}
export async function readManagementBoard(includeCatalogs = true) {
    const context = await getManagementContext();
    if (!context)
        return null;
    const whereClause: any = {
        organizationId: context.organizationId,
        deletedAt: null,
        origin: "AD_HOC",
    };
    if (context.role === "MANAGER" && context.scope) {
        whereClause.locationId = { in: context.scope.locationIds };
        whereClause.teamId = { in: context.scope.teamIds };
    }
    const [tasks, locations, teams] = await Promise.all([
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true, title: true, description: true, origin: true, status: true, priority: true,
                criticality: true, required: true, deadlineAt: true, taskType: true, slaExceededAt: true, slaDueAt: true,
                location: { select: { name: true, timezone: true } },
                execution: { select: { routine: { select: { timezone: true } } } },
                team: { select: { name: true } },
                assignments: {
                    where: { type: "PRIMARY", removedAt: null },
                    select: {
                        member: { select: { user: { select: { name: true } } } },
                    },
                },
            },
            orderBy: [{ priority: "desc" }, { deadlineAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        }),
        includeCatalogs ? prisma.location.findMany({
            where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
                ...(context.role === "MANAGER" && context.scope
                    ? { id: { in: context.scope.locationIds } }
                    : {}),
            },
            select: { id: true, name: true },
        }) : Promise.resolve([]),
        includeCatalogs ? prisma.team.findMany({
            where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
                ...(context.role === "MANAGER" && context.scope
                    ? { id: { in: context.scope.teamIds } }
                    : {}),
            },
            select: { id: true, name: true },
        }) : Promise.resolve([]),
    ]);
    const now = new Date();
    const formattedTasks = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        origin: t.origin,
        status: t.status,
        priority: t.priority,
        criticality: t.criticality,
        required: t.required,
        deadlineAt: t.deadlineAt,
        timezone: resolveEffectiveTimezone({
            routineTimezone: t.execution?.routine?.timezone,
            locationTimezone: t.location?.timezone,
        }),
        locationName: t.location?.name || null,
        teamName: t.team?.name || null,
        primaryAssignee: t.assignments[0]?.member?.user?.name || null,
        taskType: t.taskType,
        slaExceeded: Boolean(t.slaExceededAt ||
            (t.slaDueAt && t.slaDueAt < now && t.status !== "COMPLETED")),
    }));
    return { contextKey: realtimeContextKey(context), tasks: formattedTasks, locations, teams, role: context.role, userName: context.userName, orgName: context.organizationName };
}
export async function readOverviewBoard(includeCatalogs = true) {
    const context = await getManagementContext();
    if (!context)
        return null;
    // Filtro base multi-tenant
    const whereClause: any = {
        organizationId: context.organizationId,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
    };
    // Aplicação estrita do escopo de MANAGER (D-06: Interseção AND)
    if (context.role === "MANAGER" && context.scope) {
        whereClause.locationId = { in: context.scope.locationIds };
        whereClause.teamId = { in: context.scope.teamIds };
    }
    const [rawTasks, locations, teams, processes] = await Promise.all([
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true, title: true, status: true, priority: true, criticality: true, origin: true,
                locationId: true, teamId: true, processId: true, deadlineAt: true, slaDueAt: true,
                completedAt: true, createdAt: true, startedAt: true, scheduledDate: true,
                toleranceMinutes: true, maxDuration: true, actualDuration: true,
                location: { select: { name: true, timezone: true } },
                execution: { select: { routine: { select: { timezone: true } } } },
                team: { select: { name: true } },
                process: { select: { name: true } },
                occurrences: {
                    where: { type: "IMPEDIMENT" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { reason: true },
                },
                assignments: { where: { type: "PRIMARY", removedAt: null }, select: { member: { select: { user: { select: { name: true } } } } } },
            },
            orderBy: { createdAt: "desc" },
        }),
        includeCatalogs ? prisma.location.findMany({
            where: {
                organizationId: context.organizationId,
                ...(context.role === "MANAGER" && context.scope
                    ? { id: { in: context.scope.locationIds } }
                    : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }) : Promise.resolve([]),
        includeCatalogs ? prisma.team.findMany({
            where: {
                organizationId: context.organizationId,
                ...(context.role === "MANAGER" && context.scope
                    ? { id: { in: context.scope.teamIds } }
                    : {}),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }) : Promise.resolve([]),
        includeCatalogs ? prisma.process.findMany({
            where: { organizationId: context.organizationId, ...(context.role === "MANAGER" ? { locationId: { in: context.scope?.locationIds ?? [] } } : {}) },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }) : Promise.resolve([]),
    ]);
    const now = new Date();
    // Mapeamento estruturado das tarefas com cálculo exato de SLA e atraso (Item 41 & 42)
    const mappedTasks: OverviewTask[] = rawTasks.map((t) => {
        const { isOverdue, slaExceeded, delayMinutes } = taskTiming(t, now);
        const hasActiveImpediment = t.occurrences.length > 0;
        const isPaused = false;
        return {
            id: t.id,
            title: t.title,
            status: t.status as TaskStatus,
            priority: t.priority as Priority,
            criticality: t.criticality as Criticality,
            origin: t.origin,
            locationId: t.locationId,
            teamId: t.teamId,
            processId: t.processId,
            locationName: t.location?.name || "Sem unidade",
            teamName: t.team?.name || "Sem equipe",
            processName: t.process?.name || "Avulsa",
            deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
            timezone: resolveEffectiveTimezone({
                routineTimezone: t.execution?.routine?.timezone,
                locationTimezone: t.location?.timezone,
            }),
            completedAt: t.completedAt ? t.completedAt.toISOString() : null,
            createdAt: t.createdAt.toISOString(),
            isOverdue, slaExceeded,
            assigneeName: t.assignments[0]?.member.user.name ?? "Sem responsável",
            actualDuration: t.actualDuration,
            delayMinutes,
            hasActiveImpediment,
            impedimentReason: hasActiveImpediment
                ? t.occurrences[0].reason
                : undefined,
            isPaused,
            pendingApproval: t.status === "SUBMITTED",
        };
    });
    return { contextKey: realtimeContextKey(context), tasks: mappedTasks, options: { locations, teams, processes }, role: context.role, userName: context.userName, orgName: context.organizationName, subscriptionNotice: getSubscriptionNotice(context.subscription ?? null) };
}
