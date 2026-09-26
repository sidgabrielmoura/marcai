import { TaskStatus, ManagerScope, Role } from "../types";

export interface CanStartResult {
  allowed: boolean;
  reason?: string;
}

export interface CanCompleteResult {
  allowed: boolean;
  reason?: string;
  generateOccurrence?: {
    type: "VALIDATION_EXCEPTION";
    category: "EVIDENCE_MAX_ATTEMPTS";
    reason: string;
    severity: "CRITICAL";
  };
}

/**
 * Invariante: Abrir a tela nunca inicia a tarefa.
 * Apenas o clique explícito com validação de status permite iniciar.
 */
export function canStartTask(
  currentStatus: TaskStatus,
  isBlockedByDependency: boolean = false
): CanStartResult {
  if (isBlockedByDependency || currentStatus === "BLOCKED") {
    return {
      allowed: false,
      reason: "Esta tarefa está bloqueada por dependências operacionais não concluídas.",
    };
  }

  if (currentStatus === "IN_PROGRESS") {
    return {
      allowed: false,
      reason: "Esta tarefa já está em andamento.",
    };
  }

  if (currentStatus === "COMPLETED") {
    return {
      allowed: false,
      reason: "Esta tarefa já foi concluída e não pode ser iniciada novamente.",
    };
  }

  if (currentStatus === "CANCELLED" || currentStatus === "NOT_COMPLETED") {
    return {
      allowed: false,
      reason: "Esta tarefa foi cancelada ou encerrada.",
    };
  }

  if (currentStatus === "SUBMITTED") {
    return {
      allowed: false,
      reason: "Esta tarefa está aguardando revisão e aprovação.",
    };
  }

  return currentStatus === "AVAILABLE" || currentStatus === "NEEDS_CORRECTION"
    ? { allowed: true }
    : { allowed: false, reason: "Use Retomar para uma tarefa pausada." };
}

/**
 * Invariante: Escopo de Gestão (D-06).
 * Interseção estrita (AND) entre as equipes e unidades do MANAGER.
 */
export function isManagerInScope(
  scope: ManagerScope,
  taskLocationId: string | null | undefined,
  taskTeamId: string | null | undefined
): boolean {
  // Se o gestor não tiver unidades ou equipes configuradas, escopo vazio = negação
  if (scope.locationIds.length === 0 || scope.teamIds.length === 0) {
    return false;
  }

  if (!taskLocationId || !taskTeamId) return false;

  // Se a tarefa possui unidade definida, deve estar nas unidades do gestor
  if (taskLocationId && !scope.locationIds.includes(taskLocationId)) {
    return false;
  }

  // Se a tarefa possui equipe definida, deve estar nas equipes do gestor
  if (taskTeamId && !scope.teamIds.includes(taskTeamId)) {
    return false;
  }

  return true;
}

/**
 * Validação de permissão de acesso ao recurso por papel e escopo
 */
export function canAccessTask(
  userRole: Role,
  userMemberId: string,
  assignedMemberIds: string[],
  scope?: ManagerScope,
  taskLocationId?: string | null,
  taskTeamId?: string | null
): boolean {
  if (userRole === "OWNER" || userRole === "ADMIN") {
    return true;
  }

  if (userRole === "MANAGER") {
    if (!scope) return false;
    return isManagerInScope(scope, taskLocationId, taskTeamId);
  }

  if (userRole === "EMPLOYEE") {
    // Funcionário acessa se for um dos membros atribuídos ou tarefa sem responsável da sua equipe
    return assignedMemberIds.includes(userMemberId);
  }

  return false;
}

/**
 * Validação para conclusão de tarefa com regra das 3 tentativas (D-05)
 */
export function canCompleteTask(
  currentStatus: TaskStatus,
  requirements: Array<{
    id: string;
    required: boolean;
    validSubmissionsCount: number;
    failedAttemptsCount: number;
    minQuantity?: number;
  }>
): CanCompleteResult {
  if (currentStatus !== "IN_PROGRESS") {
    return {
      allowed: false,
      reason: "Apenas tarefas em andamento podem ser concluídas.",
    };
  }

  let hasMaxAttemptBypass = false;

  for (const req of requirements) {
    if (req.required && req.validSubmissionsCount < (req.minQuantity ?? 1)) {
      if (req.failedAttemptsCount >= 3) {
        // Regra D-05: Permitir continuar e concluir, mas sinalizar ocorrência crítica
        hasMaxAttemptBypass = true;
      } else {
        return {
          allowed: false,
          reason: `Existem evidências obrigatórias pendentes de envio válido (${req.failedAttemptsCount}/3 tentativas).`,
        };
      }
    }
  }

  if (hasMaxAttemptBypass) {
    return {
      allowed: true,
      generateOccurrence: {
        type: "VALIDATION_EXCEPTION",
        category: "EVIDENCE_MAX_ATTEMPTS",
        reason: "Tarefa concluída com dispensa operacional após 3 falhas de validação de evidência obrigatória.",
        severity: "CRITICAL",
      },
    };
  }

  return { allowed: true };
}

/**
 * Validação para pausar tarefa (Item 20)
 * SLA continua correndo durante a pausa.
 */
export function canPauseTask(currentStatus: TaskStatus): CanStartResult {
  if (currentStatus !== "IN_PROGRESS") {
    return {
      allowed: false,
      reason: "Apenas tarefas em andamento podem ser pausadas.",
    };
  }
  return { allowed: true };
}

/**
 * Validação para retomar tarefa pausada (Item 20)
 */
export function canResumeTask(currentStatus: TaskStatus): CanStartResult {
  if (currentStatus !== "PAUSED") {
    return {
      allowed: false,
      reason: "Apenas tarefas pausadas podem ser retomadas.",
    };
  }
  return { allowed: true };
}

/**
 * Validação para cancelamento de tarefa (Item 25)
 */
export function canCancelTask(currentStatus: TaskStatus): CanStartResult {
  if (currentStatus === "COMPLETED") {
    return {
      allowed: false,
      reason: "Tarefas já concluídas não podem ser canceladas.",
    };
  }
  if (currentStatus === "CANCELLED") {
    return {
      allowed: false,
      reason: "Esta tarefa já se encontra cancelada.",
    };
  }
  return { allowed: true };
}

/**
 * Validação para registrar impedimento operacional ("Não foi possível realizar" - Item 26)
 * Situações: Falta de material, Equipamento quebrado, Acesso bloqueado, Indisponibilidade.
 * Ocorrência separada que NÃO impacta a média de atraso de SLA.
 */
export function canReportImpediment(currentStatus: TaskStatus): CanStartResult {
  if (currentStatus === "COMPLETED") {
    return {
      allowed: false,
      reason: "Não é possível registrar impedimento em tarefa já concluída.",
    };
  }
  if (currentStatus === "CANCELLED" || currentStatus === "NOT_COMPLETED") {
    return {
      allowed: false,
      reason: "Esta tarefa já está encerrada.",
    };
  }
  return { allowed: true };
}

/**
 * Validação para edição de tarefa (Item 27)
 * Enquanto não iniciada, gestores podem editar livremente. Após o início, restringe.
 */
export function canEditTask(currentStatus: TaskStatus): CanStartResult {
  if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED" || currentStatus === "NOT_COMPLETED") {
    return {
      allowed: false,
      reason: "Tarefas finalizadas não podem ser editadas.",
    };
  }
  if (!["AVAILABLE", "BLOCKED"].includes(currentStatus)) {
    return {
      allowed: false,
      reason: "A configuração operacional da tarefa não pode ser alterada após o início da execução.",
    };
  }
  return { allowed: true };
}
