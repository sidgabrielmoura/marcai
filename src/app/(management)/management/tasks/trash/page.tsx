import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { TrashClient } from "@/presentation/components/tasks/trash-client";
import { Role } from "@/domain/types";

export default async function TasksTrashPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const trashedTasks = await prisma.task.findMany({
    where: {
      organizationId: context.organizationId,
      deletedAt: { not: null },
    },
    include: {
      location: true,
    },
    orderBy: { deletedAt: "desc" },
  });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <TrashClient
        tasks={trashedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          deletedAt: t.deletedAt!,
          deletedBy: t.deletedBy,
          deleteReason: t.deleteReason,
          locationName: t.location?.name || null,
        }))}
        canPurge={context.role === Role.OWNER || context.role === Role.ADMIN}
      />
    </ManagementShell>
  );
}
