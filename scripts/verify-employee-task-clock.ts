import assert from "node:assert/strict";
import { taskClock, formatClock, type ClockTask } from "../src/domain/rules/employee-task-clock";
const snapshot = Date.parse("2026-09-28T12:00:00Z");
const task: ClockTask = { status: "IN_PROGRESS", startedAt: "2026-09-28T11:50:00Z", elapsedSeconds: 480, timerRunning: true, deadlineAt: "2026-09-28T12:05:00Z", slaDueAt: "2026-09-28T12:02:00Z" };
let count = 0;
function test(name: string, check: () => void) { check(); count++; console.log("OK: " + name); }
test("usa o limite mais próximo e identifica SLA", () => { const clock = taskClock(task, snapshot, snapshot); assert.equal(clock.remaining,120); assert.equal(clock.deadlineLabel,"Limite de SLA"); });
test("decorrido cresce e restante diminui com o relógio", () => { const clock = taskClock(task, snapshot + 30000, snapshot); assert.equal(clock.elapsed,510); assert.equal(clock.remaining,90); });
test("retorno de aba em segundo plano recupera todo o intervalo", () => assert.equal(taskClock(task, snapshot + 3600000, snapshot).elapsed,4080));
test("pausa congela trabalho efetivo mas mantém prazo", () => { const clock = taskClock({...task, status:"PAUSED",timerRunning:false},snapshot + 30000,snapshot); assert.equal(clock.elapsed,480); assert.equal(clock.remaining,90); });
test("conclusão congela decorrido e remove contagem de prazo", () => { const clock = taskClock({...task,status:"COMPLETED"},snapshot + 30000,snapshot); assert.equal(clock.elapsed,480); assert.equal(clock.remaining,null); });
test("virada exata do prazo e atraso", () => { assert.equal(taskClock(task,snapshot+120000,snapshot).remaining,0); assert.equal(taskClock(task,snapshot+125000,snapshot).remaining,-5); });
test("sem início não inventa tempo decorrido", () => assert.equal(taskClock({...task,startedAt:null,timerRunning:false},snapshot,snapshot).elapsed,null));
test("sem prazo não inventa contagem regressiva", () => assert.equal(taskClock({...task,deadlineAt:null,slaDueAt:null},snapshot,snapshot).remaining,null));
test("bloqueada não consome SLA na interface", () => assert.equal(taskClock({...task,status:"BLOCKED",timerRunning:false},snapshot,snapshot).remaining,null));
test("prazo final pode vencer antes de SLA", () => assert.equal(taskClock({...task,deadlineAt:"2026-09-28T12:01:00Z"},snapshot,snapshot).deadlineLabel,"Prazo final"));
test("formata segundos e durações superiores a um dia", () => { assert.equal(formatClock(-5),"00:00:05"); assert.equal(formatClock(90061),"1d 01:01:01"); });
console.log(count + " verificações passaram.");
