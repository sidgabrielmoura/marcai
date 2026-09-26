import { taskScope } from "@/application/security/operational-scope";
import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { notFound } from "next/navigation";
import { ManagementTaskDetailClient } from "@/presentation/components/tasks/management-task-detail-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManagementTaskDetailPage({ params }: PageProps) {
  const context = await getManagementContext();
  if (!context) return null;

  const { id } = await params;

  // Consulta protegida por tenant
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
        team: true,
        assignments: {
          where: { removedAt: null },
          include: {
            member: {
              include: { user: true },
            },
          },
        },
        evidenceRequirements: {
          include: {
            submissions: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        sessions: {
          include: {
            pauses: true,
          },
        },
        occurrences: {
          orderBy: { createdAt: "desc" },
        },
        approvalWorkflow: {
          include: {
            steps: {
              include: {
                decisions: true,
              },
              orderBy: { sequence: "asc" },
            },
          },
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

  // Validação estrita de escopo do MANAGER
  if (context.role === "MANAGER" && context.scope) {
    if (
      task.locationId &&
      !context.scope.locationIds.includes(task.locationId)
    ) {
      notFound();
    }
    if (task.teamId && !context.scope.teamIds.includes(task.teamId)) {
      notFound();
    }
  }

  // Membros elegíveis para reatribuição (mesma organização e escopo)
  const availableMembers = await prisma.organizationMember.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      ...(task.teamId ? { teamMemberships: { some: { teamId: task.teamId } } } : {}),
      ...(task.locationId
        ? {
            locationAccesses: {
              some: { locationId: task.locationId, AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
              ] },
            },
          }
        : {}),
    },
    include: { user: true },
  });

  // Logs de auditoria desta tarefa
  const activityLogs = await prisma.activityLog.findMany({
    where: {
      organizationId: context.organizationId,
      entityType: "TASK",
      entityId: task.id,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const actors = await prisma.organizationMember.findMany({
    where: { organizationId: context.organizationId, id: { in: activityLogs.flatMap(log => log.actorId ? [log.actorId] : []) } },
    select: { id: true, user: { select: { name: true } } },
  });
  const actorNames = new Map(actors.map(actor => [actor.id, actor.user.name]));
  const pauses = task.sessions.flatMap((s) => s.pauses);
  const ownTeams = await prisma.teamMember.findMany({ where: { organizationMemberId: context.memberId }, select: { teamId: true } });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ManagementTaskDetailClient
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          instructions: task.instructions,
          origin: task.origin,
          status: task.status,
          startedAt: task.startedAt,
          priority: task.priority,
          criticality: task.criticality,
          required: task.required,
          deadlineAt: task.deadlineAt,
          slaDurationMinutes: task.slaDurationMinutes,
          slaDueAt: task.slaDueAt,
          slaExceededAt: task.slaExceededAt,
          estimatedDuration: task.estimatedDuration,
          actualDuration: task.actualDuration,
          locationName: task.location?.name || null,
          teamName: task.team?.name || null,
          assignments: task.assignments.map((a) => ({
            id: a.id,
            memberId: a.memberId,
            memberName: a.member.user.name,
            memberEmail: a.member.user.email,
            type: a.type,
            assignedAt: a.assignedAt,
          })),
          evidenceRequirements: task.evidenceRequirements.map((r) => ({
            id: r.id,
            type: r.type,
            required: r.required,
            executionStage: r.executionStage,
            submissions: r.submissions.map((s) => ({
              id: s.id,
              value: s.value,
              storageKey: s.storageKey,
              validationStatus: s.validationStatus,
              attemptNumber: s.attemptNumber,
              createdAt: s.createdAt,
            })),
          })),
          dependencies: (Array.isArray(rawDependencies)
            ? rawDependencies
            : []
          ).map((d: any) => ({
            id: d.id,
            type: d.type,
            logic: d.logic,
            dependsOnTask: d.dependsOnTask,
          })),
          pauses: pauses.map((p) => ({
            id: p.id,
            reasonCategoryId: p.reasonCategoryId,
            note: p.note,
            startedAt: p.startedAt,
            endedAt: p.endedAt,
          })),
          occurrences: task.occurrences.map((o) => ({
            id: o.id,
            type: o.type,
            category: o.category,
            reason: o.reason,
            severity: o.severity,
            createdAt: o.createdAt,
          })),
          activityLogs: activityLogs.map((l) => ({
            id: l.id,
            action: l.action,
            actorName: l.actorId ? actorNames.get(l.actorId) ?? "Pessoa não disponível" : null,
            createdAt: l.createdAt,
            metadata: l.metadata,
          })),
          approvalWorkflow: task.approvalWorkflow
            ? {
                id: task.approvalWorkflow.id,
                mode: task.approvalWorkflow.mode,
                status: task.approvalWorkflow.status,
                steps: task.approvalWorkflow.steps.map((s) => ({
                  id: s.id,
                  sequence: s.sequence,
                  status: s.status,
                  canDecide: task.status === "SUBMITTED" && s.status === "PENDING" &&
                    (s.approverMemberId === context.memberId || ownTeams.some(t => t.teamId === s.approverTeamId) || s.fallbackMemberId === context.memberId && !!s.deadlineAt && s.deadlineAt <= new Date()) &&
                    (task.approvalWorkflow!.mode !== "SEQUENTIAL" || task.approvalWorkflow!.steps.every(prior => prior.sequence >= s.sequence || prior.status === "APPROVED")),
                  decisions: s.decisions.map((dec) => ({
                    id: dec.id,
                    decision: dec.decision,
                    note: dec.note,
                    decidedBy: dec.decidedBy,
                    createdAt: dec.createdAt,
                  })),
                })),
              }
            : null,
        }}
        availableMembers={availableMembers.map((m) => ({
          id: m.id,
          name: m.user.name,
          email: m.user.email,
        }))}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
