import { EmployeeNoticeList } from "@/presentation/components/mobile/employee-notice-list";
import { EmployeeNoticeFilters } from "@/presentation/components/mobile/employee-filters";

import { Settings2 } from "lucide-react";
import {projectNotices} from "@/application/mobile/notifications";
import Link from "next/link";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { EmployeeShell } from "@/presentation/components/mobile/employee-shell";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { markAllNotificationsReadAction } from "@/presentation/actions/notification-actions";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PushNotificationBanner } from "@/presentation/components/shared/push-notification-banner";
import { getSession } from "@/infrastructure/security/session";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const c = await getAuthenticatedContext();

  if (!c) return null;

  const p = await searchParams,
    page = Math.min(1000, Math.max(1, Math.trunc(Number(p.page) || 1))),
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

  const notifications=(await projectNotices(c,rawNotifications)).map((n,i)=>({...n,createdAt:rawNotifications[i]!.createdAt}));
  return (
    <EmployeeShell
      userName={c.userName}
      orgName={c.organizationName}
      role={c.role}
      userId={c.userId}
    >
      <div className="page-stack employee-notices">
        <PageHeader
          title="Avisos"
          subtitle="Acompanhe o que precisa da sua atenção."
          actions={<Button variant="outline" size="icon" aria-label="Estado das notificações" render={<Link href="/notification-status" />}><Settings2 /></Button>}
        />

        <PushNotificationBanner sessionId={(await getSession())?.sessionId} />

        <EmployeeNoticeFilters status={status} />
        <form action={markAllNotificationsReadAction} className="employee-notices-mark-all">
          <Button type="submit" variant="ghost" disabled={!unread}><CheckCheck data-icon="inline-start" />Marcar todos como lidos</Button>
        </form>

        {!notifications.length ? (
          <EmptyState
            title="Nenhum aviso neste filtro"
            description="Os avisos da sua operação aparecerão aqui."
            icon={Bell}
          />
        ) : (
          <EmployeeNoticeList notifications={notifications} />
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
