import { prisma } from '@/infrastructure/database/prisma';
import { runScheduledJob } from '@/application/jobs/scheduled-job';
import { operationalTick } from './operational-tick';
import { nextOperationalRun } from './operational-next';
import type { OperationalPhase } from './operational-phases';
export type DueOperationalPhase = {
    organizationId: string;
    phase: OperationalPhase;
    revision: bigint | null;
    failures: number;
    lastCompletedAt: Date | null;
    signalIds: string[];
};
// One read against scheduling metadata. Never obtain a write lease on an empty tick.
export async function dueOperationalPhases(now: Date): Promise<DueOperationalPhase[]> {
    return prisma.$queryRaw<DueOperationalPhase[]> `
    WITH signals AS MATERIALIZED (
      SELECT s.id,s.organization_id,s.phase,s.available_at FROM operational_signals s
      JOIN organizations o ON o.id=s.organization_id AND o.status='ACTIVE'
      WHERE s.available_at<=${now} ORDER BY s.available_at,s.id LIMIT 1000
    ), due AS (
      (SELECT a.organization_id,a.phase,a.next_run_at AS at FROM operational_agenda a
       JOIN organizations o ON o.id=a.organization_id AND o.status='ACTIVE'
       WHERE a.next_run_at<=${now} ORDER BY a.next_run_at,a.organization_id,a.phase LIMIT 36)
      UNION ALL SELECT organization_id,phase,available_at FROM signals
    ), phases AS (
      SELECT organization_id,phase,min(at) AS at FROM due GROUP BY organization_id,phase
      ORDER BY min(at),organization_id,phase LIMIT 36
    )
    SELECT p.organization_id AS "organizationId",p.phase,a.revision,
      COALESCE(a.failures,0)::int AS failures,a.last_completed_at AS "lastCompletedAt",
      ARRAY(SELECT s.id::text FROM signals s WHERE s.organization_id=p.organization_id AND s.phase=p.phase) AS "signalIds"
    FROM phases p LEFT JOIN operational_agenda a ON a.organization_id=p.organization_id AND a.phase=p.phase
    ORDER BY p.at,p.organization_id,p.phase`;
}
export async function finishOperationalPhase(row: DueOperationalPhase, nextAt: Date, completedAt: Date | null, failed: boolean) {
    return prisma.$transaction(async (tx) => {
        const changed = await tx.$queryRaw<Array<{
            revision: bigint;
        }>> `
      INSERT INTO operational_agenda(organization_id,phase,next_run_at,revision,failures,last_completed_at)
      SELECT id,${row.phase},${nextAt},1,${failed ? row.failures + 1 : 0},${completedAt} FROM organizations
      WHERE id=${row.organizationId} AND status='ACTIVE'
      ON CONFLICT(organization_id,phase) DO UPDATE SET next_run_at=excluded.next_run_at,
        revision=operational_agenda.revision+1,failures=excluded.failures,
        last_completed_at=COALESCE(excluded.last_completed_at,operational_agenda.last_completed_at)
      WHERE operational_agenda.revision=${row.revision}::bigint RETURNING revision`;
        if (!changed.length || !row.signalIds.length)
            return changed.length > 0;
        // Explicit committed IDs only. A lower ID may still belong to an uncommitted transaction.
        if (failed)
            await tx.operationalSignal.updateMany({ where: { organizationId: row.organizationId, phase: row.phase, id: { in: row.signalIds.map(BigInt) } }, data: { availableAt: nextAt } });
        else
            await tx.operationalSignal.deleteMany({ where: { organizationId: row.organizationId, phase: row.phase, id: { in: row.signalIds.map(BigInt) } } });
        return true;
    });
}
export async function runSelectiveOperational(now = new Date(), minIntervalMs = 60000) {
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 0)
        throw new Error('Invalid job minimum interval');
    const interval = Number(process.env.OPERATIONAL_RECONCILE_INTERVAL_MS ?? 3600000);
    if (!Number.isInteger(interval) || interval < 60000 || interval > 86400000)
        throw new Error('Invalid operational reconciliation interval');
    const due = await dueOperationalPhases(now);
    if (!due.length)
        return { skipped: true as const, reason: 'NO_WORK' };
    return runScheduledJob('operational', 90000, async () => {
        const stopAt = Date.now() + 40000;
        const totals = { generated: 0, released: 0, alerts: 0, escalations: 0, reports: 0, purgedOrganizations: 0 };
        const failures: Array<{
            kind: string;
            id: string;
        }> = [];
        let phasesProcessed = 0;
        for (const row of due) {
            if (Date.now() >= stopAt)
                break;
            try {
                const progress = await operationalTick(now, { organizationId: row.organizationId, phases: [row.phase], stopAt,
                    restartDependencies: row.signalIds.length > 0,
                    recoverSince: row.lastCompletedAt ?? new Date(now.getTime() - 86400000) });
                for (const key of Object.keys(totals) as Array<keyof typeof totals>)
                    totals[key] += progress[key];
                failures.push(...progress.failures);
                const failed = progress.failures.length > 0;
                // Per-item backoff remains in place. A failed phase must not postpone
                // unrelated future deadlines by an hour. Retry its scan within a minute.
                const next = failed ? { at: new Date(now.getTime() + 60_000), complete: false }
                    : await nextOperationalRun(row.organizationId, row.phase, now, new Date(now.getTime() + interval), progress, stopAt);
                await finishOperationalPhase(row, next.at, next.complete ? now : null, failed);
            }
            catch {
                failures.push({ kind: 'operational_phase', id: row.phase });
                await finishOperationalPhase(row, new Date(now.getTime() + 60_000), null, true);
            }
            phasesProcessed++;
        }
        return { ...totals, failures, phasesProcessed, phasesRemaining: due.length - phasesProcessed };
    }, { minIntervalMs });
}
