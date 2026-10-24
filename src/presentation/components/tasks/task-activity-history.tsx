"use client";

import { useState } from "react";
import { uiLabel } from "../shared/ui-labels";
import { activityActor, viewersWithoutClaim, viewMetadata, type TaskActivity } from "@/presentation/lib/task-activity";
import { Button } from "@/components/ui/button";

import { formatDateTimeInTimezone } from "@/domain/rules/date-time";

function timestamp(value: Date | string, timezone?: string | null) {
  return formatDateTimeInTimezone(value, timezone, { includeSeconds: true });
}

export function TaskActivityHistory({
  logs,
  assignedMemberIds,
  timezone,
}: {
  logs: TaskActivity[];
  assignedMemberIds: string[];
  timezone?: string | null;
}) {
  const [visible, setVisible] = useState(20);
  const viewers = viewersWithoutClaim(logs, assignedMemberIds);
  return (
    <div className="flex flex-col gap-3 text-xs">
      {viewers.length > 0 && (
        <div className="rounded-lg border border-[var(--border-subtle)] p-3">
          <p className="font-semibold">Visualizaram e não assumiram</p>
          <p className="mt-1 text-muted-foreground">Abriram quando a tarefa estava sem responsável.</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {viewers.map((log) => (
              <li key={log.actorId} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words">{activityActor(log)}</span>
                <time dateTime={new Date(log.createdAt).toISOString()} className="text-muted-foreground">{timestamp(log.createdAt, timezone)}</time>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="divide-y divide-[var(--border-subtle)]">
        {logs.slice(0, visible).map((log) => (
          <div key={log.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--text-primary)]">{uiLabel(log.action)}</p>
              <p className="break-words text-muted-foreground">Por: {activityActor(log)}</p>
              {log.action.toUpperCase() === "TASK_VIEWED" && viewMetadata(log)?.wasUnassigned === true && <p className="text-muted-foreground">Sem responsável no momento da visualização.</p>}
            </div>
            <time dateTime={new Date(log.createdAt).toISOString()} className="shrink-0 text-muted-foreground">{timestamp(log.createdAt, timezone)}</time>
          </div>
        ))}
      </div>
      {visible < logs.length && <Button type="button" variant="outline" size="sm" onClick={() => setVisible((count) => count + 20)}>Mostrar mais atividades</Button>}
      {logs.length === 0 && <p className="text-muted-foreground">Nenhuma atividade registrada.</p>}
    </div>
  );
}
