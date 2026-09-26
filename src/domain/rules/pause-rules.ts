export const PAUSE_CATEGORIES = {
  INTERVALO: "Intervalo",
  MATERIAL_FALTANTE: "Falta de material",
  EQUIPAMENTO_QUEBRADO: "Equipamento com defeito",
  ACESSO_BLOQUEADO: "Local sem acesso",
  OUTROS: "Outro motivo",
} as const;

export type PauseCategory = keyof typeof PAUSE_CATEGORIES;

export interface PauseEvaluationParams {
  startedAt: Date;
  now?: Date;
  maxPauseDurationMinutes?: number; // Padrão: 30 minutos
}

export interface PauseThresholdResult {
  isLongPause: boolean;
  minutesPaused: number;
  exceededByMinutes: number;
}

/**
 * Avalia se uma pausa em andamento ultrapassou o tempo limite configurado (Item 20).
 */
export function evaluatePauseThreshold(params: PauseEvaluationParams): PauseThresholdResult {
  const now = params.now ?? new Date();
  const limitMinutes = params.maxPauseDurationMinutes ?? 30;
  const minutesPaused = Math.floor((now.getTime() - params.startedAt.getTime()) / 60000);
  const exceededByMinutes = Math.max(0, minutesPaused - limitMinutes);

  return {
    isLongPause: minutesPaused >= limitMinutes,
    minutesPaused,
    exceededByMinutes,
  };
}
