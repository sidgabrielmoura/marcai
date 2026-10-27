"use client";
import { useRef } from 'react';
import { useLiveResource } from '@/presentation/hooks/use-live-resource';
import { readEmployeeBoard, readManagementBoard, readOverviewBoard } from '@/presentation/actions/live-board-actions';
import { EmployeeKanbanBoard, type ColumnId } from '../mobile/employee-kanban-board';
import { TasksViewClient } from '../tasks/tasks-view-client';
import { OverviewDashboardClient } from '../dashboard/overview-dashboard-client';
type EmployeeBoard = NonNullable<Awaited<ReturnType<typeof readEmployeeBoard>>>;
type ManagementBoard = NonNullable<Awaited<ReturnType<typeof readManagementBoard>>>;
type OverviewBoard = NonNullable<Awaited<ReturnType<typeof readOverviewBoard>>>;
const families = ['TASK_CHANGED', 'EXECUTION_CHANGED'];
export function LiveEmployeeBoard({ initial, tab }: {
    initial: EmployeeBoard;
    tab?: string;
}) {
    const data = useLiveResource(initial, readEmployeeBoard, families);
    const columns = ['today', 'overdue', 'unassigned', 'completed', 'upcoming'];
    const initialColumn: ColumnId = columns.includes(tab ?? '') ? tab as ColumnId : data.tasks.some(t => t.column === 'today') ? 'today' : data.tasks.some(t => t.column === 'overdue') ? 'overdue' : data.tasks.some(t => t.isUnassigned) ? 'unassigned' : 'today';
    return <EmployeeKanbanBoard tasks={data.tasks} initialColumn={initialColumn} snapshotAt={data.snapshotAt}/>;
}
export function LiveManagementBoard({ initial }: {
    initial: ManagementBoard;
}) {
    const catalogs = useRef({ context: initial.contextKey, at: Date.now(), locations: initial.locations, teams: initial.teams });
    if (catalogs.current.context !== initial.contextKey)
        catalogs.current = { context: initial.contextKey, at: Date.now(), locations: initial.locations, teams: initial.teams };
    const data = useLiveResource(initial, async (kinds) => {
        const full = kinds.includes('ALL') || Date.now() - catalogs.current.at >= 600000;
        const next = await readManagementBoard(full);
        if (!next)
            return null;
        if (full)
            catalogs.current = { context: next.contextKey, at: Date.now(), locations: next.locations, teams: next.teams };
        return { ...next, locations: catalogs.current.locations, teams: catalogs.current.teams };
    }, families);
    return <TasksViewClient tasks={data.tasks} locations={data.locations} teams={data.teams} userRole={data.role}/>;
}
export function LiveOverviewBoard({ initial }: {
    initial: OverviewBoard;
}) {
    const catalogs = useRef({ context: initial.contextKey, at: Date.now(), options: initial.options });
    if (catalogs.current.context !== initial.contextKey)
        catalogs.current = { context: initial.contextKey, at: Date.now(), options: initial.options };
    const data = useLiveResource(initial, async (kinds) => {
        const full = kinds.includes('ALL') || Date.now() - catalogs.current.at >= 600000;
        const next = await readOverviewBoard(full);
        if (!next)
            return null;
        if (full)
            catalogs.current = { context: next.contextKey, at: Date.now(), options: next.options };
        return { ...next, options: catalogs.current.options };
    }, families);
    return <OverviewDashboardClient tasks={data.tasks} options={data.options} role={data.role} userName={data.userName} orgName={data.orgName}/>;
}
