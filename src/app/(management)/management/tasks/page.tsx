import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { TasksViewClient } from "@/presentation/components/tasks/tasks-view-client";

export default async function ManagementTasksPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const whereClause: any = {
    organizationId: context.organizationId,
    deletedAt: null,
  };

  if (context.role === "MANAGER" && context.scope) {
    whereClause.locationId = { in: context.scope.locationIds };
    whereClause.teamId = { in: context.scope.teamIds };
  }

  const [tasks, locations, teams] = await Promise.all([
    prisma.task.findMany({
      where: whereClause,
      include: {
        location: true,
        team: true,
        assignments: {
          where: { type: "PRIMARY", removedAt: null },
          include: {
            member: {
              include: { user: true },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { deadlineAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    prisma.location.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER" && context.scope
          ? { id: { in: context.scope.locationIds } }
          : {}),
      },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(context.role === "MANAGER" && context.scope
          ? { id: { in: context.scope.teamIds } }
          : {}),
      },
      select: { id: true, name: true },
    }),
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
    locationName: t.location?.name || null,
    teamName: t.team?.name || null,
    primaryAssignee: t.assignments[0]?.member?.user?.name || null,
    slaExceeded: Boolean(
      t.slaExceededAt ||
        (t.slaDueAt && t.slaDueAt < now && t.status !== "COMPLETED"),
    ),
  }));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <TasksViewClient
        tasks={formattedTasks}
        locations={locations}
        teams={teams}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
