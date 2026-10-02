import { PendingPreviousPolicy, ExecutionStatus } from "@prisma/client";

export interface RoutineDefinition {
  id: string;
  processId: string;
  recurrenceRule: string; // Ex: "DAILY", "WEEKDAYS", "MON,WED,FRI"
  startsAt: Date;
  endsAt: Date | null;
  generationLeadTime: number; // minutos antes do agendamento para gerar
  pendingPreviousPolicy: PendingPreviousPolicy;
  status: string;
}

export interface PreviousExecutionCheck {
  id: string;
  status: ExecutionStatus;
  scheduledAt: Date;
}

/**
 * Avalia se uma nova execução deve ser gerada para a rotina baseado na política de pendência anterior.
 */
export function canGenerateExecutionForRoutine(
  policy: PendingPreviousPolicy,
  previousExecution?: PreviousExecutionCheck | null
): { shouldGenerate: boolean; reason?: string; action?: "SKIP" | "BLOCK" | "GENERATE" } {
  if (!previousExecution) {
    return { shouldGenerate: true, action: "GENERATE" };
  }

  const pendingStatuses: ExecutionStatus[] = [
    ExecutionStatus.SCHEDULED,
    ExecutionStatus.AVAILABLE,
    ExecutionStatus.IN_PROGRESS,
    ExecutionStatus.PAUSED,
    ExecutionStatus.NEEDS_CORRECTION,
    ExecutionStatus.PENDING_REVIEW,
  ];

  const isPending = pendingStatuses.includes(previousExecution.status);

  if (!isPending) {
    return { shouldGenerate: true, action: "GENERATE" };
  }

  if (policy === "SKIP_IF_PENDING") {
    return {
      shouldGenerate: false,
      action: "SKIP",
      reason: `Execução anterior (${previousExecution.id}) ainda está pendente com status ${previousExecution.status}. Ocorrência pulada (SKIP_IF_PENDING).`,
    };
  }

  if (policy === "BLOCK_NEW") {
    return {
      shouldGenerate: false,
      action: "BLOCK",
      reason: `Execução anterior (${previousExecution.id}) pendente. Nova execução bloqueada (BLOCK_NEW).`,
    };
  }

  // CREATE_NEW: sempre gera
  return { shouldGenerate: true, action: "GENERATE" };
}

/**
 * Determina o status da execução com base no horário programado vs instante atual (Item 11: SCHEDULED -> AVAILABLE)
 */
export function resolveExecutionInitialStatus(
  scheduledAt: Date,
  now: Date = new Date()
): ExecutionStatus {
  if (scheduledAt <= now) {
    return ExecutionStatus.IN_PROGRESS;
  }
  return ExecutionStatus.SCHEDULED;
}
