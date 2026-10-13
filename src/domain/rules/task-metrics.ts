export function taskTiming(
  task: {
    status: string;
    deadlineAt: Date | null;
    slaDueAt: Date | null;
    completedAt: Date | null;
    scheduledDate?: Date | string | null;
  },
  now = new Date()
) {
  if (["CANCELLED", "NOT_COMPLETED", "BLOCKED"].includes(task.status)) {
    return { isOverdue: false, slaExceeded: false, delayMinutes: 0 };
  }

  const refDate =
    task.slaDueAt ??
    task.deadlineAt ??
    (task.scheduledDate ? (typeof task.scheduledDate === "string" ? new Date(task.scheduledDate) : task.scheduledDate) : null);

  let endOfDay: Date | null = null;
  if (refDate && !isNaN(refDate.getTime())) {
    endOfDay = new Date(
      refDate.getFullYear(),
      refDate.getMonth(),
      refDate.getDate(),
      23,
      59,
      59,
      999
    );
  }

  let finish = task.completedAt ?? now;
  // Ao término do dia, o cálculo de violação do SLA trava no fim do dia (23:59:59) e não incrementa infinitamente
  if (endOfDay && finish > endOfDay) {
    finish = endOfDay;
  }

  const slaExceeded = !!task.slaDueAt && finish > task.slaDueAt;
  return {
    isOverdue: !!task.deadlineAt && finish > task.deadlineAt,
    slaExceeded,
    delayMinutes: slaExceeded ? Math.max(0, Math.round((finish.getTime() - task.slaDueAt!.getTime()) / 60000)) : 0,
  };
}

export type DeadlineStatus = "ON_TIME" | "TOLERANCE" | "OVERDUE";

export function getTaskDeadlineStatus(
  task: {
    deadlineAt: string | null;
    slaDueAt: string | null;
    toleranceMinutes?: number | null;
    completedAt?: string | null;
    scheduledDate?: string | null;
    status: string;
  },
  now: number,
): {
  status: DeadlineStatus;
  label: string;
  badgeClass: string;
} {
  const isScheduled = !!task.scheduledDate && Date.parse(task.scheduledDate) > now;
  if (isScheduled) {
    return {
      status: "ON_TIME",
      label: "Aguardando horário",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
  }

  const terminal = ["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(task.status);
  const deadlines = [task.deadlineAt, task.slaDueAt]
    .filter((v): v is string => !!v)
    .map((v) => Date.parse(v))
    .filter(Number.isFinite);

  if (!deadlines.length) {
    return {
      status: "ON_TIME",
      label: "Dentro do prazo",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    };
  }

  const dueAt = Math.min(...deadlines);
  const toleranceMinutes = task.toleranceMinutes ?? 20;
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const refTime = terminal && task.completedAt ? Date.parse(task.completedAt) : now;

  if (refTime <= dueAt) {
    return {
      status: "ON_TIME",
      label: "Dentro do prazo",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    };
  }

  if (refTime <= dueAt + toleranceMs) {
    return {
      status: "TOLERANCE",
      label: "Em tolerância",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    };
  }

  return {
    status: "OVERDUE",
    label: "Atrasada",
    badgeClass: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  };
}
