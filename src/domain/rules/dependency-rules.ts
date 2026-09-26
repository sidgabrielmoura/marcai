import { DependencyType, DependencyLogic, TaskStatus } from "../types";

export interface DependencyCheckItem {
  dependsOnTaskId: string;
  dependsOnStatus: TaskStatus;
  dependsOnApprovalStatus?: string | null;
  type: DependencyType;
  logic: DependencyLogic;
}

export interface DependencyEvaluationResult {
  isBlocked: boolean;
  blockingReasons: string[];
}

/**
 * Avalia se as dependências operacionais de uma tarefa estão satisfeitas.
 * - Dependências INFORMATIVE não bloqueiam a execução.
 * - Dependências BLOCKING exigem que a tarefa predecessora esteja COMPLETED.
 * - Dependências APPROVAL_CONDITION exigem que a aprovação da predecessora esteja APPROVED.
 * - Suporta lógica AND (todas necessárias) e OR (pelo menos uma satisfeita).
 */
export function evaluateTaskDependencies(
  dependencies: DependencyCheckItem[]
): DependencyEvaluationResult {
  if (!dependencies || dependencies.length === 0) {
    return { isBlocked: false, blockingReasons: [] };
  }

  // Filtrar apenas as dependências que exercem bloqueio real
  const blockingDeps = dependencies.filter(
    (dep) => dep.type === DependencyType.BLOCKING || dep.type === DependencyType.APPROVAL_CONDITION
  );

  if (blockingDeps.length === 0) {
    return { isBlocked: false, blockingReasons: [] };
  }

  // Separar grupos por lógica: OR vs AND
  const orGroup = blockingDeps.filter((d) => d.logic === DependencyLogic.OR);
  const andGroup = blockingDeps.filter((d) => d.logic === DependencyLogic.AND);

  const blockingReasons: string[] = [];

  // Checagem individual de satisfação
  function isDependencySatisfied(dep: DependencyCheckItem): boolean {
    if (dep.type === DependencyType.APPROVAL_CONDITION) {
      return (
        dep.dependsOnStatus === TaskStatus.COMPLETED &&
        dep.dependsOnApprovalStatus === "APPROVED"
      );
    }
    return dep.dependsOnStatus === TaskStatus.COMPLETED;
  }

  // Grupo AND: Todas devem estar satisfeitas
  for (const dep of andGroup) {
    if (!isDependencySatisfied(dep)) {
      blockingReasons.push(
        dep.type === DependencyType.APPROVAL_CONDITION
          ? `Depende da aprovação da tarefa predecessora (${dep.dependsOnTaskId}).`
          : `Depende da conclusão da tarefa predecessora (${dep.dependsOnTaskId}).`
      );
    }
  }

  // Grupo OR: Pelo menos uma deve estar satisfeita
  if (orGroup.length > 0) {
    const anyOrSatisfied = orGroup.some(isDependencySatisfied);
    if (!anyOrSatisfied) {
      blockingReasons.push(
        "Nenhuma das condições alternativas (OR) de dependência foi concluída ainda."
      );
    }
  }

  const isBlocked = blockingReasons.length > 0;
  return {
    isBlocked,
    blockingReasons,
  };
}
