"use client";

import { useState } from "react";
import { uiLabel } from "../shared/ui-labels";

const labels: Record<string, string> = {
  TASK_COMPLETED: "Tarefa concluída", TASK_SUBMITTED: "Enviada para aprovação",
  TASK_CORRECTION_REQUESTED: "Correção solicitada", APPROVAL_REJECTED: "Correção solicitada",
  TASK_CANCELLED: "Tarefa cancelada", EVIDENCE_SUBMITTED: "Comprovação registrada",
  EVIDENCE_VALIDATION_FAILED: "Comprovação rejeitada", TASK_CLAIMED: "Tarefa assumida",
  TASK_STARTED: "Início registrado", TASK_IMPEDIMENT_REPORTED: "Impedimento registrado",
};

export function TaskTimeline({ events, timezone = "America/Sao_Paulo" }: {
  events: Array<{ id: string; action: string; createdAt: string | Date; actorName?: string | null }>; timezone?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!events.length) return null;
  return <section className="employee-timeline" aria-label="Histórico desta tarefa">
    <h3 className="text-[15px]!">Histórico desta tarefa</h3>
    <ol>{(expanded ? events : events.slice(0, 3)).map((event, index) => <li key={event.id} data-latest={index === 0 || undefined}>
      <strong className="text-xs!">{labels[event.action] ?? labels[event.action.toUpperCase()] ?? uiLabel(event.action) ?? "Atualização da tarefa"}</strong>
      {event.actorName ? <span className="block text-xs text-muted-foreground mt-0.5">Por: {event.actorName}</span> : null}
      <time dateTime={new Date(event.createdAt).toISOString()}>{new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(new Date(event.createdAt))}</time>
    </li>)}</ol>
    {events.length > 3 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? "Ver menos" : `Ver tudo (${events.length})`}
    </button>}
  </section>;
}
