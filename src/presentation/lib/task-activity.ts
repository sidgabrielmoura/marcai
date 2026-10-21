export type TaskActivity = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date | string;
  metadata: unknown;
};

export function viewMetadata(log: TaskActivity) {
  const data = log.metadata;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as { wasUnassigned?: boolean; actorName?: string };
}

export function activityActor(log: TaskActivity) {
  return log.actorName || viewMetadata(log)?.actorName || (log.actorId ? "Funcionário não disponível" : "Sistema");
}

export function viewersWithoutClaim(logs: TaskActivity[], assignedMemberIds: string[]) {
  const assigned = new Set(assignedMemberIds);
  const latestViews = new Map<string, TaskActivity>();
  const latestClaims = new Map<string, number>();
  for (const log of logs) {
    if (!log.actorId) continue;
    const at = new Date(log.createdAt).getTime();
    if (log.action.toUpperCase() === "TASK_CLAIMED")
      latestClaims.set(log.actorId, Math.max(latestClaims.get(log.actorId) ?? 0, at));
    if (log.action.toUpperCase() === "TASK_VIEWED" && viewMetadata(log)?.wasUnassigned === true) {
      const previous = latestViews.get(log.actorId);
      if (!previous || at > new Date(previous.createdAt).getTime()) latestViews.set(log.actorId, log);
    }
  }
  return [...latestViews.values()]
    .filter((log) => !assigned.has(log.actorId!) && (latestClaims.get(log.actorId!) ?? -Infinity) < new Date(log.createdAt).getTime())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
