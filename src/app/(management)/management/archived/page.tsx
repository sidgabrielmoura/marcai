import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ArchivedUnifiedClient } from "@/presentation/components/management/archived-unified-client";

export default async function ManagementArchivedPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const locationFilter =
    context.role === "MANAGER" && context.scope
      ? { in: context.scope.locationIds }
      : undefined;

  const [processes, routines, tasks] = await Promise.all([
    // Archived processes
    prisma.process.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ARCHIVED",
        ...(locationFilter ? { locationId: locationFilter } : {}),
      },
      include: {
        location: true,
        _count: {
          select: {
            routines: true,
            tasks: { where: { deletedAt: null } },
            executions: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),

    // Inactive / Paused / Archived Routines (Calendars)
    prisma.routine.findMany({
      where: {
        process: {
          organizationId: context.organizationId,
          ...(locationFilter ? { locationId: locationFilter } : {}),
        },
        status: { in: ["INACTIVE", "PAUSED", "ARCHIVED"] },
      },
      include: {
        process: {
          include: { location: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),

    // Archived / Deleted ad-hoc tasks
    prisma.task.findMany({
      where: {
        organizationId: context.organizationId,
        origin: "AD_HOC",
        deletedAt: { not: null },
        ...(locationFilter ? { locationId: locationFilter } : {}),
        ...(context.role === "MANAGER" && context.scope?.teamIds
          ? { teamId: { in: context.scope.teamIds } }
          : {}),
      },
      include: {
        location: true,
        team: true,
      },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  const formattedProcesses = processes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    criticality: p.criticality,
    locationName: p.location?.name || null,
    tasksCount: p._count.tasks,
    routinesCount: p._count.routines,
    archivedAt: p.updatedAt.toISOString(),
  }));

  const formattedRoutines = routines.map((r) => ({
    id: r.id,
    processId: r.processId,
    processName: r.process.name,
    locationName: r.process.location?.name || null,
    recurrenceRule: r.recurrenceRule,
    status: r.status,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const formattedTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    locationName: t.location?.name || null,
    teamName: t.team?.name || null,
    deletedAt: (t.deletedAt ?? t.updatedAt).toISOString(),
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ArchivedUnifiedClient
        processes={formattedProcesses}
        routines={formattedRoutines}
        tasks={formattedTasks}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
