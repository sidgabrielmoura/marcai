export type MemberAvailability = "AVAILABLE" | "BUSY" | "UNAVAILABLE";
export type ManualAvailabilitySetting = "AUTO" | "AVAILABLE" | "UNAVAILABLE";

export interface CalculateAvailabilityParams {
  memberStatus: string; // ACTIVE, INACTIVE, etc.
  manualSetting?: string | null; // Mantido apenas para compatibilidade de tipos
  inProgressTasksCount: number;
  isWithinOperatingHours: boolean;
}

/**
 * Regra de cálculo de Disponibilidade Operacional 100% Automatizada.
 * O funcionário não define manualmente: o sistema calcula em tempo real
 * com base no status do membro, tarefas em andamento e horário de funcionamento da unidade.
 */
export function calculateMemberAvailability(params: CalculateAvailabilityParams): MemberAvailability {
  if (params.memberStatus !== "ACTIVE") {
    return "UNAVAILABLE";
  }

  // 1. Se estiver fora do horário de funcionamento da unidade, fica indisponível
  if (!params.isWithinOperatingHours) {
    return "UNAVAILABLE";
  }

  // 2. Se já possuir tarefa em andamento (IN_PROGRESS), fica ocupado (BUSY)
  if (params.inProgressTasksCount > 0) {
    return "BUSY";
  }

  // 3. Caso contrário, disponível para receber tarefas
  return "AVAILABLE";
}

/**
 * Ordena membros por prioridade de disponibilidade para atribuição e transferência:
 * 1. AVAILABLE
 * 2. BUSY
 * 3. UNAVAILABLE
 */
export function sortMembersByAvailability<T extends { availability: MemberAvailability; name: string }>(
  members: T[]
): T[] {
  const score: Record<MemberAvailability, number> = {
    AVAILABLE: 0,
    BUSY: 1,
    UNAVAILABLE: 2,
  };

  return [...members].sort((a, b) => {
    const diff = score[a.availability] - score[b.availability];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}
