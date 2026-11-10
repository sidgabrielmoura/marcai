import { z } from "zod";
import { isLocationOpenAt, type LocationOperatingRules } from "./operating-hours";

export const progressiveMilestoneTargetSchema = z.enum(["MANAGERS", "OPERATORS", "BOTH"]);
export type ProgressiveMilestoneTarget = z.infer<typeof progressiveMilestoneTargetSchema>;

export const progressiveMilestoneSchema = z.object({
  id: z.string().min(1),
  stepIndex: z.number().int().min(1),
  title: z.string().trim().min(1).max(100),
  offsetMinutes: z.number().int().min(1).max(10080), // Tempo relativo após a última notificação (ou após tolerância para o 1º)
  target: progressiveMilestoneTargetSchema.default("BOTH"),
  message: z.string().trim().min(1).max(500),
  repeatCount: z.number().int().min(0).max(10).default(0), // Quantidade de repetições
  repeatIntervalMinutes: z.number().int().min(1).max(1440).default(5), // Intervalo entre repetições
});

export type ProgressiveMilestone = z.infer<typeof progressiveMilestoneSchema>;

export const progressiveMilestonesListSchema = z.array(progressiveMilestoneSchema).min(1).max(10);

/**
 * Padrão recomendado de marcos sequenciais progressivos
 */
export const DEFAULT_PROGRESSIVE_MILESTONES: ProgressiveMilestone[] = [
  {
    id: "m_1",
    stepIndex: 1,
    title: "1º Marco: Início do atraso",
    offsetMinutes: 15,
    target: "BOTH",
    message: "A tarefa atingiu o limite de tolerância e encontra-se em atraso.",
    repeatCount: 1,
    repeatIntervalMinutes: 10,
  },
  {
    id: "m_2",
    stepIndex: 2,
    title: "2º Marco: Atenção moderada",
    offsetMinutes: 15,
    target: "BOTH",
    message: "Atenção: tarefa permanece atrasada e requer acompanhamento.",
    repeatCount: 1,
    repeatIntervalMinutes: 15,
  },
  {
    id: "m_3",
    stepIndex: 3,
    title: "3º Marco: Atraso crítico",
    offsetMinutes: 30,
    target: "MANAGERS",
    message: "Atraso crítico: intervenção da gestão solicitada imediatamente.",
    repeatCount: 2,
    repeatIntervalMinutes: 15,
  },
];

/**
 * Normaliza e resolve as configurações de marcos progressivos da organização
 */
export function resolveProgressiveMilestones(settings: unknown): ProgressiveMilestone[] {
  const rawObj = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : null;

  if (rawObj?.progressiveMilestones) {
    const parsed = progressiveMilestonesListSchema.safeParse(rawObj.progressiveMilestones);
    if (parsed.success && parsed.data.length > 0) {
      return [...parsed.data].sort((a, b) => a.stepIndex - b.stepIndex);
    }
  }

  // Fallback retroativo a partir de delayMilestones: number[]
  if (Array.isArray(rawObj?.delayMilestones) && rawObj.delayMilestones.length > 0) {
    const sortedMinutes = [...rawObj.delayMilestones]
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (sortedMinutes.length > 0) {
      return sortedMinutes.map((absoluteMin, index) => {
        const prevAbsolute = index === 0 ? 0 : sortedMinutes[index - 1];
        const offsetMinutes = Math.max(1, absoluteMin - prevAbsolute);
        const stepIndex = index + 1;
        const isLast = index === sortedMinutes.length - 1;

        return {
          id: `m_${stepIndex}`,
          stepIndex,
          title: `${stepIndex}º Marco de Atraso`,
          offsetMinutes,
          target: isLast ? "MANAGERS" : "BOTH",
          message: isLast
            ? "Atraso crítico: intervenção da gestão solicitada imediatamente."
            : `Alerta de atraso: prazo excedido há ${absoluteMin} minutos.`,
          repeatCount: isLast ? 2 : 1,
          repeatIntervalMinutes: 10,
        };
      });
    }
  }

  return DEFAULT_PROGRESSIVE_MILESTONES;
}

export interface TaskAlertExecutionRecord {
  milestoneStep: number;
  round: number;
  sentAt: Date;
}

export interface NextMilestoneEvaluation {
  shouldDispatch: boolean;
  milestone: ProgressiveMilestone | null;
  isRepeat: boolean;
  round: number;
  reason?: string;
  nextScheduledAt?: Date | null;
}

/**
 * Avalia estritamente a ordem dos marcos:
 * 1. O marco 1 só dispara após a tolerância + offsetMinutes do marco 1.
 * 2. Se o marco atual tiver repetições (repeatCount > 0), ele executa cada repetição espaçada por repeatIntervalMinutes.
 * 3. SOMENTE quando a última repetição do marco atual for concluída, o próximo marco começa a contar seu offsetMinutes.
 * 4. Silencia se a unidade estiver fora do horário de funcionamento.
 */
