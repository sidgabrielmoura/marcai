import { getManagementContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import {
  ManagementApprovalsClient,
  type ApprovalTask,
} from "@/presentation/components/approvals/management-approvals-client";
import { redirect } from "next/navigation";

export default async function ManagementApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const context = await getManagementContext();
  if (!context) redirect("/tasks");

  const { taskId: selectedTaskId } = await searchParams;

  const [rawTasks, locations, teams] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...taskScope(context),
        deletedAt: null,
        status: "SUBMITTED",
        approvalWorkflow: {
          isNot: null,
        },
      },
      include: {
        location: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        process: { select: { id: true, name: true } },
        assignments: {
          where: { removedAt: null },
          include: {
            member: {
              include: { user: { select: { name: true, email: true, avatarUrl: true } } },
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
        occurrences: {
          orderBy: { createdAt: "desc" },
        },
        approvalWorkflow: {
          include: {
            steps: {
              include: {
                decisions: {
                  include: {
                    decider: {
                      include: { user: { select: { name: true, email: true } } },
                    },
                  },
                  orderBy: { createdAt: "desc" },
                },
              },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
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
      orderBy: { name: "asc" },
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
      orderBy: { name: "asc" },
    }),
  ]);

  const tasks: ApprovalTask[] = rawTasks.map((t) => {
    const primary = t.assignments.find((a) => a.type === "PRIMARY");
    const activeStep = t.approvalWorkflow?.steps.find((s) => s.status === "PENDING");

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      criticality: t.criticality,
      locationId: t.locationId,
      locationName: t.location?.name ?? null,
      teamId: t.teamId,
      teamName: t.team?.name ?? null,
      processName: t.process?.name ?? null,
      primaryAssignee: primary
        ? {
            id: primary.memberId,
            name: primary.member.user.name,
            email: primary.member.user.email,
            avatarUrl: primary.member.user.avatarUrl,
          }
        : null,
      createdAt: t.createdAt.toISOString(),
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      slaDueAt: t.slaDueAt ? t.slaDueAt.toISOString() : null,
      evidenceRequirements: t.evidenceRequirements.map((r) => ({
        id: r.id,
        type: r.type,
        label: (r as any).label || (r as any).title || r.type,
        required: r.required,
        submissions: r.submissions.map((s) => ({
          id: s.id,
          value: s.value,
          fileUrl: (s as any).fileUrl ?? null,
          publicId: (s as any).publicId ?? null,
          storageKey: s.storageKey,
          validationStatus: s.validationStatus,
          createdAt: s.createdAt.toISOString(),
        })),
      })),
      formFields: t.formFields,
      formAnswers: t.formAnswers,
      occurrences: t.occurrences.map((o) => ({
        id: o.id,
        type: o.type,
        category: o.category,
        reason: o.reason,
        severity: o.severity,
        createdAt: o.createdAt.toISOString(),
      })),
      approvalWorkflow: t.approvalWorkflow
        ? {
            id: t.approvalWorkflow.id,
            mode: t.approvalWorkflow.mode,
            status: t.approvalWorkflow.status,
            activeStepId: activeStep?.id ?? null,
            steps: t.approvalWorkflow.steps.map((s) => ({
              id: s.id,
              sequence: s.sequence,
              status: s.status,
              deadlineAt: s.deadlineAt ? s.deadlineAt.toISOString() : null,
              decisions: s.decisions.map((d) => ({
                id: d.id,
                decision: d.decision,
                note: d.note,
                decidedByName: d.decider.user.name,
                createdAt: d.createdAt.toISOString(),
              })),
            })),
          }
        : null,
    };
  });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
      userId={context.userId}
    >
      <ManagementApprovalsClient
        tasks={tasks}
        locations={locations}
        teams={teams}
        initialSelectedTaskId={selectedTaskId}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
