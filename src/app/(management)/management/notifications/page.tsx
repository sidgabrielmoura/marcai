import { projectNotices } from "@/application/mobile/notifications";
import Link from "next/link";
import { getManagementContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagementShell } from "@/presentation/components/mobile/management-shell";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationReadAndNavigateAction,
} from "@/presentation/actions/notification-actions";
import { Bell, CheckCheck, ClockAlert, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PushNotificationBanner } from "@/presentation/components/shared/push-notification-banner";
import { redirect } from "next/navigation";

export default async function ManagementNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const c = await getManagementContext();
  if (!c) redirect("/tasks");

  const p = await searchParams;
  const page = Math.min(1000, Math.max(1, Math.trunc(Number(p.page) || 1)));
  const status = ["unread", "read"].includes(p.status ?? "") ? p.status! : "all";

  const where = {
    organizationId: c.organizationId,
    userId: c.userId,
    ...(status === "unread"
      ? { readAt: null }
      : status === "read"
        ? { readAt: { not: null } }
        : {}),
  };

  const [rawNotifications, count, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 20,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        organizationId: c.organizationId,
        userId: c.userId,
        readAt: null,
      },
    }),
  ]);

  const notifications = (await projectNotices(c, rawNotifications)).map((n,i) => ({ ...n, createdAt: rawNotifications[i]!.createdAt }));

  return (
    <ManagementShell
      userName={c.userName}
      orgName={c.organizationName}
      role={c.role}
      userId={c.userId}
    >
      <div className="page-stack">
        <PageHeader
          title="Avisos e Notificações"
          subtitle={
            unread
              ? `${unread} ${unread === 1 ? "notificação não lida" : "notificações não lidas"}. Fique por dentro das aprovações e alertas operacionais.`
              : "Todas as suas notificações estão em dia. O histórico continua disponível abaixo."
          }
          actions={
            <form action={markAllNotificationsReadAction} className="w-full md:w-fit">
              <Button type="submit" variant="outline" disabled={!unread} className="w-full">
                <CheckCheck data-icon="inline-start" />
                Marcar todas como lidas
              </Button>
            </form>
          }
        />

        <PushNotificationBanner />

        <nav className="flex gap-2 max-w-lg" aria-label="Filtrar notificações">
          {[
            ["all", "Todas"],
            ["unread", "Não lidas"],
            ["read", "Lidas"],
          ].map(([value, label]) => (
            <Button
              key={value}
              nativeButton={false}
              variant={status === value ? "default" : "outline"}
              className="flex-1"
              render={
                <Link
                  href={`/management/notifications?status=${value}`}
                  aria-current={status === value ? "page" : undefined}
                />
              }
            >
              {label}
            </Button>
          ))}
        </nav>

        {!notifications.length ? (
          <EmptyState
            title="Nenhum aviso encontrado"
            description="Os alertas operacionais e solicitações de aprovação aparecerão aqui."
            icon={Bell}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => {
              const destination = n.destination;
              const isApproval = n.type === "APPROVAL_REQUESTED" || n.type === "APPROVAL_OVERDUE";
              const taskLink = isApproval && destination.taskId
                ? `/management/approvals?taskId=${destination.taskId}`
                : destination.taskId
                  ? `/management/tasks/${destination.taskId}`
                  : destination.executionId
                    ? `/management/executions?executionId=${destination.executionId}`
                    : null;

              return (
                <Card key={n.id} className={!n.readAt ? "border-[var(--brand-primary)] shadow-sm" : ""}>
                  <CardContent className="flex flex-col justify-between items-start gap-4 p-5">
                    <div className="min-w-0 flex-1 w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        {!n.readAt && <Badge className="bg-[var(--brand-primary)] text-white">Novo</Badge>}
                        {(n.priority === "HIGH" || n.priority === "CRITICAL") && (
                          <Badge variant="destructive">
                            {n.priority === "CRITICAL" ? "Crítico" : "Alta prioridade"}
                          </Badge>
                        )}
                        {isApproval && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-900 border-amber-300">
                            Aguardando Aprovação
                          </Badge>
                        )}
                        {n.type === "TASK_CORRECTION_REQUESTED" && (
                          <Badge variant="destructive">Correção</Badge>
                        )}
                        {n.type === "TASK_OVERDUE" && (
                          <Badge variant="destructive">Prazo Excedido</Badge>
                        )}
                        {n.type === "TASK_EXPIRING_SOON" && (
                          <Badge variant="secondary">Vence em breve</Badge>
                        )}
                        {n.type === "OPERATIONAL_ALERT" && (
                          <Badge variant="destructive">Alerta Operacional</Badge>
                        )}
                        <h2 className="text-[length:var(--type-card-title)] font-semibold w-full mt-1">
                          {n.title}
                        </h2>
                      </div>

                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{n.message}</p>

                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {n.createdAt.toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-fit self-end">
                      {taskLink && (
                        <form
                          action={markNotificationReadAndNavigateAction}
                          className="flex-1 md:flex-initial"
                        >
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="url" value={taskLink} />
                          <Button
                            variant={isApproval ? "default" : "secondary"}
                            size="sm"
                            type="submit"
                            className="w-full"
                          >
                            {isApproval ? "Revisar aprovação" : destination.taskId ? "Ver tarefa" : "Ver execução"}
                            <ArrowRight className="size-3.5 ml-1" />
                          </Button>
                        </form>
                      )}

                      {!n.readAt && (
                        <form
                          action={markNotificationReadAction}
                          className="flex-1 md:flex-initial"
                        >
                          <input type="hidden" name="id" value={n.id} />
                          <Button variant="outline" size="sm" type="submit" className="w-full">
                            Marcar como lida
                          </Button>
                        </form>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <nav
          className="flex justify-between items-center gap-3 pt-4"
          aria-label="Paginação"
        >
          <Button
            variant="outline"
            nativeButton={false}
            disabled={page <= 1}
            render={
              <Link
                href={`/management/notifications?status=${status}&page=${page - 1}`}
              />
            }
          >
            Anterior
          </Button>

          <span className="text-xs text-[var(--text-muted)]">
            Página {page} de {Math.max(1, Math.ceil(count / 20))}
          </span>

          <Button
            variant="outline"
            nativeButton={false}
            disabled={page * 20 >= count}
            render={
              <Link
                href={`/management/notifications?status=${status}&page=${page + 1}`}
              />
            }
          >
            Próxima
          </Button>
        </nav>
      </div>
    </ManagementShell>
  );
}
