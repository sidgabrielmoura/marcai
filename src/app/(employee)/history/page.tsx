import { EmployeeHistoryFilters } from "@/presentation/components/mobile/employee-filters";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { taskScope, isManagement } from "@/application/security/operational-scope";
import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/database/prisma";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { EmployeeHistoryList, type HistoryTaskItem } from "@/presentation/components/mobile/employee-history-list";
import { Button } from "@/components/ui/button";

import {
  formatDateInTimezone,
  resolveEffectiveTimezone,
} from "@/domain/rules/date-time";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; period?: string; page?: string }>;
}) {
  const c = await getAuthenticatedContext();
  if (!c) return null;
  if (isManagement(c)) redirect("/management/executions");

  const p = await searchParams;
  const period = ["7", "30", "90", "365"].includes(p.period ?? "") ? p.period! : "30";
  const status = ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(p.status ?? "") ? p.status! : "ALL";
  const page = Math.max(1, Number(p.page) || 1);

  const where: Prisma.TaskWhereInput = {
    ...taskScope(c),
    deletedAt: null,
    status: status === "ALL" ? { in: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] } : (status as "COMPLETED"),
    updatedAt: { gte: new Date(Date.now() - Number(period) * 86400000) },
  };

  const [tasks, count] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        location: { select: { name: true, timezone: true } },
        execution: { select: { routine: { select: { timezone: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      skip: (page - 1) * 20,
    }),
    prisma.task.count({ where }),
  ]);

  const formattedTasks: HistoryTaskItem[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    locationName: t.location?.name || null,
    dateLabel: formatDateInTimezone(
      t.completedAt ?? t.cancelledAt ?? t.updatedAt,
      resolveEffectiveTimezone({
        routineTimezone: t.execution?.routine?.timezone,
        locationTimezone: t.location?.timezone,
      }),
    ),
  }));

  const url = (n: number) => `/history?period=${period}&status=${status}&page=${n}`;

  return (
    <EmployeeShell userName={c.userName} orgName={c.organizationName} role={c.role}>
      <div className="page-stack">
        <PageHeader
          title="Histórico de tarefas"
          subtitle="Consulte entregas, cancelamentos e impedimentos da sua operação."
        />
        <EmployeeHistoryFilters period={period} status={status} />

        {!formattedTasks.length ? (
          <EmptyState
            title="Nenhuma tarefa neste período"
            description="Experimente ampliar o período ou escolher outro resultado."
          />
        ) : (
          <EmployeeHistoryList tasks={formattedTasks} />
        )}

        <nav className="flex justify-between items-center gap-3" aria-label="Paginação do histórico">
          <Button variant="outline" nativeButton={false} disabled={page <= 1} render={<Link href={url(page - 1)} />}>
            Anterior
          </Button>
          <span className="text-caption">
            Página {page} de {Math.max(1, Math.ceil(count / 20))}
          </span>
          <Button variant="outline" nativeButton={false} disabled={page * 20 >= count} render={<Link href={url(page + 1)} />}>
            Próxima
          </Button>
        </nav>
      </div>
    </EmployeeShell>
  );
}

