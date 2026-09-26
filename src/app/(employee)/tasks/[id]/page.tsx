import { getEvidenceRound, evidenceInRound } from "@/application/tasks/evidence-round";
import { taskScope } from "@/application/security/operational-scope";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { notFound } from "next/navigation";
import { TaskDetailClient } from "@/presentation/components/mobile/task-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const context = await getAuthenticatedContext();
  if (!context) return null;

  const { id } = await params;

  // Consulta com isolamento obrigatório por tenant
  // Separamos a busca de dependências para resiliência contra cache de schema em runtime
  const [task, rawDependencies] = await Promise.all([
    prisma.task.findFirst({
      where: {
        id,
        ...taskScope(context),
        deletedAt: null,
      },
      include: {
        location: true,
        approvalWorkflow: true,
        evidenceRequirements: {
          include: {
            submissions: {
              orderBy: { attemptNumber: "asc" },
            },
          },
        },
        occurrences: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    "taskDependency" in prisma &&
    typeof (prisma as any).taskDependency?.findMany === "function"
      ? (prisma as any).taskDependency
          .findMany({
            where: { taskId: id, task: taskScope(context) },
            include: {
              dependsOnTask: {
                select: { id: true, title: true, status: true },
              },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  if (!task) {
    notFound();
  }

  const evidenceRound = await getEvidenceRound(prisma, context.organizationId, id);

  const dependenciesList: any[] = Array.isArray(rawDependencies)
    ? rawDependencies
    : [];

  return (
    <EmployeeShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <TaskDetailClient
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          instructions: task.instructions,
          status: task.status,
          priority: task.priority,
          deadlineAt: task.deadlineAt,
          scheduledDate: task.scheduledDate,
          requiresApproval: !!task.approvalWorkflow,
          correctionRequested: !!evidenceRound,
          locationName: task.location?.name || null,
          dependencies: dependenciesList.map((d: any) => ({
            id: d.id,
            type: d.type,
            logic: d.logic,
            dependsOnTask: {
              id: d.dependsOnTask?.id || "",
              title: d.dependsOnTask?.title || "Etapa anterior",
              status: d.dependsOnTask?.status || "AVAILABLE",
            },
          })),
          occurrences: task.occurrences.map((o) => ({
            id: o.id,
            type: o.type,
            category: o.category,
            reason: o.reason,
            severity: o.severity,
            createdAt: o.createdAt.toISOString(),
          })),
          evidenceRequirements: task.evidenceRequirements.map((req) => ({
            id: req.id,
            type: req.type,
            required: req.required,
            minQuantity: req.minQuantity,
            executionStage: req.executionStage,
            submissions: evidenceInRound(req.submissions, evidenceRound).map((s) => ({
              id: s.id,
              validationStatus: s.validationStatus,
              attemptNumber: s.attemptNumber,
              value: s.value,
              storageKey: s.storageKey,
              createdAt: s.createdAt.toISOString(),
            })),
          })),
        }}
      />
    </EmployeeShell>
  );
}
