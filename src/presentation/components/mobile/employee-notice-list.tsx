import { CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { markNotificationReadAction, markNotificationReadAndNavigateAction } from "@/presentation/actions/notification-actions";
import { noticeTime } from "@/presentation/lib/notice-time";

export function EmployeeNoticeList({ notifications }: { notifications: Array<{
  id: string; title: string; message: string; priority: string; readAt: string | Date | null; createdAt: Date;
  destination: { taskId?: string | null; executionId?: string | null };
}> }) {
  return <div className="employee-notice-list">{notifications.map(n => {
    const hasDestination = !!(n.destination.taskId || n.destination.executionId);
    return <form key={n.id} action={hasDestination ? markNotificationReadAndNavigateAction : markNotificationReadAction}>
      <input type="hidden" name="id" value={n.id} />
      <button type="submit" className="employee-notice-card" aria-label={`${n.readAt ? "Lido" : "Não lido"}. ${n.title}`}>
        <span className="employee-notice-copy">
          {(n.priority === "HIGH" || n.priority === "CRITICAL") && <Badge variant={n.priority === "CRITICAL" ? "destructive" : "secondary"}>{n.priority === "CRITICAL" ? "Crítico" : "Prioridade alta"}</Badge>}
          <strong data-unread={!n.readAt || undefined}>{n.title}</strong><span>{n.message}</span>
        </span>
        <span className="employee-notice-meta" data-unread={!n.readAt || undefined}>
          <time dateTime={n.createdAt.toISOString()} title={n.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}>{noticeTime(n.createdAt)}</time>
          {n.readAt ? <CheckCheck aria-label="Lido" /> : <span className="employee-notice-dot" aria-label="Não lido" />}
        </span>
      </button>
    </form>;
  })}</div>;
}
