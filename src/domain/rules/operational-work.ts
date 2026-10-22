// Preserve the existing end-of-day cutoff and latest-milestone alert policy.
export function pendingSlaMilestone(slaDueAt: Date, settings: unknown, categories: string[], now: Date) {
  const endOfDay = new Date(slaDueAt.getFullYear(), slaDueAt.getMonth(), slaDueAt.getDate(), 23, 59, 59, 999);
  const effectiveNow = now > endOfDay ? endOfDay : now;
  const minutes = Math.max(0, (effectiveNow.getTime() - slaDueAt.getTime()) / 60_000);
  const raw = (settings as { delayMilestones?: unknown } | null)?.delayMilestones;
  const milestones = [0, ...(Array.isArray(raw) ? raw : [15, 30, 60, 120])].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const processed = categories.reduce((max, category) => {
    const value = category.startsWith("SLA_") ? Number(category.slice(4)) : NaN;
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, -1);
  const pending = milestones.filter(value => value > processed && value <= minutes);
  return pending.length ? Math.max(...pending) : null;
}
