export type EarlyExecutionPolicy =
  | "NOT_ALLOWED"
  | "ALLOWED_ANYTIME"
  | "ALLOWED_WITHIN_WINDOW"
  | "ALLOWED_WITH_JUSTIFICATION"
  | "BLOCK"
  | "ALLOW"
  | "ALLOW_AND_LOG"
  | "ALLOW_AND_ALERT";

export interface EarlyExecutionEvaluationParams {
  policy?: EarlyExecutionPolicy | null;
  scheduledOrAvailableAt: Date;
  currentTime?: Date;
  windowMinutes?: number; // padrão 60 minutos se ALLOWED_WITHIN_WINDOW
  justification?: string | null;
}

export interface EarlyExecutionResult {
  allowed: boolean;
  isEarly: boolean;
  reason?: string;
  requireJustification?: boolean;
}

/**
 * Avalia se o início antecipado da tarefa é permitido conforme a política herdada (Item 33).
 * Políticas:
 * - NOT_ALLOWED: Bloqueia início antes do horário programado.
 * - ALLOWED_ANYTIME: Permite iniciar a qualquer momento antes.
 * - ALLOWED_WITHIN_WINDOW: Permite iniciar dentro da janela de tolerância (ex.: 60 min).
 * - ALLOWED_WITH_JUSTIFICATION: Exige justificativa explícita para iniciar antes.
 */
export function evaluateEarlyExecution(params: EarlyExecutionEvaluationParams): EarlyExecutionResult {
  const now = params.currentTime ?? new Date();
  const scheduledTime = params.scheduledOrAvailableAt.getTime();
  const nowTime = now.getTime();

  // Se já atingiu ou passou do horário, não é antecipado
  if (nowTime >= scheduledTime) {
    return { allowed: true, isEarly: false };
  }

  const rawPolicy = params.policy || "NOT_ALLOWED";
  const policy =
    rawPolicy === "BLOCK" ? "NOT_ALLOWED" :
    rawPolicy === "ALLOW" ? "ALLOWED_ANYTIME" :
    rawPolicy === "ALLOW_AND_LOG" ? "ALLOWED_WITH_JUSTIFICATION" :
    rawPolicy === "ALLOW_AND_ALERT" ? "ALLOWED_WITHIN_WINDOW" :
    rawPolicy;

  switch (policy) {
    case "ALLOWED_ANYTIME":
      return { allowed: true, isEarly: true };

    case "ALLOWED_WITHIN_WINDOW": {
      const windowMs = (params.windowMinutes ?? 60) * 60 * 1000;
      if (nowTime >= scheduledTime - windowMs) {
        return { allowed: true, isEarly: true };
      }
      const remainingMinutes = Math.ceil((scheduledTime - windowMs - nowTime) / 60000);
      return {
        allowed: false,
        isEarly: true,
        reason: `Início antecipado permitido apenas com ${params.windowMinutes ?? 60} minutos de antecedência. Aguarde mais ${remainingMinutes} minuto(s).`,
      };
    }

    case "ALLOWED_WITH_JUSTIFICATION": {
      if (params.justification && params.justification.trim().length >= 3) {
        return { allowed: true, isEarly: true };
      }
      return {
        allowed: false,
        isEarly: true,
        requireJustification: true,
        reason: "Esta tarefa exige justificativa para ser iniciada antes do horário previsto.",
      };
    }

    case "NOT_ALLOWED":
    default:
      return {
        allowed: false,
        isEarly: true,
        reason: "Esta tarefa ainda está programada. Aguarde o horário de liberação.",
      };
  }
}
