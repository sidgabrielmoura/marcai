export type SlaStartEvent = "ON_AVAILABLE" | "ON_FIRST_START" | "ON_SCHEDULED";

export interface SlaDueCalculationParams {
  startEvent: SlaStartEvent;
  scheduledAt?: Date | null;
  availableAt?: Date | null;
  firstStartedAt?: Date | null;
  slaDurationMinutes: number;
}

/**
 * Calcula a data limite de SLA baseado no evento disparador configurado (Item 29).
 */
export function calculateSlaDueDate(params: SlaDueCalculationParams): Date | null {
  if (!params.slaDurationMinutes || params.slaDurationMinutes <= 0) {
    return null;
  }

  let baseDate: Date | null = null;

  switch (params.startEvent) {
    case "ON_SCHEDULED":
      baseDate = params.scheduledAt ?? params.availableAt ?? null;
      break;
    case "ON_FIRST_START":
      // Operação direta: sem necessidade de clique de início, o SLA conta a partir de availableAt / scheduledAt
      baseDate = params.firstStartedAt ?? params.availableAt ?? params.scheduledAt ?? null;
      break;
    case "ON_AVAILABLE":
    default:
      baseDate = params.availableAt ?? params.scheduledAt ?? null;
      break;
  }

  if (!baseDate) {
    return null;
  }

  return new Date(baseDate.getTime() + params.slaDurationMinutes * 60000);
}

/**
 * Calcula os minutos efetivos consumidos de SLA descontando períodos de pausa e bloqueio (Item 29, 30).
 */
export function calculateEffectiveSlaConsumptionMinutes(
  slaStartedAt: Date,
  now: Date,
  pausedSeconds: number = 0
): number {
  const totalElapsedSeconds = Math.max(0, Math.floor((now.getTime() - slaStartedAt.getTime()) / 1000));
  const activeSeconds = Math.max(0, totalElapsedSeconds - pausedSeconds);
  return Math.floor(activeSeconds / 60);
}
