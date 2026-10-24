/**
 * Centralized Date, Time, and Timezone handling domain rules.
 *
 * Implements three core concepts:
 * 1. Absolute Instants: normalized to UTC, serialized as ISO-8601 with "Z".
 * 2. Local Wall Time: recurrence rules and local schedule times with an explicit IANA timezone.
 * 3. Calendar Dates: date-only strings (YYYY-MM-DD) without timezone shifts.
 */

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export interface TimezoneOption {
  value: string;
  label: string;
  offsetLabel: string;
}

export const CANONICAL_TIMEZONES: TimezoneOption[] = [
  { value: "America/Sao_Paulo", label: "Horário de Brasília (São Paulo, Rio, Sul, Sudeste, Centro-Oeste)", offsetLabel: "UTC-3" },
  { value: "America/Manaus", label: "Horário do Amazonas (Manaus)", offsetLabel: "UTC-4" },
  { value: "America/Cuiaba", label: "Horário do Mato Grosso (Cuiabá)", offsetLabel: "UTC-4" },
  { value: "America/Belem", label: "Horário do Pará (Belém)", offsetLabel: "UTC-3" },
  { value: "America/Fortaleza", label: "Horário do Nordeste (Fortaleza, Recife, Salvador)", offsetLabel: "UTC-3" },
  { value: "America/Rio_Branco", label: "Horário do Acre (Rio Branco)", offsetLabel: "UTC-5" },
  { value: "America/Noronha", label: "Fernando de Noronha", offsetLabel: "UTC-2" },
  { value: "UTC", label: "Tempo Universal Coordenado (UTC / GMT)", offsetLabel: "UTC+0" },
];

const TIMEZONE_SYNONYMS: Record<string, string> = {
  "brasilia": "America/Sao_Paulo",
  "brasília": "America/Sao_Paulo",
  "sao_paulo": "America/Sao_Paulo",
  "sao paulo": "America/Sao_Paulo",
  "são paulo": "America/Sao_Paulo",
  "sp": "America/Sao_Paulo",
  "america/brasilia": "America/Sao_Paulo",
  "manaus": "America/Manaus",
  "amazonas": "America/Manaus",
  "am": "America/Manaus",
  "cuiaba": "America/Cuiaba",
  "cuiabá": "America/Cuiaba",
  "mato grosso": "America/Cuiaba",
  "mt": "America/Cuiaba",
  "belem": "America/Belem",
  "belém": "America/Belem",
  "para": "America/Belem",
  "pará": "America/Belem",
  "pa": "America/Belem",
  "fortaleza": "America/Fortaleza",
  "nordeste": "America/Fortaleza",
  "ceara": "America/Fortaleza",
  "ceará": "America/Fortaleza",
  "rio_branco": "America/Rio_Branco",
  "rio branco": "America/Rio_Branco",
  "acre": "America/Rio_Branco",
  "ac": "America/Rio_Branco",
  "noronha": "America/Noronha",
  "fernando de noronha": "America/Noronha",
  "fernando_de_noronha": "America/Noronha",
  "fn": "America/Noronha",
  "utc": "UTC",
  "gmt": "UTC",
  "z": "UTC",
  "universal": "UTC",
};

/**
 * Normalizes any timezone label, synonym, or code to a valid IANA timezone identifier.
 * Falls back to America/Sao_Paulo if unrecognized or invalid.
 */
