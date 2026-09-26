import type { Prisma } from "@prisma/client";

// An immutable correction event identifies the round without discarding the
// previous submissions or approval decisions.
export async function getEvidenceRound(db: Pick<Prisma.TransactionClient, "activityLog">, organizationId: string, taskId: string) {
  return db.activityLog.findFirst({
    where: { organizationId, entityType: "TASK", entityId: taskId, action: { in: ["TASK_CORRECTION_REQUESTED", "APPROVAL_REJECTED"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true },
  });
}

export function evidenceInRound<T extends { createdAt: Date }>(submissions: T[], round: { createdAt: Date } | null) {
  return round ? submissions.filter(submission => submission.createdAt >= round.createdAt) : submissions;
}
