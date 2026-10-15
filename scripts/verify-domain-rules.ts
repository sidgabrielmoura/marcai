import { canStartTask, isManagerInScope, canCompleteTask, canAccessTask, canPauseTask, canResumeTask, canReportImpediment } from "../src/domain/rules/task-rules";
import { calculateMemberAvailability, sortMembersByAvailability } from "../src/domain/rules/member-availability";
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
assert(
  canCompleteTask("AVAILABLE", reqValid).allowed === true,
  "Conclusão direta permitida para tarefa em AVAILABLE com envio válido"
);
assert(
  canCompleteTask("AVAILABLE", reqPending).allowed === false,
  "Conclusão direta bloqueada se evidência obrigatória estiver pendente"
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

// 5. Invariante: Pausa e Retomada de Tarefas (Item 20 - Sistema não permite pausar tarefas)
assert(canPauseTask("IN_PROGRESS").allowed === false, "Sistema não permite pausar tarefas");
assert(canPauseTask("AVAILABLE").allowed === false, "Tarefa AVAILABLE não pode ser pausada");
assert(canResumeTask("PAUSED").allowed === true, "Tarefa PAUSED pode ser retomada");
assert(canResumeTask("IN_PROGRESS").allowed === false, "Tarefa já em andamento não pode ser retomada");

// 6. Invariante: Impedimento Operacional (Item 26)
assert(canReportImpediment("IN_PROGRESS").allowed === true, "Impedimento operacional pode ser registrado em tarefa em andamento");
assert(canReportImpediment("COMPLETED").allowed === false, "Impedimento não pode ser registrado em tarefa concluída");

// 7. Invariante: Disponibilidade Operacional 100% Automatizada
assert(
  calculateMemberAvailability({
    memberStatus: "INACTIVE",
    isWithinOperatingHours: true,
    inProgressTasksCount: 0,
  }) === "UNAVAILABLE",
  "Membro INACTIVE fica UNAVAILABLE mesmo no expediente"
);

assert(
  calculateMemberAvailability({
    memberStatus: "ACTIVE",
    isWithinOperatingHours: false,
    inProgressTasksCount: 0,
  }) === "UNAVAILABLE",
  "Membro ACTIVE fora do expediente fica UNAVAILABLE"
);

assert(
  calculateMemberAvailability({
    memberStatus: "ACTIVE",
    isWithinOperatingHours: true,
    inProgressTasksCount: 2,
  }) === "BUSY",
  "Membro ACTIVE no expediente com tarefas em andamento fica BUSY"
);

assert(
  calculateMemberAvailability({
    memberStatus: "ACTIVE",
    isWithinOperatingHours: true,
    inProgressTasksCount: 0,
  }) === "AVAILABLE",
  "Membro ACTIVE no expediente e sem tarefas ativas fica AVAILABLE"
);

// Ignora qualquer tentativa de override manual
assert(
  calculateMemberAvailability({
    memberStatus: "ACTIVE",
    manualSetting: "UNAVAILABLE",
    isWithinOperatingHours: true,
    inProgressTasksCount: 0,
  }) === "AVAILABLE",
  "Disponibilidade é estritamente automatizada e ignora tentativas de override manual"
);

const sorted = sortMembersByAvailability([
  { id: "1", name: "Zeca", availability: "UNAVAILABLE" },
  { id: "2", name: "Ana", availability: "BUSY" },
  { id: "3", name: "Beto", availability: "AVAILABLE" },
]);
assert(sorted[0].availability === "AVAILABLE", "Prioridade 1 de atribuição é AVAILABLE");
assert(sorted[1].availability === "BUSY", "Prioridade 2 de atribuição é BUSY");
assert(sorted[2].availability === "UNAVAILABLE", "Prioridade 3 de atribuição é UNAVAILABLE");

// 8. Invariante: Bloqueadores por Plano de Assinatura e Piloto de 30 dias
import {
  createDefaultTrialSubscription,
  isSubscriptionExpired,
  checkLocationLimit,
  checkMemberLimit,
} from "../src/domain/rules/subscription-limits";

// Piloto Gratuito (30 dias)
const trial = createDefaultTrialSubscription(new Date("2026-10-01T12:00:00Z"));
assert(trial.planName === "Piloto Gratuito (30 dias)", "Piloto gratuito tem nome correto");
assert(trial.status === "TRIAL", "Piloto gratuito tem status TRIAL");
assert(trial.memberLimit === 5, "Piloto gratuito tem limite de 5 pessoas");
assert(trial.locationLimit === 1, "Piloto gratuito tem limite de 1 unidade");
assert(trial.startsOn === "2026-10-01", "Piloto gratuito inicia na data correta");
assert(trial.endsOn === "2026-10-31", "Piloto gratuito encerra exatamente 30 dias depois");

// Expiração de vigência
assert(
  isSubscriptionExpired(trial, new Date("2026-10-15T12:00:00Z")) === false,
  "Piloto de 30 dias não está expirado no 15º dia"
);
assert(
  isSubscriptionExpired(trial, new Date("2026-11-01T12:00:00Z")) === true,
  "Piloto de 30 dias está expirado após o 30º dia"
);
assert(
  isSubscriptionExpired({ ...trial, status: "CANCELLED" }, new Date("2026-10-15T12:00:00Z")) === true,
  "Assinatura CANCELLED é tratada como expirada/bloqueada"
);

// Bloqueio de Unidades
assert(
  checkLocationLimit({ subscription: trial, currentActiveLocationsCount: 0 }).allowed === true,
  "Pode criar primeira unidade quando tem 0 de 1 unidade utilizada"
);
assert(
  checkLocationLimit({ subscription: trial, currentActiveLocationsCount: 1 }).allowed === false,
  "Bloqueia criação de unidade quando limite do plano é atingido (1/1)"
);
assert(
  checkLocationLimit({
    subscription: trial,
    currentActiveLocationsCount: 0,
    now: new Date("2026-11-05T12:00:00Z"),
  }).allowed === false,
  "Bloqueia criação de unidade quando o plano estiver expirado"
);
const enterpriseSub = { ...trial, locationLimit: null, memberLimit: null };
assert(
  checkLocationLimit({ subscription: enterpriseSub, currentActiveLocationsCount: 100 }).allowed === true,
  "Plano ilimitado permite criar unidades sem restrição de contagem"
);

// Bloqueio de Pessoas / Colaboradores
assert(
  checkMemberLimit({ subscription: trial, currentActiveMembersCount: 4 }).allowed === true,
  "Pode adicionar membro quando tem 4 de 5 pessoas"
);
assert(
  checkMemberLimit({ subscription: trial, currentActiveMembersCount: 5 }).allowed === false,
  "Bloqueia adição de colaborador quando limite de pessoas é atingido (5/5)"
);
assert(
  checkMemberLimit({
    subscription: trial,
    currentActiveMembersCount: 2,
    now: new Date("2026-11-05T12:00:00Z"),
  }).allowed === false,
  "Bloqueia adição de colaborador quando plano estiver expirado"
);
assert(
  checkMemberLimit({ subscription: enterpriseSub, currentActiveMembersCount: 500 }).allowed === true,
  "Plano ilimitado permite adicionar colaboradores sem restrição de contagem"
);

console.log("=== TODOS OS TESTES DE REGRAS DE DOMÍNIO PASSARAM COM SUCESSO! ===");