export function canonicalTimezone(tz?: string | null): string {
  if (!tz || typeof tz !== "string") return DEFAULT_TIMEZONE;
  const trimmed = tz.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;

  const lower = trimmed.toLowerCase();
  if (TIMEZONE_SYNONYMS[lower]) {
    return TIMEZONE_SYNONYMS[lower];
  }

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Resolves the effective timezone using product precedence:
 * 1. Routine timezone (if task belongs to a routine execution)
 * 2. Location / Unit timezone
 * 3. Organization timezone
 * 4. Default: America/Sao_Paulo
 */
export function resolveEffectiveTimezone(hierarchy: {
  routineTimezone?: string | null;
  locationTimezone?: string | null;
  orgTimezone?: string | null;
}): string {
  return canonicalTimezone(
    hierarchy.routineTimezone ||
    hierarchy.locationTimezone ||
    hierarchy.orgTimezone ||
    DEFAULT_TIMEZONE
  );
}

/**
 * Checks whether a string is a calendar date only (YYYY-MM-DD).
 */
export function isCalendarDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/**
 * Converts a Date instant to its wall clock components in the specified timezone.
 */
function getWallClockParts(instant: Date, tz: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: canonicalTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Converts a Date instant to its wall time representation as UTC epoch ms.
 */
function getWallUtcTime(instant: Date, tz: string): number {
  const parts = getWallClockParts(instant, tz);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * Parses a date string input from a form or API into an absolute UTC Date instant.
 *
 * If the string already contains an explicit timezone offset or "Z" (e.g. 2026-10-23T17:30:00.000Z),
 * it is parsed directly as an absolute instant.
 *
 * If the string is a local datetime without offset (e.g. 2026-10-23T20:00 from HTML datetime-local),
 * it is interpreted in the given timezone (or default America/Sao_Paulo) and converted
 * accurately to the corresponding UTC instant.
 */
export function parseLocalDateTimeToUtc(
  value: string | Date | null | undefined,
  timezone?: string | null
): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Check if it already has explicit UTC (Z) or offset (+/-HH:MM or +/-HHMM)
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const instant = new Date(trimmed);
    return Number.isFinite(instant.getTime()) ? instant : null;
  }

  // Check if it is a local datetime: YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
  if (!localMatch) {
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const [, yStr, mStr, dStr, hrStr, mnStr, scStr] = localMatch;
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const hour = Number(hrStr);
  const minute = Number(mnStr);
  const second = scStr ? Number(scStr) : 0;

  const targetWallUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const zone = canonicalTimezone(timezone);

  // Find the UTC instant that produces targetWallUtc in zone.
  // Sample offsets around targetWallUtc.
  const offsets = new Set([-36, -24, -12, 0, 12, 24, 36].map((hrs) => {
    const sample = new Date(targetWallUtc + hrs * 3600000);
    return getWallUtcTime(sample, zone) - sample.getTime();
  }));

  const matches = [...offsets]
    .map((offset) => new Date(targetWallUtc - offset))
    .filter((instant) => getWallUtcTime(instant, zone) === targetWallUtc)
    .sort((a, b) => a.getTime() - b.getTime());

  if (matches.length > 0) {
    return matches[0];
  }

  // Fallback for DST gap: approximate using closest offset
  const sample = new Date(targetWallUtc);
  const approxOffset = getWallUtcTime(sample, zone) - sample.getTime();
  return new Date(targetWallUtc - approxOffset);
}

/**
 * Formats a Date or UTC instant to "HH:mm" in the specified timezone.
 */
export function formatTimeInTimezone(
  date: Date | string | number | null | undefined,
  timezone?: string | null
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";

  const zone = canonicalTimezone(timezone);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/**
 * Formats a Date or UTC instant to "DD/MM/YYYY" in the specified timezone.
 */
export function formatDateInTimezone(
  date: Date | string | number | null | undefined,
  timezone?: string | null
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";

  const zone = canonicalTimezone(timezone);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formats a Date or UTC instant to "DD/MM/YYYY às HH:mm" in the specified timezone.
 */
export function formatDateTimeInTimezone(
  date: Date | string | number | null | undefined,
  timezone?: string | null,
  options?: { includeSeconds?: boolean; separator?: string }
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";

  const zone = canonicalTimezone(timezone);
  const datePart = formatDateInTimezone(d, zone);
  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.includeSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  }).format(d);

  const sep = options?.separator ?? " às ";
  return `${datePart}${sep}${timePart}`;
}

/**
 * Formats a Date instant as YYYY-MM-DDTHH:mm in the specified timezone.
 * Used to populate HTML datetime-local inputs without loss or timezone drift.
 */
export function formatDateTimeLocalInput(
  date: Date | string | number | null | undefined,
  timezone?: string | null
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";

  const parts = getWallClockParts(d, canonicalTimezone(timezone));
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hr = String(parts.hour).padStart(2, "0");
  const min = String(parts.minute).padStart(2, "0");

  return `${y}-${m}-${day}T${hr}:${min}`;
}
