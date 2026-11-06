const timezone = "America/Sao_Paulo";
const dayOf = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: timezone });
export function noticeTime(value: Date | string, now = new Date()) {
  const date = new Date(value);
  if (dayOf(date) === dayOf(now)) return date.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  if (dayOf(date) === dayOf(new Date(now.getTime() - 86400000))) return "Ontem";
  return date.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "2-digit" });
}
