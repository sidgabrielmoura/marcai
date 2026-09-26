import { getManagementContext } from "@/application/security/auth-context";
import { nextOccurrence } from "@/domain/rules/schedule";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { ProcessNavTabs } from "@/presentation/components/processes/process-nav-tabs";
import { RoutinesClient } from "@/presentation/components/processes/routines-client";

export default async function ManagementRoutinesPage() {
  const context = await getManagementContext();
  if (!context) return null;

  const routines = await prisma.routine.findMany({
    where: {
      process: {
        organizationId: context.organizationId,
        ...(context.role === "MANAGER" && context.scope
          ? { locationId: { in: context.scope.locationIds } }
          : {}),
      },
    },
    include: {
      process: { include: { sourceTemplateVersion: true } },
      _count: { select: { executions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const processes = await prisma.process.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ACTIVE",
      ...(context.role === "MANAGER" && context.scope
        ? { locationId: { in: context.scope.locationIds } }
        : {}),
    },
    select: { id: true, name: true },
  });

  return (
    <ManagementShell
      userName={context.userName}
      orgName={context.organizationName}
      role={context.role}
    >
      <ProcessNavTabs />
      <RoutinesClient
        routines={routines.filter(r => context.role !== "MANAGER" || !readProcessDefinition(r.process.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))).map((r) => ({
          id: r.id,
          processId: r.processId,
          processName: r.process.name,
          processStatus: r.process.status,
          nextAt: (() => { try { return nextOccurrence(r.recurrenceRule, r.startsAt, r.endsAt, r.timezone, new Date())?.toISOString() ?? null; } catch { return null; } })(),
          recurrenceRule: r.recurrenceRule,
          timezone: r.timezone,
          generationLeadTime: r.generationLeadTime,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          pendingPreviousPolicy: r.pendingPreviousPolicy,
          status: r.status,
          executionsCount: r._count.executions,
        }))}
        processes={processes}
        userRole={context.role}
      />
    </ManagementShell>
  );
}
