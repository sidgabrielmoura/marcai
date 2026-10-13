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

export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  ExecutionStatus.COMPLETED,
  ExecutionStatus.CANCELLED,
  ExecutionStatus.NOT_COMPLETED,
];

export function isExecutionTerminal(status: ExecutionStatus | string): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status as ExecutionStatus);
}

export function isExecutionPending(status: ExecutionStatus | string): boolean {
  return !isExecutionTerminal(status);
}

/**
 * Avalia se uma nova execução deve ser gerada para a rotina conforme a política de pendências:
 * - CREATE_NEW: Gera nova execução normalmente, mesmo se a anterior estiver pendente.
 * - SKIP_IF_PENDING: Pula a geração da ocorrência se a execução anterior ainda estiver pendente (não finalizada).
 * - BLOCK_NEW: Bloqueia a geração com erro impeditivo até que a anterior seja finalizada.
 */
export function canGenerateExecutionForRoutine(
  policy?: PendingPreviousPolicy | "CREATE_NEW" | "SKIP_IF_PENDING" | "BLOCK_NEW",
  previousExecution?: PreviousExecutionCheck | null,
  now?: Date
): { shouldGenerate: boolean; reason?: string; action?: "SKIP" | "BLOCK" | "GENERATE" } {
  // Se não há execução anterior, é a primeira ocorrência: sempre gera.
  if (!previousExecution) {
    return { shouldGenerate: true, action: "GENERATE" };
  }

  // Se a execução avaliada for um agendamento futuro em relação ao momento da checagem,
  // ela é a ocorrência futura já agendada e não uma pendência anterior.
  if (now && previousExecution.scheduledAt && previousExecution.scheduledAt > now) {
    return { shouldGenerate: true, action: "GENERATE" };
  }

  // Se a execução anterior já atingiu estado terminal (concluída, cancelada ou não realizada),
  // a pendência não existe mais.
  if (isExecutionTerminal(previousExecution.status)) {
    return { shouldGenerate: true, action: "GENERATE" };
  }

  // A execução anterior está pendente (ex: SCHEDULED, AVAILABLE, IN_PROGRESS, PAUSED, NEEDS_CORRECTION, PENDING_REVIEW).
  switch (policy) {
    case "SKIP_IF_PENDING":
      return {
        shouldGenerate: false,
        action: "SKIP",
        reason: "A execução anterior ainda está pendente. Esta ocorrência foi pulada conforme a política da rotina.",
      };
    case "BLOCK_NEW":
      return {
        shouldGenerate: false,
        action: "BLOCK",
        reason: "A execução anterior ainda está pendente. Conclua-a ou altere a regra de pendência na rotina para prosseguir.",
      };
    case "CREATE_NEW":
    default:
      return { shouldGenerate: true, action: "GENERATE" };
  }
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
