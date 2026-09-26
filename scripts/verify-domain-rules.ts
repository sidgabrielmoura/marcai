import { canStartTask, isManagerInScope, canCompleteTask, canAccessTask } from "../src/domain/rules/task-rules";
import { ManagerScope } from "../src/domain/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  } else {
    console.log(`✔ PASSOU: ${message}`);
  }
}

console.log("=== INICIANDO TESTES DE INVARIANTES E REGRAS DE DOMÍNIO ===");

// 1. Invariante: Abrir a tela nunca inicia; apenas AVAILABLE / NEEDS_CORRECTION iniciam
assert(canStartTask("AVAILABLE").allowed === true, "Tarefa AVAILABLE pode ser iniciada");
assert(canStartTask("NEEDS_CORRECTION").allowed === true, "Tarefa NEEDS_CORRECTION pode ser reiniciada");
assert(canStartTask("BLOCKED").allowed === false, "Tarefa BLOCKED não pode ser iniciada");
assert(canStartTask("COMPLETED").allowed === false, "Tarefa COMPLETED não pode ser reiniciada");
assert(canStartTask("IN_PROGRESS").allowed === false, "Tarefa IN_PROGRESS não pode ser duplamente iniciada");

// 2. Invariante: Escopo de MANAGER (D-06: Interseção estrita AND)
const managerScope: ManagerScope = {
  locationIds: ["loc-centro", "loc-bairro"],
  teamIds: ["team-manha"],
};

// Caso 1: Tarefa na Unidade permitida E na Equipe permitida -> PERMITIDO
assert(
  isManagerInScope(managerScope, "loc-centro", "team-manha") === true,
  "Manager acessa recurso quando Unidade E Equipe estão no escopo (AND)"
);

// Caso 2: Tarefa na Unidade permitida, mas em OUTRA Equipe -> NEGADO (Interseção estrita)
assert(
  isManagerInScope(managerScope, "loc-centro", "team-noite") === false,
  "Manager NÃO acessa tarefa de outra equipe, mesmo na mesma unidade"
);

// Caso 3: Tarefa na Equipe permitida, mas em OUTRA Unidade -> NEGADO
assert(
  isManagerInScope(managerScope, "loc-shopping", "team-manha") === false,
  "Manager NÃO acessa tarefa em unidade não autorizada, mesmo na mesma equipe"
);

// 3. Invariante: Evidência com Regra das 3 Falhas (D-05)
// Caso 1: Evidência obrigatória sem envio e com 0 falhas -> BLOQUEADO
const reqPending = [
  { id: "req-1", required: true, validSubmissionsCount: 0, failedAttemptsCount: 0 },
];
assert(
  canCompleteTask("IN_PROGRESS", reqPending).allowed === false,
  "Conclusão bloqueada se evidência obrigatória não possui envio"
);

// Caso 2: Evidência com envio válido -> PERMITIDO
const reqValid = [
  { id: "req-1", required: true, validSubmissionsCount: 1, failedAttemptsCount: 0 },
];
assert(
  canCompleteTask("IN_PROGRESS", reqValid).allowed === true,
  "Conclusão permitida com envio válido de evidência"
);

// Caso 3: Evidência com 3 falhas de validação (D-05: prosseguir com ocorrência crítica)
const req3Fails = [
  { id: "req-1", required: true, validSubmissionsCount: 0, failedAttemptsCount: 3 },
];
const result3Fails = canCompleteTask("IN_PROGRESS", req3Fails);
assert(result3Fails.allowed === true, "Conclusão permitida após 3 falhas de validação");
assert(
  result3Fails.generateOccurrence?.type === "VALIDATION_EXCEPTION" &&
  result3Fails.generateOccurrence?.severity === "CRITICAL",
  "Ocorrência crítica gerada automaticamente na auditoria após 3 falhas"
);

// 4. Invariante: Dependências de Tarefas (Item 13)
import { evaluateTaskDependencies } from "../src/domain/rules/dependency-rules";
import { canPauseTask, canResumeTask, canCancelTask, canReportImpediment, canEditTask } from "../src/domain/rules/task-rules";

// Dependência BLOCKING não concluída -> Bloqueia
const depPending = evaluateTaskDependencies([
  {
    dependsOnTaskId: "task-01",
    dependsOnStatus: "IN_PROGRESS",
    type: "BLOCKING",
    logic: "AND",
  },
]);
assert(depPending.isBlocked === true, "Tarefa com dependência BLOCKING em andamento fica BLOCKED");

// Dependência BLOCKING concluída -> Libera
const depCompleted = evaluateTaskDependencies([
  {
    dependsOnTaskId: "task-01",
    dependsOnStatus: "COMPLETED",
    type: "BLOCKING",
    logic: "AND",
  },
]);
assert(depCompleted.isBlocked === false, "Tarefa com dependência BLOCKING concluída fica liberada");

// Dependência INFORMATIVE não concluída -> Não bloqueia
const depInfo = evaluateTaskDependencies([
  {
    dependsOnTaskId: "task-01",
    dependsOnStatus: "AVAILABLE",
    type: "INFORMATIVE",
    logic: "AND",
  },
]);
assert(depInfo.isBlocked === false, "Dependência INFORMATIVE não bloqueia execução");

// 5. Invariante: Pausa e Retomada de Tarefas (Item 20)
assert(canPauseTask("IN_PROGRESS").allowed === true, "Tarefa IN_PROGRESS pode ser pausada");
assert(canPauseTask("AVAILABLE").allowed === false, "Tarefa AVAILABLE não pode ser pausada sem iniciar");
assert(canResumeTask("PAUSED").allowed === true, "Tarefa PAUSED pode ser retomada");
assert(canResumeTask("IN_PROGRESS").allowed === false, "Tarefa já em andamento não pode ser retomada");

// 6. Invariante: Impedimento Operacional (Item 26)
assert(canReportImpediment("IN_PROGRESS").allowed === true, "Impedimento operacional pode ser registrado em tarefa em andamento");
assert(canReportImpediment("COMPLETED").allowed === false, "Impedimento não pode ser registrado em tarefa concluída");

console.log("=== TODOS OS TESTES DE REGRAS DE DOMÍNIO PASSARAM COM SUCESSO! ===");

