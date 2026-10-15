import { getEvidenceRound, evidenceInRound } from "@/application/tasks/evidence-round";
import { taskScope } from "@/application/security/operational-scope";
import { taskTiming } from "@/domain/rules/task-metrics";
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
        organizationId: context.organizationId,
        OR: [
          taskScope(context),
          {
            status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
            teamId: { in: context.scope?.teamIds ?? [] },
            ...(context.scope?.locationIds && context.scope.locationIds.length > 0
              ? { OR: [{ locationId: null }, { locationId: { in: context.scope.locationIds } }] }
              : { locationId: null }),
            assignments: { none: { type: "PRIMARY", removedAt: null } },
          },
        ],
        deletedAt: null,
      },
      include: {
        location: true,
        approvalWorkflow: true,
        assignments: {
          where: { removedAt: null },
          select: { id: true, memberId: true, type: true },
        },
        evidenceRequirements: {
          include: {
            submissions: {
              orderBy: { attemptNumber: "asc" },
            },
          },
        },
        occurrences: {
          where: {
            type: { not: "PAUSE_ALERT" },
            category: { notIn: ["LONG_PAUSE", "INTERVALO"] },
          },
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
  const isUnassigned = !task.assignments.some((a) => a.type === "PRIMARY");
  const timing = taskTiming(task, new Date());

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
          taskType: task.taskType,
          formFields: task.formFields,
          formAnswers: task.formAnswers,
          status: task.status,
          priority: task.priority,
          deadlineAt: task.deadlineAt,
          slaDueAt: task.slaDueAt,
          toleranceMinutes: task.toleranceMinutes ?? 20,
          scheduledDate: task.scheduledDate,
          requiresApproval: !!task.approvalWorkflow,
          correctionRequested: !!evidenceRound,
          locationName: task.location?.name || null,
          isUnassigned,
          slaExceeded: timing.slaExceeded,
          delayMinutes: timing.delayMinutes,
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
