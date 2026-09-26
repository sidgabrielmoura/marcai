import { RRule } from "rrule";
import { scheduleSchema, type ScheduleDefinition } from "./process-definition";

export function readSchedule(rule: string): ScheduleDefinition | null {
  try { const result = scheduleSchema.safeParse(JSON.parse(rule)); return result.success ? result.data : null; } catch { return null; }
}

export function nextOccurrence(rule: string, startsAt: Date, endsAt: Date | null, timezone: string, after: Date): Date | null {
  const schedule = readSchedule(rule);
  if (![startsAt, after, ...(endsAt ? [endsAt] : [])].every(d => Number.isFinite(d.getTime()))) return null;
  try {
    const zone = schedule?.timezone ?? timezone;
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    // RRule performs only calendar arithmetic on floating UTC fields. Its tzid
    // conversion depends on the host timezone, so conversion happens explicitly.
    const toWall = (instant: Date) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
      return new Date(`${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    };
    const toInstant = (wall: Date): Date | null => {
      const offsets = new Set([-36, 0, 36].map(hours => {
        const sample = new Date(wall.getTime() + hours * 3600000);
        return toWall(sample).getTime() - sample.getTime();
      }));
      const matches = [...offsets].map(offset => new Date(wall.getTime() - offset))
        .filter(instant => toWall(instant).getTime() === wall.getTime())
        .sort((a, b) => a.getTime() - b.getTime());
      // A DST gap is skipped; a repeated local time uses its first occurrence.
      return matches[0] ?? null;
    };
    const start = schedule ? new Date(`${schedule.startsAt}T00:00:00Z`) : toWall(startsAt);
    const legacy = schedule ? null : RRule.parseString(rule);
    const rules = schedule ? schedule.times.map(time => {
      const [hour, minute] = time.split(":").map(Number);
      return new RRule({ freq: RRule[schedule.frequency], interval: schedule.interval, dtstart: start, byhour: hour, byminute: minute, bysecond: 0,
        ...(schedule.frequency === "WEEKLY" ? { byweekday: schedule.weekdays.map(day => RRule[day]) } : {}),
        ...(schedule.frequency === "MONTHLY" ? { bymonthday: schedule.monthDay } : {}),
      });
    }) : [new RRule({ ...legacy, dtstart: start, tzid: null, ...(legacy?.until ? { until: toWall(legacy.until) } : {}) })];
    const lowerBound = schedule ? after : new Date(Math.max(after.getTime(), startsAt.getTime() - 1));
    // Include the current wall second, then compare real instants below. This
    // also avoids scanning a full day for high-frequency legacy RRULE values.
    const searchAfter = new Date(toWall(lowerBound).getTime() - 1);
    const candidates = rules.map(r => {
      let wall = r.after(searchAfter, false);
      const limit = (schedule?.skipDates.length ?? 0) + 370;
      for (let i = 0; wall && i < limit; i++) {
        const localDate = wall.toISOString().slice(0, 10);
        if (schedule?.endsAt && localDate > schedule.endsAt) return null;
        const candidate = toInstant(wall);
        if (candidate && !schedule && endsAt && candidate > endsAt) return null;
        if (candidate && candidate > lowerBound && !schedule?.skipDates.includes(localDate)) return candidate;
        wall = r.after(wall, false);
      }
      return null;
    }).filter((d): d is Date => d !== null);
    return candidates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  } catch {
    // Invalid persisted legacy data must not stop all other scheduler jobs.
    return null;
  }
}
