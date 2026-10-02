import { notFound } from "next/navigation";
import { getManagementContext } from "@/application/security/auth-context";
import { isManagement, processScope } from "@/application/security/operational-scope";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { nextOccurrence, readSchedule } from "@/domain/rules/schedule";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessDetailClient } from "@/presentation/components/processes/process-detail-client";

export default async function ProcessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getManagementContext();
  if (!context || !isManagement(context)) return notFound();

  const process = await prisma.process.findFirst({
    where: {
      id,
      ...processScope(context),
    },
    include: {
      location: true,
      sourceTemplateVersion: true,
      routines: {
        include: {
          exceptions: {
            orderBy: { date: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      executions: {
        include: {
          tasks: {
            select: {
              id: true,
              title: true,
              status: true,
              required: true,
            },
          },
        },
        orderBy: { scheduledAt: "desc" },
        take: 30,
      },
    },
  });

  if (!process) {
    return notFound();
  }

  // Fetch teams and members in organization to resolve names
  const [teams, members] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: context.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId: context.organizationId, status: "ACTIVE" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const memberMap = new Map(
    members.map((m) => [m.id, m.user?.name || m.user?.email || "Membro"]),
  );

  const parsedDef = readProcessDefinition(process.sourceTemplateVersion?.definition);

  const formattedTasks = (parsedDef?.tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.instructions || "",
    teamName: teamMap.get(t.teamId) || null,
    estimatedMinutes: t.estimatedDuration ?? null,
    required: t.required,
    primaryMemberName: t.primaryMemberId ? memberMap.get(t.primaryMemberId) || null : null,
    approverNames: t.approverIds.map((approverId) => memberMap.get(approverId) || approverId),
  }));

  const now = new Date();

  const formattedRoutines = process.routines.map((r) => {
    const parsedSchedule = readSchedule(r.recurrenceRule);
    const nextAt =
      r.status === "ACTIVE"
        ? nextOccurrence(r.recurrenceRule, r.startsAt, r.endsAt, r.timezone, now)
        : null;

    return {
      id: r.id,
      recurrenceRule: r.recurrenceRule,
      timezone: r.timezone,
      generationLeadTime: r.generationLeadTime,
      pendingPreviousPolicy: r.pendingPreviousPolicy,
      status: r.status,
      nextOccurrenceAt: nextAt ? nextAt.toISOString() : null,
      parsedSchedule,
      exceptions: r.exceptions.map((ex) => ({
        id: ex.id,
        date: ex.date.toISOString(),
        action: ex.action,
        reason: ex.reason,
      })),
    };
  });

  const formattedExecutions = process.executions.map((e) => {
    const totalTasks = e.tasks.length;
    const completedTasks = e.tasks.filter((t) => t.status === "COMPLETED").length;

    return {
      id: e.id,
      status: e.status,
      scheduledAt: e.scheduledAt.toISOString(),
      startedAt: e.startedAt ? e.startedAt.toISOString() : null,
      completedAt: e.completedAt ? e.completedAt.toISOString() : null,
      reopenedAt: e.reopenedAt ? e.reopenedAt.toISOString() : null,
      reopenReason: e.reopenReason,
      cancelledAt: e.cancelledAt ? e.cancelledAt.toISOString() : null,
      cancellationReason: e.cancellationReason,
      totalTasks,
      completedTasks,
      tasks: e.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        required: t.required,
      })),
    };
  });

  const canEdit =
    ["OWNER", "ADMIN"].includes(context.role) ||
    (context.role === "MANAGER" &&
      (!context.scope ||
        (process.locationId && context.scope.locationIds.includes(process.locationId))));

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ProcessDetailClient
        process={{
          id: process.id,
          name: process.name,
          description: process.description,
          status: process.status,
          criticality: process.criticality,
          locationName: process.location?.name || null,
          validFrom: process.validFrom ? process.validFrom.toISOString() : null,
          validUntil: process.validUntil ? process.validUntil.toISOString() : null,
        }}
        routines={formattedRoutines}
        executions={formattedExecutions}
        tasks={formattedTasks}
        userRole={context.role}
        canEdit={Boolean(canEdit)}
      />
    </ManagementShell>
  );
}