export function evaluateStrictProgressiveMilestone(params: {
  deadlineAt: Date | null;
  slaDueAt: Date | null;
  toleranceMinutes: number | null;
  milestones: ProgressiveMilestone[];
  history: TaskAlertExecutionRecord[];
  location?: LocationOperatingRules | null;
  now?: Date;
}): NextMilestoneEvaluation {
  const now = params.now ?? new Date();
  const sortedMilestones = [...params.milestones].sort((a, b) => a.stepIndex - b.stepIndex);

  if (!sortedMilestones.length) {
    return { shouldDispatch: false, milestone: null, isRepeat: false, round: 0, reason: "NO_MILESTONES" };
  }

  // 1. Silenciar fora do horário de funcionamento da unidade (sempre ativo)
  if (params.location && !isLocationOpenAt(params.location, now)) {
    return {
      shouldDispatch: false,
      milestone: null,
      isRepeat: false,
      round: 0,
      reason: "OUTSIDE_BUSINESS_HOURS",
    };
  }

  // Determinar instante base de vencimento + tolerância
  const dueDates = [params.deadlineAt?.getTime(), params.slaDueAt?.getTime()].filter(
    (v): v is number => v !== undefined && !Number.isNaN(v)
  );
  if (!dueDates.length) {
    return { shouldDispatch: false, milestone: null, isRepeat: false, round: 0, reason: "NO_DUE_DATE" };
  }

  const baseDueAt = Math.min(...dueDates);
  const toleranceMs = (params.toleranceMinutes ?? 20) * 60_000;
  const toleranceExpiredAt = baseDueAt + toleranceMs;

  // Se a tolerância da tarefa ainda não expirou, nenhum marco é disparado
  if (now.getTime() < toleranceExpiredAt) {
    return {
      shouldDispatch: false,
      milestone: sortedMilestones[0],
      isRepeat: false,
      round: 0,
      nextScheduledAt: new Date(toleranceExpiredAt + sortedMilestones[0].offsetMinutes * 60_000),
      reason: "TOLERANCE_NOT_EXPIRED",
    };
  }

  // Se nunca houve nenhum envio para esta tarefa
  if (!params.history.length) {
    const firstMilestone = sortedMilestones[0];
    const firstDispatchAt = toleranceExpiredAt + firstMilestone.offsetMinutes * 60_000;

    if (now.getTime() >= firstDispatchAt) {
      return {
        shouldDispatch: true,
        milestone: firstMilestone,
        isRepeat: false,
        round: 0,
      };
    }

    return {
      shouldDispatch: false,
      milestone: firstMilestone,
      isRepeat: false,
      round: 0,
      nextScheduledAt: new Date(firstDispatchAt),
      reason: "WAITING_FIRST_MILESTONE_OFFSET",
    };
  }

  // Histórico ordenado cronologicamente
  const sortedHistory = [...params.history].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  const lastRecord = sortedHistory[sortedHistory.length - 1];

  // Identificar o marco atual a partir do último envio
  const currentMilestoneIndex = sortedMilestones.findIndex((m) => m.stepIndex === lastRecord.milestoneStep);
  if (currentMilestoneIndex === -1) {
    return { shouldDispatch: false, milestone: null, isRepeat: false, round: 0, reason: "UNKNOWN_MILESTONE_IN_HISTORY" };
  }

  const currentMilestone = sortedMilestones[currentMilestoneIndex];

  // Quantidade de envios já realizados para este marco específico
  const recordsForCurrentMilestone = sortedHistory.filter((r) => r.milestoneStep === currentMilestone.stepIndex);
  const highestRoundDone = Math.max(...recordsForCurrentMilestone.map((r) => r.round), 0);

  // A) O marco atual ainda possui repetições pendentes?
  if (highestRoundDone < currentMilestone.repeatCount) {
    const nextRound = highestRoundDone + 1;
    const nextRepeatAt = new Date(lastRecord.sentAt.getTime() + currentMilestone.repeatIntervalMinutes * 60_000);

    if (now.getTime() >= nextRepeatAt.getTime()) {
      return {
        shouldDispatch: true,
        milestone: currentMilestone,
        isRepeat: true,
        round: nextRound,
      };
    }

    return {
      shouldDispatch: false,
      milestone: currentMilestone,
      isRepeat: true,
      round: nextRound,
      nextScheduledAt: nextRepeatAt,
      reason: "WAITING_REPEAT_INTERVAL",
    };
  }

  // B) O marco atual completou todas as repetições. Existe um próximo marco na timeline?
  const nextMilestoneIndex = currentMilestoneIndex + 1;
  if (nextMilestoneIndex >= sortedMilestones.length) {
    // Todos os marcos da timeline foram inteiramente concluídos
    return {
      shouldDispatch: false,
      milestone: null,
      isRepeat: false,
      round: 0,
      reason: "ALL_MILESTONES_COMPLETED",
    };
  }

  const nextMilestone = sortedMilestones[nextMilestoneIndex];
  // O próximo marco começa a contar o seu offsetMinutes APÓS a última notificação do marco anterior!
  const nextMilestoneDispatchAt = new Date(lastRecord.sentAt.getTime() + nextMilestone.offsetMinutes * 60_000);

  if (now.getTime() >= nextMilestoneDispatchAt.getTime()) {
    return {
      shouldDispatch: true,
      milestone: nextMilestone,
      isRepeat: false,
      round: 0,
    };
  }

  return {
    shouldDispatch: false,
    milestone: nextMilestone,
    isRepeat: false,
    round: 0,
    nextScheduledAt: nextMilestoneDispatchAt,
    reason: "WAITING_NEXT_MILESTONE_OFFSET",
  };
}
