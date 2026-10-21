import { columnFor, taskBadge, deadline, boardState, processBadge } from "../src/domain/rules/employee-workflow";

const now = Date.now();
const yesterday = new Date(now - 86400000).toISOString();

// Case 1: Form task scheduled yesterday, no deadlineAt, status AVAILABLE
const formTask = {
  id: "1",
  status: "AVAILABLE",
  taskType: "FORM",
  origin: "PROCESS",
  scheduledDate: yesterday,
  deadlineAt: null,
  slaDueAt: null,
  startedAt: null,
  timezone: "America/Sao_Paulo",
} as any;

// Case 2: Ad-hoc task scheduled yesterday, no deadlineAt, status AVAILABLE
const adHocTask = {
  id: "2",
  status: "AVAILABLE",
  taskType: "STANDARD",
  origin: "AD_HOC",
  scheduledDate: yesterday,
  deadlineAt: null,
  slaDueAt: null,
  startedAt: null,
  timezone: "America/Sao_Paulo",
} as any;

// Case 3: Process where all tasks are overdue (past day without deadline)
const procTasks = [formTask];
const bState = boardState(procTasks, now);

function testTaskBadge(task: any, now: number) {
  if (task.status === "COMPLETED") return { label: "Concluída", variant: "success" };
  if (task.status === "SUBMITTED") return { label: "Em aprovação", variant: "outline" };
  const timing = deadline(task, now);
  const col = columnFor(task, now);
  if (col === "overdue") {
    if (timing.phase === "TOLERANCE") return { label: "Em tolerância", variant: "warning" };
    return { label: "Atrasada", variant: "urgent" };
  }
  if (task.managementBlocked || task.executionStatus === "PAUSED")
    return { label: "Bloqueada pela gestão", variant: "warning" };
  if (timing.scheduled) return { label: "Aguardando horário", variant: "slate" };
  if (task.isUnassigned) return { label: "Para assumir", variant: "warning" };
  if (task.status === "NEEDS_CORRECTION") return { label: "Correção solicitada", variant: "warning" };
  return {
    label: task.status === "IN_PROGRESS" ? "Em andamento" : "Dentro do prazo",
    variant: "brand",
  };
}

console.log("FormTask column:", columnFor(formTask, now), "| OLD badge:", taskBadge(formTask, now), "| NEW badge:", testTaskBadge(formTask, now));
console.log("AdHocTask column:", columnFor(adHocTask, now), "| OLD badge:", taskBadge(adHocTask, now), "| NEW badge:", testTaskBadge(adHocTask, now));
console.log("Process boardState:", bState, "| badge:", processBadge(bState));
