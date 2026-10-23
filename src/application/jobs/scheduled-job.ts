import { randomUUID } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import type { Prisma } from "@prisma/client";

export async function runScheduledJob<T extends object>(name: string, leaseMs: number, work: () => Promise<T>, options: { minIntervalMs?: number } = {}) {
  const interval = options.minIntervalMs ?? 0;
  if (!Number.isInteger(interval) || interval < 0) throw new Error("Invalid job minimum interval");
  const token = randomUUID();
  const claimed = await prisma.$queryRaw<Array<{ name: string }>>`
    INSERT INTO scheduled_job_states(name,"leaseToken","leaseUntil","lastStartedAt","updatedAt")
    VALUES(${name},${token},now()+${leaseMs}*interval '1 millisecond',now(),now())
    ON CONFLICT(name) DO UPDATE SET "leaseToken"=excluded."leaseToken","leaseUntil"=excluded."leaseUntil","lastStartedAt"=now(),"updatedAt"=now()
    WHERE (scheduled_job_states."leaseUntil" IS NULL OR scheduled_job_states."leaseUntil"<now())
      AND (${interval}=0 OR scheduled_job_states."lastStartedAt" IS NULL
        OR scheduled_job_states."lastStartedAt"<=now()-${interval}*interval '1 millisecond')
    RETURNING name`;
  if (!claimed.length) return { skipped: true as const, reason: interval ? "RUNNING_OR_THROTTLED" : "ALREADY_RUNNING" };
  try {
    const result = await work();
    const successful = !("failures" in result && Array.isArray(result.failures) && result.failures.length);
    await prisma.scheduledJobState.updateMany({ where: { name, leaseToken: token }, data: {
      leaseToken: null, leaseUntil: null, lastCompletedAt: new Date(),
      ...(successful ? { lastSuccessAt: new Date(), failures: 0 } : { failures: { increment: 1 } }),
      lastResult: result as unknown as Prisma.InputJsonValue,
    } });
    return { skipped: false as const, result };
  } catch (error) {
    await prisma.scheduledJobState.updateMany({ where: { name, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, lastCompletedAt: new Date(), failures: { increment: 1 }, lastResult: { failed: true } } });
    throw error;
  }
}

export async function recordWorkFailure(key: string) {
  await prisma.$executeRaw`INSERT INTO scheduled_job_states(name,failures,"nextAttemptAt","updatedAt")
    VALUES(${'retry:'+key},1,now()+interval '1 minute',now())
    ON CONFLICT(name) DO UPDATE SET failures=LEAST(scheduled_job_states.failures+1,16),
    "nextAttemptAt"=now()+LEAST(3600,60*power(2,LEAST(scheduled_job_states.failures,6)))*(0.9+random()*0.2)*interval '1 second',"updatedAt"=now()`;
}

export async function retryStates(keys: string[]) {
  if (!keys.length) return new Map<string, { nextAttemptAt: Date | null; updatedAt: Date }>();
  const rows = await prisma.scheduledJobState.findMany({ where: { name: { in: keys.map(key=>'retry:'+key) } }, select: { name: true, nextAttemptAt: true, updatedAt: true } });
  return new Map(rows.map(row => [row.name.slice(6), { nextAttemptAt: row.nextAttemptAt, updatedAt: row.updatedAt }]));
}

export async function clearWorkFailure(key: string) {
  await prisma.scheduledJobState.deleteMany({ where: { name: 'retry:'+key } });
}
