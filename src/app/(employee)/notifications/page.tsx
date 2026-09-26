import Link from "next/link";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { markNotificationReadAction } from "@/presentation/actions/notification-actions";
import { Bell, CheckCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    >
      <div className="page-stack">
        <PageHeader
          title="Avisos"
          subtitle={
            unread
              ? `${unread} avisos ainda não lidos. Acompanhe as mudanças da sua operação.`
              : "Todos os avisos estão em dia. O histórico continua disponível abaixo."
          }
          actions={
            <form action={markNotificationReadAction} className="w-full md:w-fit">
              <Button variant="outline" disabled={!unread} className={"w-full"}>
                <CheckCheck data-icon="inline-start" />
                Marcar todos como lidos
              </Button>
            </form>
          }
        />

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
              className={"flex-1"}
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
            {notifications.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex flex-col justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col items-start gap-2">
                      {!n.readAt && <Badge>Novo</Badge>}
                      <h2 className="text-card-title font-semibold">
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

                  {!n.readAt && (
                    <form action={markNotificationReadAction} className="w-full md:w-fit">
                      <input type="hidden" name="id" value={n.id} />

                      <Button variant="outline" size="sm" className="w-full">
                        Marcar como lido
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            ))}
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