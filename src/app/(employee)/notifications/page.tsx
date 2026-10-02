import Link from "next/link";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import {
  markNotificationReadAction,
  markNotificationReadAndNavigateAction,
} from "@/presentation/actions/notification-actions";
import { Bell, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PushNotificationBanner } from "@/presentation/components/shared/push-notification-banner";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const c = await getAuthenticatedContext();

  if (!c) return null;

  const p = await searchParams,
    page = Math.max(1, Number(p.page) || 1),
    status = ["unread", "read"].includes(p.status ?? "") ? p.status! : "all";

  const where = {
    organizationId: c.organizationId,
    userId: c.userId,
    ...(status === "unread"
      ? { readAt: null }
      : status === "read"
        ? { readAt: { not: null } }
        : {}),
  };

  const [notifications, count, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

  return (
    <EmployeeShell
      userName={c.userName}
      orgName={c.organizationName}
      role={c.role}
      userId={c.userId}
    >
      <div className="page-stack">
        <PageHeader
          title="Avisos"
          subtitle={
            unread
              ? `${unread} ${unread === 1 ? "aviso ainda não lido" : "avisos ainda não lidos"}. Acompanhe as mudanças da sua operação.`
              : "Todos os avisos estão em dia. O histórico continua disponível abaixo."
          }
          actions={
            <form action={markNotificationReadAction} className="w-full md:w-fit">
              <Button variant="outline" disabled={!unread} className="w-full">
                <CheckCheck data-icon="inline-start" />
                Marcar todos como lidos
              </Button>
            </form>
          }
        />

        <PushNotificationBanner />

        <nav className="flex gap-2 max-w-lg" aria-label="Filtrar avisos">
          {[
            ["all", "Todos"],
            ["unread", "Não lidos"],
            ["read", "Lidos"],
          ].map(([value, label]) => (
            <Button
              key={value}
              nativeButton={false}
              variant={status === value ? "default" : "outline"}
              className="flex-1"
              render={
                <Link
                  href={`/notifications?status=${value}`}
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
            title="Nenhum aviso neste filtro"
            description="Os avisos da sua operação aparecerão aqui."
            icon={Bell}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => {
              const data = (n.data as Record<string, any>) || null;
              const taskId = data?.taskId ? String(data.taskId) : null;
              const taskLink = taskId
                ? (c.role === "EMPLOYEE" ? `/tasks/${taskId}` : `/management/tasks/${taskId}`)
                : null;

              return (
                <Card key={n.id}>
                  <CardContent className="flex flex-col justify-between items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!n.readAt && <Badge>Novo</Badge>}
                        {(n.priority === "HIGH" || n.priority === "CRITICAL") && (
                          <Badge variant="destructive">
                            {n.priority === "CRITICAL" ? "Crítico" : "Alta prioridade"}
                          </Badge>
                        )}
                        {n.type === "APPROVAL_REQUESTED" && (
                          <Badge variant="secondary">Aprovação</Badge>
                        )}
                        {n.type === "TASK_CORRECTION_REQUESTED" && (
                          <Badge variant="destructive">Correção</Badge>
                        )}
                        {n.type === "TASK_UNBLOCKED" && (
                          <Badge variant="outline">Liberada</Badge>
                        )}
                        {n.type === "TASK_OVERDUE" && (
                          <Badge variant="destructive">Prazo SLA</Badge>
                        )}
                        {n.type === "TASK_EXPIRING_SOON" && (
                          <Badge variant="secondary">Vence em breve</Badge>
                        )}
                        {n.type === "OPERATIONAL_ALERT" && (
                          <Badge variant="destructive">Impedimento</Badge>
                        )}
                        {n.type === "PAUSE_ALERT" && (
                          <Badge variant="secondary">Pausa</Badge>
                        )}
                        <h2 className="text-card-title font-semibold w-full">
                          {n.title}
                        </h2>
                      </div>

                      <p className="mt-2 text-muted-foreground">{n.message}</p>

                      <p className="mt-2 text-caption text-muted-foreground">
                        {n.createdAt.toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-fit">
                      {taskLink && (
                        <form
                          action={markNotificationReadAndNavigateAction}
                          className="flex-1 md:flex-initial"
                        >
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="url" value={taskLink} />
                          <Button
                            variant="secondary"
                            size="sm"
                            type="submit"
                            className="w-full"
                          >
                            Ver tarefa
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
                            Marcar como lido
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
          className="flex justify-between items-center gap-3"
          aria-label="Paginação"
        >
          <Button
            variant="outline"
            nativeButton={false}
            disabled={page <= 1}
            render={
              <Link
                href={`/notifications?status=${status}&page=${page - 1}`}
              />
            }
          >
            Anterior
          </Button>

          <span className="text-caption">
            Página {page} de {Math.max(1, Math.ceil(count / 20))}
          </span>

          <Button
            variant="outline"
            nativeButton={false}
            disabled={page * 20 >= count}
            render={
              <Link
                href={`/notifications?status=${status}&page=${page + 1}`}
              />
            }
          >
            Próxima
          </Button>
        </nav>
      </div>
    </EmployeeShell>
  );
}