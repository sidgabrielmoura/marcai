import { canStartTask } from "@/domain/rules/task-rules";
import {
  evaluateEarlyExecution,
  type EarlyExecutionPolicy,
} from "@/domain/rules/early-execution";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { taskScope } from "@/application/security/operational-scope";
import { evaluateTaskDependencies } from "@/domain/rules/dependency-rules";
import { effectiveWorkSeconds } from "@/domain/rules/execution-state";
import {
  getEvidenceRound,
  evidenceInRound,
} from "@/application/tasks/evidence-round";
import { fail } from "./http";
import { boardState, columnFor, deadline, dayKey } from "./policy";
import { operationPermission } from "@/domain/rules/employee-workflow";
import { resolveExecutionStatus } from "@/domain/rules/execution-state";
export const includeTask = {
  organization: { select: { settings: true } },
  location: true,
  team: { select: { name: true } },
  process: { select: { name: true } },
  execution: {
    select: {
      id: true,
      status: true,
      availableAt: true,
      scheduledAt: true,
      completedAt: true,
      process: { select: { name: true } },
    },
  },
  assignments: {
    where: { removedAt: null },
    select: {
      memberId: true,
      type: true,
      member: {
        select: { organizationId: true, user: { select: { name: true } } },
      },
    },
  },
  approvalWorkflow: {
    include: {
      steps: {
        include: {
          decisions: {
            select: { id: true, decision: true, note: true, createdAt: true },
          },
        },
      },
    },
  },
  sessions: { include: { pauses: true } },
  evidenceRequirements: {
    include: { submissions: { orderBy: { createdAt: "asc" as const } } },
  },
  dependencies: {
    include: { dependsOnTask: { include: { approvalWorkflow: true } } },
  },
  occurrences: {
    where: { type: { not: "PAUSE_ALERT" } },
    orderBy: { createdAt: "desc" as const },
    take: 50,
  },
} as const;
export type LoadedTask = Prisma.TaskGetPayload<{ include: typeof includeTask }>;
export function readable(c: AuthenticatedContext): Prisma.TaskWhereInput {
  return {
    organizationId: c.organizationId,
    deletedAt: null,
    OR: [
      taskScope(c),
      {
        status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
        teamId: { in: c.scope?.teamIds ?? [] },
        OR: [
          { locationId: null },
          { locationId: { in: c.scope?.locationIds ?? [] } },
        ],
        assignments: { none: { type: "PRIMARY", removedAt: null } },
      },
    ],
  };
}
export function dependencies(task: LoadedTask) {
  return evaluateTaskDependencies(
    task.dependencies.map((d) => ({
      dependsOnTaskId: d.dependsOnId,
      dependsOnStatus: d.dependsOnTask.status,
      dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status,
      type: d.type,
      logic: d.logic,
    })),
  );
}
export function taskDetailScope(
  context: AuthenticatedContext,
): Prisma.TaskWhereInput {
  return {
    organizationId: context.organizationId,
    deletedAt: null,
    OR: [
      readable(context),
      {
        executionId: { not: null },
        teamId: { in: context.scope?.teamIds ?? [] },
        OR: [
          { locationId: null },
          { locationId: { in: context.scope?.locationIds ?? [] } },
        ],
      },
    ],
  };
}
const permit = (code: string | null = null, reason: string | null = null) => ({
  allowed: !code,
  code,
  reason,
});
export function operationGuard(
  task: LoadedTask,
  now: Date,
  assigned: boolean,
  claiming = false,
) {
  const primaryAssignee = task.assignments.find((a) => a.type === "PRIMARY")
    ?.member?.user?.name;
  if (!assigned)
    return permit(
      "NOT_ASSIGNED",
      task.assignments.some((a) => a.type === "PRIMARY")
        ? primaryAssignee
          ? `Esta tarefa já foi assumida por ${primaryAssignee}.`
          : "Esta tarefa já foi assumida por outro colaborador."
        : "Assuma a tarefa antes de registrar a entrega.",
    );
  return operationPermission(
    {
      ...task,
      isUnassigned: !task.assignments.some(
        (assignment) => assignment.type === "PRIMARY",
      ),
      dependencyBlocked: dependencies(task).isBlocked,
      executionStatus: task.execution?.status,
      executionAvailableAt: task.execution?.availableAt,
    },
    now.getTime(),
    assigned,
    claiming ? "claim" : "work",
  );
}
export async function project(
  task: LoadedTask,
  c: AuthenticatedContext,
  detail = false,
  now = new Date(),
  knownRound?: Awaited<ReturnType<typeof getEvidenceRound>>,
) {
  const round =
    knownRound === undefined
      ? await getEvidenceRound(prisma, c.organizationId, task.id)
      : knownRound;
  const assigned = task.assignments.some((a) => a.memberId === c.memberId);
  const unassigned = !task.assignments.some((a) => a.type === "PRIMARY");
  const primaryAssignee = task.assignments.find((a) => a.type === "PRIMARY")
    ?.member?.user?.name;
  const pausedAt =
    task.status === "PAUSED"
      ? (task.sessions
          .flatMap((s) =>
            s.pauses.filter((p) => !p.endedAt).map((p) => p.startedAt),
          )
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? task.updatedAt)
      : null;
  const ended =
    task.completedAt ??
    task.cancelledAt ??
    (["NOT_COMPLETED", "SUBMITTED"].includes(task.status)
      ? task.updatedAt
      : pausedAt);
  const terminal = [
    "COMPLETED",
    "CANCELLED",
    "NOT_COMPLETED",
    "SUBMITTED",
  ].includes(task.status);
  const dep = dependencies(task);
  const dependencyBlocked = !terminal && dep.isBlocked;
  const managementBlocked =
    !terminal &&
    (task.managementBlocked ||
      (task.status === "BLOCKED" && !dep.isBlocked) ||
      task.execution?.status === "PAUSED");
  const d = deadline(
    {
      ...task,
      executionAvailableAt: task.execution?.availableAt,
      endedAt: ended,
    },
    now.getTime(),
  );
  const limit = d.limitAt;
  const future = d.scheduled;
  const start = task.startedAt
    ? Math.max(task.startedAt.getTime(), d.releaseAt ?? 0)
    : null;
  const maxAllowedSeconds =
    start !== null && limit !== null
      ? Math.max(0, Math.floor((limit - start) / 1000))
      : Infinity;
  const rawElapsed =
    start === null || future || dependencyBlocked || managementBlocked
      ? null
      : Math.max(
          0,
          Math.floor(
            (Math.min(ended?.getTime() ?? now.getTime(), limit ?? Infinity) -
              start) /
              1000,
          ),
        );
  const elapsed =
    rawElapsed === null ? null : Math.min(rawElapsed, maxAllowedSeconds);
  const guard = operationGuard(task, now, assigned);
  const settings = task.organization.settings as {
    earlyExecutionPolicy?: EarlyExecutionPolicy;
    earlyExecutionWindowMinutes?: number;
  } | null;
  const early = evaluateEarlyExecution({
    policy: settings?.earlyExecutionPolicy ?? "NOT_ALLOWED",
    scheduledOrAvailableAt:
      d.releaseAt !== null ? new Date(d.releaseAt) : new Date(0),
    currentTime: now,
    windowMinutes: settings?.earlyExecutionWindowMinutes ?? 60,
  });
  const startCheck = canStartTask(task.status, dependencies(task).isBlocked);
  const claim =
    unassigned &&
    !!task.teamId &&
    operationGuard(task, now, true, true).allowed;
  const requirements = task.evidenceRequirements.map((r) => {
    const current = evidenceInRound(r.submissions, round),
      validCount = current.filter((s) => s.validationStatus === "VALID").length,
      rejectedCount = current.filter(
        (s) => s.validationStatus === "REJECTED",
      ).length;
    return {
      id: r.id,
      type: r.type,
      required: r.required,
      minQuantity: r.minQuantity,
      maxQuantity: r.maxQuantity,
      stage: r.executionStage,
      validCount,
      rejectedCount,
      waived: rejectedCount >= 3 && validCount < r.minQuantity,
      submissions: detail
        ? r.submissions.map((s) => ({
            id: s.id,
            value: s.storageKey || s.fileUrl ? null : s.value,
            hasFile: !!(s.storageKey || s.fileUrl),
            fileUrl: s.fileUrl ?? null,
            publicId: s.publicId ?? null,
            validationStatus: s.validationStatus,
            rejectionReason: s.rejectionReason,
            createdAt: s.createdAt.toISOString(),
            roundId:
              s.createdAt >= (round?.createdAt ?? new Date(0))
                ? (round?.id ?? "initial")
                : "previous",
          }))
        : [],
    };
  });
  const correctionLog =
    detail && round
      ? await prisma.activityLog.findFirst({
          where: {
            id: round.id,
            organizationId: c.organizationId,
            entityType: "TASK",
            entityId: task.id,
          },
          select: { metadata: true },
        })
      : null;
  const correctionMeta = correctionLog?.metadata as {
    note?: unknown;
    reason?: unknown;
  } | null;
  const correctionNote = correctionMeta?.note ?? correctionMeta?.reason;
  const visibleDependencyIds = new Set(
    detail && task.dependencies.length
      ? (
          await prisma.task.findMany({
            where: {
              ...taskDetailScope(c),
              id: {
                in: task.dependencies.map(
                  (dependency) => dependency.dependsOnId,
                ),
              },
            },
            select: { id: true },
          })
        ).map((dependency) => dependency.id)
      : [],
  );
  const taskDto = {
    id: task.id,
    snapshotAt: now.toISOString(),
    version: task.updatedAt.toISOString(),
    organizationId: task.organizationId,
    executionId: task.executionId,
    origin: task.origin,
    title: task.title,
    description: detail ? task.description : null,
    instructions: detail ? task.instructions : null,
    status: dependencyBlocked ? ("BLOCKED" as const) : task.status,
    dependencyBlocked,
    managementBlocked,
    executionStatus: task.execution?.status ?? null,
    executionAvailableAt: task.execution?.availableAt.toISOString() ?? null,
    definitionOrder: task.definitionOrder,
    taskType: task.taskType,
    priority: task.priority,
    criticality: task.criticality,
    teamName: task.team?.name ?? null,
    required: task.required,
    processName: task.process?.name ?? task.execution?.process.name ?? null,
    locationName: task.location?.name ?? null,
    timezone: task.location?.timezone ?? "America/Sao_Paulo",
    deadlineAt: task.deadlineAt?.toISOString() ?? null,
    slaDueAt: task.slaDueAt?.toISOString() ?? null,
    scheduledDate:
      d.releaseAt !== null ? new Date(d.releaseAt).toISOString() : null,
    toleranceMinutes: task.toleranceMinutes ?? 20,
    maxDuration: task.maxDuration,
    startedAt: task.startedAt?.toISOString() ?? null,
    endedAt: ended?.toISOString() ?? null,
    elapsedSeconds: elapsed,
    workSeconds: effectiveWorkSeconds(task.sessions, ended ?? now),
    timerRunning:
      !future &&
      !terminal &&
      task.status !== "PAUSED" &&
      !dependencyBlocked &&
      !managementBlocked &&
      !!start &&
      d.phase !== "EXCEEDED" &&
      (limit === null || now.getTime() <= limit),
    isUnassigned: unassigned,
    requiresApproval: !!task.approvalWorkflow,
    assignmentType:
      task.assignments.find((a) => a.memberId === c.memberId)?.type ?? null,
    assignedNames: [
      ...new Set(
        task.assignments
          .filter((a) => a.member.organizationId === c.organizationId)
          .map((a) => a.member.user.name),
      ),
    ],
    roundId: round?.id ?? "initial",
    formFields: detail ? (task.formFields ?? []) : [],
    formAnswers: detail ? (task.formAnswers ?? {}) : {},
    requirements,
    actions: {
      start: {
        ...(assigned &&
        startCheck.allowed &&
        (guard.allowed ||
          (guard.code === "SCHEDULED" &&
            (early.allowed || early.requireJustification))) &&
        requirements
          .filter((r) => r.required && r.stage === "START")
          .every((r) => r.validCount >= r.minQuantity || r.waived)
          ? permit()
          : permit(
              "START_UNAVAILABLE",
              guard.reason ??
                startCheck.reason ??
                early.reason ??
                "Registre as evidências de início.",
            )),
        requiresJustification: !!early.requireJustification,
      },
      claim: claim
        ? permit()
        : permit(
            "CLAIM_UNAVAILABLE",
            unassigned
              ? future
                ? "Aguarde o horário agendado."
                : (operationGuard(task, now, true, true).reason ??
                  "Esta tarefa não está disponível para assumir.")
              : primaryAssignee
                ? `Esta tarefa já foi assumida por ${primaryAssignee}.`
                : "Esta tarefa já foi assumida por outro colaborador.",
          ),
      complete: guard,
      evidence: guard,
      resume: permit("RESUME_UNAVAILABLE", "Tarefas não podem ser pausadas."),
      impediment: guard.allowed
        ? permit()
        : permit(
            "IMPEDIMENT_UNAVAILABLE",
            "Esta tarefa não pode ser encerrada com impedimento.",
          ),
    },
    dependencies: detail
      ? task.dependencies.map((d) => ({
          id: d.id,
          type: d.type,
          logic: d.logic,
          taskId: visibleDependencyIds.has(d.dependsOnId)
            ? d.dependsOnId
            : null,
          status: visibleDependencyIds.has(d.dependsOnId)
            ? d.dependsOnTask.status
            : null,
          satisfied:
            d.type === "INFORMATIVE" ||
            (d.dependsOnTask.status === "COMPLETED" &&
              (d.type !== "APPROVAL_CONDITION" ||
                d.dependsOnTask.approvalWorkflow?.status === "APPROVED")),
          title: visibleDependencyIds.has(d.dependsOnId)
            ? d.dependsOnTask.title
            : "Etapa anterior fora do seu acesso",
        }))
      : [],
    occurrences: detail
      ? task.occurrences.map((o) => ({
          id: o.id,
          reason: o.reason,
          category: o.category,
          createdAt: o.createdAt.toISOString(),
        }))
      : [],
    correctionReason:
      typeof correctionNote === "string" ? correctionNote.slice(0, 1000) : null,
    approvalHistory: detail
      ? (task.approvalWorkflow?.steps ?? [])
          .flatMap((step) =>
            step.decisions.map((d) => ({
              id: d.id,
              sequence: step.sequence,
              decision: d.decision,
              note: d.note,
              createdAt: d.createdAt.toISOString(),
            })),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [],
    timeline: detail
      ? await prisma.activityLog.findMany({
          where: {
            organizationId: c.organizationId,
            entityType: "TASK",
            entityId: task.id,
            action: {
              in: [
                "TASK_STARTED",
                "TASK_CLAIMED",
                "TASK_COMPLETED",
                "TASK_SUBMITTED",
                "TASK_CORRECTION_REQUESTED",
                "APPROVAL_REJECTED",
                "TASK_CANCELLED",
                "TASK_IMPEDIMENT_REPORTED",
                "EVIDENCE_SUBMITTED",
                "EVIDENCE_VALIDATION_FAILED",
              ],
            },
          },
          select: { id: true, action: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
        })
      : [],
  };
  return { ...taskDto, column: columnFor(taskDto, now.getTime()) };
}
export async function taskDetail(c: AuthenticatedContext, id: string) {
  const t = await prisma.task.findFirst({
    where: { ...taskDetailScope(c), id },
    include: includeTask,
  });
  if (!t)
    fail(
      404,
      "TASK_UNAVAILABLE",
      "Tarefa removida, transferida ou fora do seu acesso.",
    );
  return project(t, c, true);
}
type BoardVisibilityTask = {
  status: string;
  completedAt: Date | null;
  location: { timezone: string } | null;
  execution: { status: string; completedAt?: Date | null } | null;
};
function appearsOnBoard(task: BoardVisibilityTask, now: Date) {
  const timezone = task.location?.timezone ?? "America/Sao_Paulo";
  if (
    task.execution &&
    ["CANCELLED", "NOT_COMPLETED"].includes(task.execution.status)
  )
    return false;
  if (
    task.execution?.status === "COMPLETED" &&
    task.execution.completedAt &&
    dayKey(task.execution.completedAt.getTime(), timezone) !==
      dayKey(now.getTime(), timezone)
  )
    return false;
  return (
    task.status !== "COMPLETED" ||
    (!!task.completedAt &&
      dayKey(task.completedAt.getTime(), timezone) ===
        dayKey(now.getTime(), timezone)) ||
    (!!task.execution &&
      !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(
        task.execution.status,
      ))
  );
}
async function projectTaskList(
  tasks: LoadedTask[],
  context: AuthenticatedContext,
  now = new Date(),
) {
  const rounds = await prisma.activityLog.findMany({
    where: {
      organizationId: context.organizationId,
      entityType: "TASK",
      entityId: { in: tasks.map((task) => task.id) },
      action: { in: ["TASK_CORRECTION_REQUESTED", "APPROVAL_REJECTED"] },
    },
    distinct: ["entityId"],
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { entityId: true, id: true, createdAt: true },
  });
  const roundByTask = new Map(rounds.map((round) => [round.entityId, round]));
  return Promise.all(
    tasks.map((task) =>
      project(task, context, false, now, roundByTask.get(task.id) ?? null),
    ),
  );
}

export async function listTasks(
  c: AuthenticatedContext,
  cursor: string | null,
  search = "",
  type = "all",
  now = new Date(),
) {
  const cohort: Prisma.TaskWhereInput = {
    AND: [
      readable(c),
      {
        OR: [
          { executionId: null },
          {
            execution: {
              status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
            },
          },
          {
            execution: {
              status: "COMPLETED",
              OR: [
                {
                  completedAt: { gte: new Date(now.getTime() - 27 * 3600000) },
                },
                { completedAt: null },
              ],
            },
          },
        ],
      },
      {
        OR: [
          { status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] } },
          {
            status: "COMPLETED",
            completedAt: { gte: new Date(now.getTime() - 27 * 3600000) },
          },
          {
            origin: "PROCESS",
            execution: {
              status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
            },
          },
        ],
      },
      ...(type !== "all"
        ? [{ taskType: type === "form" ? "FORM" : "STANDARD" }]
        : []),
      ...(search
        ? [
            {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                {
                  location: {
                    name: { contains: search, mode: "insensitive" as const },
                  },
                },
                {
                  process: {
                    name: { contains: search, mode: "insensitive" as const },
                  },
                },
                {
                  execution: {
                    process: {
                      name: { contains: search, mode: "insensitive" as const },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
  const rows = await prisma.task.findMany({
    where: {
      ...cohort,
      ...(cursor
        ? {
            AND: [
              ...(cohort.AND as Prisma.TaskWhereInput[]),
              cursorWhere(cursor),
            ],
          }
        : {}),
    },
    include: includeTask,
    orderBy: [{ priority: "desc" }, { deadlineAt: "asc" }, { id: "asc" }],
    take: 101,
  });
  const page = rows.slice(0, 100);
  const projected = await projectTaskList(
    page.filter((task) => appearsOnBoard(task, now)),
    c,
    now,
  );
  const board = await boardCounts(c, cohort, now);
  return {
    items: projected.map((t) =>
      t.origin === "PROCESS" && t.executionId
        ? {
            ...t,
            processSummary: board.summaries["execution:" + t.executionId],
          }
        : t,
    ),
    counts: board.counts,
    nextCursor: rows.length > 100 ? encodeCursor(page.at(-1)!) : null,
  };
}
export async function history(
  c: AuthenticatedContext,
  period: number,
  status: string,
  cursor: string | null,
) {
  const rows = await prisma.task.findMany({
    where: {
      ...taskScope(c),
      deletedAt: null,
      status:
        status === "ALL"
          ? { in: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] }
          : (status as "COMPLETED"),
      updatedAt: { gte: new Date(Date.now() - period * 86400000) },
      ...(cursor ? { AND: [historyCursor(cursor)] } : {}),
    },
    include: includeTask,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 21,
  });
  return {
    items: await Promise.all(rows.slice(0, 20).map((t) => project(t, c))),
    nextCursor:
      rows.length > 20
        ? Buffer.from(
            JSON.stringify({
              date: rows[19]!.updatedAt.toISOString(),
              id: rows[19]!.id,
            }),
          ).toString("base64url")
        : null,
  };
}
export async function execution(c: AuthenticatedContext, id: string) {
  const executionTeamScope = {
    deletedAt: null,
    teamId: { in: c.scope?.teamIds ?? [] },
    OR: [
      { locationId: null },
      { locationId: { in: c.scope?.locationIds ?? [] } },
    ],
  };
  const e = await prisma.processExecution.findFirst({
    where: {
      id,
      organizationId: c.organizationId,
      tasks: { some: executionTeamScope },
    },
    include: {
      process: { select: { name: true } },
      tasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          required: true,
          status: true,
          startedAt: true,
          approvalWorkflow: { select: { status: true } },
        },
      },
    },
  });
  if (!e)
    fail(404, "EXECUTION_UNAVAILABLE", "Execução indisponível no seu acesso.");
  const visible = await prisma.task.findMany({
    where: {
      executionId: id,
      organizationId: c.organizationId,
      ...executionTeamScope,
    },
    include: includeTask,
    orderBy: [{ definitionOrder: "asc" }, { id: "asc" }],
  });
  const required = e.tasks.filter((t) => t.required),
    done = (t: (typeof required)[number]) =>
      t.status === "COMPLETED" &&
      (!t.approvalWorkflow || t.approvalWorkflow.status === "APPROVED");
  return {
    id: e.id,
    name: e.process.name,
    status: resolveExecutionStatus(e),
    canComplete:
      !["COMPLETED", "CANCELLED", "NOT_COMPLETED", "PAUSED"].includes(
        e.status,
      ) &&
      Math.max(e.scheduledAt.getTime(), e.availableAt.getTime()) <=
        Date.now() &&
      resolveExecutionStatus(e) === "COMPLETED",
    requiredTotal: required.length,
    requiredCompleted: required.filter(done).length,
    personalTotal: visible.length,
    personalCompleted: visible.filter(done).length,
    hasHiddenSteps: visible.length < e.tasks.length,
    visibleTasks: await projectTaskList(visible, c),
  };
}

async function boardCounts(
  c: AuthenticatedContext,
  where: Prisma.TaskWhereInput,
  now: Date,
) {
  const select = {
    id: true,
    origin: true,
    executionId: true,
    status: true,
    deadlineAt: true,
    slaDueAt: true,
    startedAt: true,
    toleranceMinutes: true,
    maxDuration: true,
    scheduledDate: true,
    completedAt: true,
    managementBlocked: true,
    dependencies: {
      select: {
        dependsOnId: true,
        type: true,
        logic: true,
        dependsOnTask: {
          select: {
            status: true,
            approvalWorkflow: { select: { status: true } },
          },
        },
      },
    },
    execution: {
      select: { status: true, availableAt: true, completedAt: true },
    },
    location: { select: { timezone: true } },
    assignments: { where: { removedAt: null }, select: { type: true } },
  } as const;
  let rows = await prisma.task.findMany({
    where,
    select,
    orderBy: { id: "asc" },
  });
  const matchingExecutions = [
    ...new Set(
      rows.flatMap((task) => (task.executionId ? [task.executionId] : [])),
    ),
  ];
  if (matchingExecutions.length) {
    const processTasks = await prisma.task.findMany({
      where: {
        AND: [readable(c), { executionId: { in: matchingExecutions } }],
      },
      select,
      orderBy: { id: "asc" },
    });
    const seen = new Set(rows.map((task) => task.id));
    rows = rows.concat(processTasks.filter((task) => !seen.has(task.id)));
  }
  const groups = new Map<
    string,
    Array<Parameters<typeof boardState>[0][number]>
  >();
  for (const t of rows) {
    const timezone = t.location?.timezone ?? "America/Sao_Paulo";
    if (!appearsOnBoard(t, now)) continue;
    const task = {
      status: t.status,
      managementBlocked: t.managementBlocked,
      executionStatus: t.execution?.status,
      executionAvailableAt: t.execution?.availableAt,
      dependencyBlocked:
        evaluateTaskDependencies(
          t.dependencies.map((d) => ({
            dependsOnTaskId: d.dependsOnId,
            dependsOnStatus: d.dependsOnTask.status,
            dependsOnApprovalStatus: d.dependsOnTask.approvalWorkflow?.status,
            type: d.type,
            logic: d.logic,
          })),
        ).isBlocked || t.status === "BLOCKED",
      deadlineAt: t.deadlineAt?.toISOString(),
      slaDueAt: t.slaDueAt?.toISOString(),
      scheduledDate: t.scheduledDate?.toISOString(),
      startedAt: t.startedAt?.toISOString(),
      toleranceMinutes: t.toleranceMinutes,
      maxDuration: t.maxDuration,
      isUnassigned: !t.assignments.some((a) => a.type === "PRIMARY"),
      timezone,
    };
    const key =
      t.origin === "PROCESS" && t.executionId
        ? "execution:" + t.executionId
        : "task:" + t.id;
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  const counts: Record<string, number> = {
      today: 0,
      overdue: 0,
      unassigned: 0,
      completed: 0,
      upcoming: 0,
    },
    summaries: Record<string, ReturnType<typeof boardState>> = {};
  const executions = await prisma.processExecution.findMany({
    where: {
      organizationId: c.organizationId,
      id: {
        in: [
          ...new Set(
            rows.flatMap((t) => (t.executionId ? [t.executionId] : [])),
          ),
        ],
      },
    },
    select: {
      id: true,
      status: true,
      availableAt: true,
      tasks: {
        where: { deletedAt: null },
        select: {
          required: true,
          status: true,
          startedAt: true,
          approvalWorkflow: { select: { status: true } },
        },
      },
    },
  });
  const executionById = new Map(executions.map((e) => [e.id, e]));
  for (const [key, tasks] of groups.entries()) {
    const summary = boardState(tasks, now.getTime());
    const execution = key.startsWith("execution:")
      ? executionById.get(key.slice(10))
      : undefined;
    if (execution) {
      const executionStatus = resolveExecutionStatus(execution, now);
      const required = execution.tasks.filter((t) => t.required);
      Object.assign(summary, {
        executionStatus,
        requiredTotal: required.length,
        requiredCompleted: required.filter(
          (t) =>
            t.status === "COMPLETED" &&
            (!t.approvalWorkflow || t.approvalWorkflow.status === "APPROVED"),
        ).length,
        completedTasks: tasks.filter((t) => t.status === "COMPLETED").length,
      });
      if (executionStatus === "COMPLETED") {
        summary.column = "completed";
        summary.attention = false;
      } else if (summary.column === "completed") summary.column = "today";
    }
    counts[summary.column]++;
    summaries[key] = summary;
  }
  return { counts, summaries };
}
export async function searchTasks(c: AuthenticatedContext, term: string) {
  const rows = await prisma.task.findMany({
    where: {
      AND: [
        readable(c),
        {
          OR: [
            { title: { contains: term, mode: "insensitive" as const } },
            {
              location: {
                name: { contains: term, mode: "insensitive" as const },
              },
            },
            {
              process: {
                name: { contains: term, mode: "insensitive" as const },
              },
            },
            {
              execution: {
                process: {
                  name: { contains: term, mode: "insensitive" as const },
                },
              },
            },
          ],
        },
      ],
    },
    include: includeTask,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 20,
  });
  return Promise.all(rows.map((t) => project(t, c)));
}

function encodeCursor(t: {
  id: string;
  priority: string;
  deadlineAt: Date | null;
}) {
  return Buffer.from(
    JSON.stringify({
      id: t.id,
      priority: t.priority,
      date: t.deadlineAt?.toISOString() ?? null,
    }),
  ).toString("base64url");
}
function cursorWhere(cursor: string): Prisma.TaskWhereInput {
  let parsed: {
    id: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    date: string | null;
  };
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.priority) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(parsed.id) ||
      (parsed.date !== null && !Number.isFinite(Date.parse(parsed.date)))
    )
      throw new Error();
  } catch {
    fail(400, "CURSOR_INVALID", "Atualize a lista para continuar.");
  }
  return {
    OR: [
      {
        priority: {
          in: (
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Array<
              "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
            >
          ).slice(
            0,
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(parsed.priority),
          ),
        },
      },
      ...(parsed.date
        ? [
            {
              priority: parsed.priority,
              deadlineAt: { gt: new Date(parsed.date) },
            },
            { priority: parsed.priority, deadlineAt: null },
            {
              priority: parsed.priority,
              deadlineAt: new Date(parsed.date),
              id: { gt: parsed.id },
            },
          ]
        : [
            {
              priority: parsed.priority,
              deadlineAt: null,
              id: { gt: parsed.id },
            },
          ]),
    ],
  };
}

function historyCursor(cursor: string): Prisma.TaskWhereInput {
  let c: { date: string; id: string };
  try {
    c = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      !Number.isFinite(Date.parse(c.date)) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(c.id)
    )
      throw new Error();
  } catch {
    fail(400, "CURSOR_INVALID", "Atualize o histórico.");
  }
  return {
    OR: [
      { updatedAt: { lt: new Date(c.date) } },
      { updatedAt: new Date(c.date), id: { lt: c.id } },
    ],
  };
}
