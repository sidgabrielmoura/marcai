import assert from "node:assert/strict";
import { activityActor, viewersWithoutClaim, type TaskActivity } from "../src/presentation/lib/task-activity";
import { uiLabel } from "../src/presentation/components/shared/ui-labels";

const event = (id: string, action: string, actorId: string, second: number, wasUnassigned = false): TaskActivity => ({
  id, action, actorId, actorName: actorId, createdAt: new Date(Date.UTC(2026, 9, 21, 12, 0, second)), metadata: { wasUnassigned },
});
const logs = [event("a", "TASK_VIEWED", "Ana", 1, true), event("b", "TASK_VIEWED", "Bruno", 2, true), event("c", "TASK_VIEWED", "Ana", 3, true)];
assert.deepEqual(viewersWithoutClaim(logs, []).map(activityActor), ["Ana", "Bruno"]);
assert.deepEqual(viewersWithoutClaim([...logs, event("d", "TASK_CLAIMED", "Ana", 4)], []).map(activityActor), ["Bruno"]);
assert.deepEqual(viewersWithoutClaim(logs, ["Ana"]).map(activityActor), ["Bruno"]);
assert.equal(viewersWithoutClaim([event("a", "TASK_VIEWED", "Ana", 1)], []).length, 0);
assert.equal(viewersWithoutClaim([event("a", "TASK_VIEWED", "Ana", 2, true), event("b", "TASK_CLAIMED", "Ana", 1)], []).length, 1);
assert.equal(activityActor({ ...logs[0], actorName: null, metadata: { actorName: "Nome preservado" } }), "Nome preservado");
assert.equal(uiLabel("task_overdue"), "Prazo da tarefa excedido");
for (const action of ["TASK_VIEWED", "TASK_UPDATED", "TASK_REASSIGNED", "TASK_SUBMITTED", "TASK_CORRECTION_REQUESTED", "TASK_OVERDUE", "TASK_EXPIRING_SOON", "TASK_TOLERANCE_EXCEEDED", "TASK_MANAGEMENT_BLOCKED", "TASK_MANAGEMENT_UNBLOCKED", "TASK_UNBLOCKED", "EVIDENCE_SUBMITTED", "EVIDENCE_VALIDATION_FAILED", "APPROVAL_DEADLINE_EXCEEDED", "APPROVAL_REQUESTED"]) {
  assert.doesNotMatch(uiLabel(action), /_|\b(task|evidence|approval)\b/i);
  assert.equal(uiLabel(action.toLowerCase()), uiLabel(action));
}
console.log("Histórico: traduções, nomes, visualizações únicas por funcionário e exclusão após assumir validados.");
