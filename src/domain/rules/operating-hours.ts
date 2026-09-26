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
