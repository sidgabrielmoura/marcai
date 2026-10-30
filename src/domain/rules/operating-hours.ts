export interface LocationOperatingRules {
  timezone: string;
  openingTime?: string | null; // "08:00"
  closingTime?: string | null; // "20:00"
  operatingDays?: string | null; // "MON,TUE,WED,THU,FRI,SAT"
}

export type OutsideOperatingHoursPolicy = "BLOCK" | "ALLOW_WITH_OCCURRENCE" | "ALLOW";

const dayMap: Record<number, string> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

/**
 * Verifica se um determinado instante está dentro do horário de funcionamento da unidade (Item 34).
 */
export function isLocationOpenAt(location: LocationOperatingRules, date = new Date()): boolean {
  if (!location.openingTime || !location.closingTime) {
    return true; // Sem restrição cadastrada
  }

  const zone = location.timezone || "America/Sao_Paulo";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  const weekdayShort = parts.weekday?.toUpperCase().slice(0, 3) || "";

  // Verificar dia de operação
  const activeDays = (location.operatingDays || "MON,TUE,WED,THU,FRI,SAT")
    .split(",")
    .map(d => d.trim().toUpperCase());

  if (!activeDays.includes(weekdayShort)) {
    return false;
  }

  // Verificar faixa horária
  const currentMinutes = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  const [openH, openM] = location.openingTime.split(":").map(Number);
  const [closeH, closeM] = location.closingTime.split(":").map(Number);

  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

/**
 * Calcula o próximo instante de abertura da unidade em UTC.
 */
export function getNextOperatingOpening(location: LocationOperatingRules, fromDate = new Date()): Date {
  const zone = location.timezone || "America/Sao_Paulo";
  const openTime = location.openingTime || "08:00";
  const [openH, openM] = openTime.split(":").map(Number);
  const activeDays = (location.operatingDays || "MON,TUE,WED,THU,FRI,SAT")
    .split(",")
    .map(d => d.trim().toUpperCase());

  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const candidateUtc = new Date(fromDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(candidateUtc).map(p => [p.type, p.value]));
    const weekdayShort = parts.weekday?.toUpperCase().slice(0, 3) || "";

    if (!activeDays.includes(weekdayShort)) {
      continue;
    }

    const year = parseInt(parts.year, 10);
    const month = parseInt(parts.month, 10);
    const day = parseInt(parts.day, 10);

    if (dayOffset === 0) {
      const currentMinutes = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
      const openMinutes = openH * 60 + openM;
      if (currentMinutes >= openMinutes) {
        continue;
      }
    }

    const approxUtc = new Date(Date.UTC(year, month - 1, day, openH, openM, 0));
    const checkParts = Object.fromEntries(formatter.formatToParts(approxUtc).map(x => [x.type, x.value]));
    const zonedDate = new Date(Date.UTC(parseInt(checkParts.year, 10), parseInt(checkParts.month, 10) - 1, parseInt(checkParts.day, 10), parseInt(checkParts.hour, 10), parseInt(checkParts.minute, 10), 0));
    const offset = approxUtc.getTime() - zonedDate.getTime();
    return new Date(approxUtc.getTime() + offset);
  }

  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
}
