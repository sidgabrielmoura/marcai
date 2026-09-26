import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { CreateTaskForm } from "@/presentation/components/tasks/create-task-form";

export default async function NewTaskPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const [locations, teams, members] = await Promise.all([
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
    prisma.organizationMember.findMany({
      where: {
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
      include: { user: true },
    }),
  ]);

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <CreateTaskForm
        locations={locations}
        teams={teams}
        members={members.map((m) => ({
          id: m.id,
          name: m.user.name,
          email: m.user.email,
        }))}
      />
    </ManagementShell>
  );
}
