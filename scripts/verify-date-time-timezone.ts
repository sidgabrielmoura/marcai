import {
  canonicalTimezone,
  resolveEffectiveTimezone,
  isCalendarDateOnly,
  parseLocalDateTimeToUtc,
  formatTimeInTimezone,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  formatDateTimeLocalInput,
  CANONICAL_TIMEZONES,
  DEFAULT_TIMEZONE,
} from "../src/domain/rules/date-time";
import { nextOccurrence } from "../src/domain/rules/schedule";
import { scheduleSchema } from "../src/domain/rules/process-definition";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`✔ PASSOU: ${message}`);
  } else {
    failed++;
    console.error(`✖ FALHOU: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++;
    console.log(`✔ PASSOU: ${message}`);
  } else {
    failed++;
    console.error(`✖ FALHOU: ${message} (esperado: "${expected}", obtido: "${actual}")`);
  }
}

console.log("=== INICIANDO TESTES DE TRATAMENTO DE DATAS, HORÁRIOS E FUSOS HORÁRIOS ===\n");

// ── 1. CANONICALIZAÇÃO DE TIMEZONES E SINÔNIMOS ──
console.log("--- 1. Canonicalização de timezones e sinônimos ---");
assertEqual(canonicalTimezone("America/Sao_Paulo"), "America/Sao_Paulo", "Mantém fuso IANA válido America/Sao_Paulo");
assertEqual(canonicalTimezone("sao paulo"), "America/Sao_Paulo", "Normaliza sinônimo 'sao paulo'");
assertEqual(canonicalTimezone("São Paulo"), "America/Sao_Paulo", "Normaliza sinônimo com acento 'São Paulo'");
assertEqual(canonicalTimezone("brasilia"), "America/Sao_Paulo", "Normaliza sinônimo 'brasilia'");
assertEqual(canonicalTimezone("SP"), "America/Sao_Paulo", "Normaliza sigla 'SP'");
assertEqual(canonicalTimezone("America/Manaus"), "America/Manaus", "Mantém fuso IANA Manaus");
assertEqual(canonicalTimezone("manaus"), "America/Manaus", "Normaliza sinônimo 'manaus'");
assertEqual(canonicalTimezone("amazonas"), "America/Manaus", "Normaliza 'amazonas'");
assertEqual(canonicalTimezone("cuiaba"), "America/Cuiaba", "Normaliza 'cuiaba'");
assertEqual(canonicalTimezone("belem"), "America/Belem", "Normaliza 'belem'");
assertEqual(canonicalTimezone("fortaleza"), "America/Fortaleza", "Normaliza 'fortaleza'");
assertEqual(canonicalTimezone("rio_branco"), "America/Rio_Branco", "Normaliza 'rio_branco'");
assertEqual(canonicalTimezone("fernando de noronha"), "America/Noronha", "Normaliza 'fernando de noronha'");
assertEqual(canonicalTimezone("UTC"), "UTC", "Normaliza 'UTC'");
assertEqual(canonicalTimezone("gmt"), "UTC", "Normaliza 'gmt'");
assertEqual(canonicalTimezone(null), DEFAULT_TIMEZONE, "Fallback para DEFAULT_TIMEZONE com null");
assertEqual(canonicalTimezone(""), DEFAULT_TIMEZONE, "Fallback para DEFAULT_TIMEZONE com string vazia");
assertEqual(canonicalTimezone("Invalido/Inexistente"), DEFAULT_TIMEZONE, "Fallback para DEFAULT_TIMEZONE com fuso inválido");

// ── 2. PRECEDÊNCIA HIERÁRQUICA DE FUSO ──
console.log("\n--- 2. Precedência hierárquica de fuso (Rotina > Unidade > Org > Padrão) ---");
assertEqual(
  resolveEffectiveTimezone({
    routineTimezone: "America/Manaus",
    locationTimezone: "America/Sao_Paulo",
    orgTimezone: "UTC",
  }),
  "America/Manaus",
  "Precedência 1: Rotina tem prioridade máxima"
);

assertEqual(
  resolveEffectiveTimezone({
    routineTimezone: null,
    locationTimezone: "America/Manaus",
    orgTimezone: "America/Sao_Paulo",
  }),
  "America/Manaus",
  "Precedência 2: Unidade é usada quando rotina não tem fuso"
);

assertEqual(
  resolveEffectiveTimezone({
    routineTimezone: undefined,
    locationTimezone: undefined,
    orgTimezone: "UTC",
  }),
  "UTC",
  "Precedência 3: Organização é usada quando nem rotina nem unidade têm fuso"
);

assertEqual(
  resolveEffectiveTimezone({}),
  DEFAULT_TIMEZONE,
  "Precedência 4: Fallback padrão (America/Sao_Paulo) quando nenhum fuso é especificado"
);

// ── 3. PRESERVAÇÃO DE CAMPOS QUE SÃO APENAS DATA (CALENDAR DATE) ──
console.log("\n--- 3. Preservação de campos apenas de data (YYYY-MM-DD) ---");
assert(isCalendarDateOnly("2026-10-24"), "Reconhece 2026-10-24 como calendar date válida");
assert(isCalendarDateOnly("2026-02-28"), "Reconhece 2026-02-28 como calendar date válida");
assert(!isCalendarDateOnly("2026-02-30"), "Rejeita 2026-02-30 (data de calendário impossível)");
assert(!isCalendarDateOnly("2026-10-24T15:00:00Z"), "Rejeita ISO com horário como calendar date");
assert(!isCalendarDateOnly("24/10/2026"), "Rejeita formato não normalizado DD/MM/YYYY");
assert(!isCalendarDateOnly(null), "Rejeita null");

// ── 4. PARSER DE DATA/HORA LOCAL PARA INSTANTE UTC ABSOLUTO (SEM PERDA DE 3 HORAS) ──
console.log("\n--- 4. Conversão de entrada local para instante UTC absoluto ---");

// Entrada 15:00 em São Paulo (UTC-3) -> Instante UTC deve ser 18:00Z
{
  const instant = parseLocalDateTimeToUtc("2026-10-23T15:00", "America/Sao_Paulo");
  assert(instant !== null, "Parse de 2026-10-23T15:00 em America/Sao_Paulo gerou Date");
  assertEqual(instant?.toISOString(), "2026-10-23T18:00:00.000Z", "15:00 em São Paulo vira 18:00 UTC");
  assertEqual(formatTimeInTimezone(instant, "America/Sao_Paulo"), "15:00", "Ao exibir em São Paulo, retorna 15:00 (NÃO 12:00!)");
}

// Entrada 15:00 em Manaus (UTC-4) -> Instante UTC deve ser 19:00Z
{
  const instant = parseLocalDateTimeToUtc("2026-10-23T15:00", "America/Manaus");
  assert(instant !== null, "Parse de 2026-10-23T15:00 em America/Manaus gerou Date");
  assertEqual(instant?.toISOString(), "2026-10-23T19:00:00.000Z", "15:00 em Manaus vira 19:00 UTC");
  assertEqual(formatTimeInTimezone(instant, "America/Manaus"), "15:00", "Ao exibir em Manaus, retorna 15:00");
  assertEqual(formatTimeInTimezone(instant, "America/Sao_Paulo"), "16:00", "Ao exibir em São Paulo (UTC-3), 15:00 de Manaus (UTC-4) é 16:00");
}

// Entrada 15:00 em UTC -> Instante UTC deve ser 15:00Z
{
  const instant = parseLocalDateTimeToUtc("2026-10-23T15:00", "UTC");
  assert(instant !== null, "Parse de 2026-10-23T15:00 em UTC gerou Date");
  assertEqual(instant?.toISOString(), "2026-10-23T15:00:00.000Z", "15:00 em UTC vira 15:00 UTC");
  assertEqual(formatTimeInTimezone(instant, "UTC"), "15:00", "Ao exibir em UTC, retorna 15:00");
}

// Preservação de strings que já possuem indicador Z ou offset
{
  const explicitUtc = parseLocalDateTimeToUtc("2026-10-23T18:00:00.000Z", "America/Sao_Paulo");
  assertEqual(explicitUtc?.toISOString(), "2026-10-23T18:00:00.000Z", "Preserva instante quando string já contém Z");

  const explicitOffset = parseLocalDateTimeToUtc("2026-10-23T15:00:00-03:00", "UTC");
  assertEqual(explicitOffset?.toISOString(), "2026-10-23T18:00:00.000Z", "Preserva instante com offset explícito -03:00");
}

// ── 5. HORÁRIOS PRÓXIMOS DA MEIA-NOITE COM MUDANÇA DE DIA ──
console.log("\n--- 5. Horários próximos da meia-noite com virada de dia ---");
{
  // 23:45 em São Paulo (dia 23/10) -> UTC é 02:45 do dia seguinte (24/10)
  const nightTask = parseLocalDateTimeToUtc("2026-10-23T23:45", "America/Sao_Paulo");
  assert(nightTask !== null, "Parse de horário próximo da meia-noite gerou Date");
  assertEqual(nightTask?.toISOString(), "2026-10-24T02:45:00.000Z", "23:45 local vira 02:45 do dia seguinte em UTC");
  assertEqual(formatDateInTimezone(nightTask, "America/Sao_Paulo"), "23/10/2026", "Data local em São Paulo permanece 23/10/2026");
  assertEqual(formatTimeInTimezone(nightTask, "America/Sao_Paulo"), "23:45", "Horário local em São Paulo permanece 23:45");
  assertEqual(formatDateTimeInTimezone(nightTask, "America/Sao_Paulo"), "23/10/2026 às 23:45", "Data e hora completas locais preservam 23/10 às 23:45");
  assertEqual(formatDateInTimezone(nightTask, "UTC"), "24/10/2026", "Em UTC, data correspondente é 24/10/2026");
  assertEqual(formatTimeInTimezone(nightTask, "UTC"), "02:45", "Em UTC, horário correspondente é 02:45");

  // 00:15 em São Paulo (dia 24/10) -> UTC é 03:15 do dia 24/10
  const morningTask = parseLocalDateTimeToUtc("2026-10-24T00:15", "America/Sao_Paulo");
  assertEqual(morningTask?.toISOString(), "2026-10-24T03:15:00.000Z", "00:15 local vira 03:15 em UTC");
  assertEqual(formatDateInTimezone(morningTask, "America/Sao_Paulo"), "24/10/2026", "Data local em São Paulo é 24/10/2026");
  assertEqual(formatTimeInTimezone(morningTask, "America/Sao_Paulo"), "00:15", "Horário local em São Paulo é 00:15");
}

// ── 6. COMPATIBILIDADE COM FORMULÁRIOS HTML (DATETIME-LOCAL) ──
console.log("\n--- 6. Formatação para input datetime-local sem drift ---");
{
  const instant = new Date("2026-10-23T18:00:00.000Z");
  const localInputSp = formatDateTimeLocalInput(instant, "America/Sao_Paulo");
  assertEqual(localInputSp, "2026-10-23T15:00", "Input datetime-local em São Paulo recebe 2026-10-23T15:00");

  const localInputManaus = formatDateTimeLocalInput(instant, "America/Manaus");
  assertEqual(localInputManaus, "2026-10-23T14:00", "Input datetime-local em Manaus recebe 2026-10-23T14:00");

  const localInputUtc = formatDateTimeLocalInput(instant, "UTC");
  assertEqual(localInputUtc, "2026-10-23T18:00", "Input datetime-local em UTC recebe 2026-10-23T18:00");

  // Round-trip garantido: formatDateTimeLocalInput -> parseLocalDateTimeToUtc -> mesmo instante
  const roundTrip = parseLocalDateTimeToUtc(localInputSp, "America/Sao_Paulo");
  assertEqual(roundTrip?.toISOString(), instant.toISOString(), "Round-trip formulário preserva instante exato");
}

// ── 7. FUSOS COM HORÁRIO DE VERÃO (DST) ──
console.log("\n--- 7. Suporte a fusos com horário de verão (DST) ---");
{
  // America/New_York tem EDT (UTC-4) no verão e EST (UTC-5) no inverno
  const summerLocal = "2026-07-01T15:00";
  const summerUtc = parseLocalDateTimeToUtc(summerLocal, "America/New_York");
  assertEqual(summerUtc?.toISOString(), "2026-07-01T19:00:00.000Z", "Horário de verão (EDT UTC-4): 15:00 vira 19:00Z");
  assertEqual(formatTimeInTimezone(summerUtc, "America/New_York"), "15:00", "Exibição no verão recupera 15:00");

  const winterLocal = "2026-01-01T15:00";
  const winterUtc = parseLocalDateTimeToUtc(winterLocal, "America/New_York");
  assertEqual(winterUtc?.toISOString(), "2026-01-01T20:00:00.000Z", "Horário de inverno (EST UTC-5): 15:00 vira 20:00Z");
  assertEqual(formatTimeInTimezone(winterUtc, "America/New_York"), "15:00", "Exibição no inverno recupera 15:00");
}

// ── 8. RECORRÊNCIAS DE ROTINAS E MUDANÇA DE FUSO CONFIGURADO ──
console.log("\n--- 8. Recorrência de rotinas e troca de fuso ---");
{
  // Rotina diária às 09:00 em São Paulo (UTC-3)
  const scheduleSp = JSON.stringify({
    frequency: "DAILY",
    interval: 1,
    weekdays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
    monthDay: 1,
    times: ["09:00"],
    startsAt: "2026-10-20",
    endsAt: "",
    timezone: "America/Sao_Paulo",
    generationLeadTime: 1440,
    pendingPreviousPolicy: "CREATE_NEW",
    skipDates: [],
  });

  const startsAt = new Date("2026-10-20T00:00:00Z");
  // after: 2026-10-23T10:00:00Z (07:00 em SP)
  const after = new Date("2026-10-23T10:00:00Z");
  const nextSp = nextOccurrence(scheduleSp, startsAt, null, "America/Sao_Paulo", after);
  assert(nextSp !== null, "Rotina em São Paulo calculou próxima ocorrência");
  // 09:00 em São Paulo (UTC-3) é 12:00 UTC
  assertEqual(nextSp?.toISOString(), "2026-10-23T12:00:00.000Z", "Próxima ocorrência em SP às 09:00 é 12:00 UTC");
  assertEqual(formatTimeInTimezone(nextSp, "America/Sao_Paulo"), "09:00", "No fuso da rotina (SP), horário é 09:00");

  // Agora cliente troca a mesma rotina para America/Manaus (UTC-4)
  const scheduleManaus = JSON.stringify({
    ...JSON.parse(scheduleSp),
    timezone: "America/Manaus",
  });
  const nextManaus = nextOccurrence(scheduleManaus, startsAt, null, "America/Manaus", after);
  assert(nextManaus !== null, "Rotina alterada para Manaus calculou próxima ocorrência");
  // 09:00 em Manaus (UTC-4) é 13:00 UTC
  assertEqual(nextManaus?.toISOString(), "2026-10-23T13:00:00.000Z", "Próxima ocorrência em Manaus às 09:00 é 13:00 UTC");
  assertEqual(formatTimeInTimezone(nextManaus, "America/Manaus"), "09:00", "No fuso de Manaus, horário é 09:00");

  // Agora rotina em UTC às 09:00
  const scheduleUtc = JSON.stringify({
    ...JSON.parse(scheduleSp),
    timezone: "UTC",
  });
  // after: 2026-10-23T08:00:00Z
  const nextUtc = nextOccurrence(scheduleUtc, startsAt, null, "UTC", new Date("2026-10-23T08:00:00Z"));
  assertEqual(nextUtc?.toISOString(), "2026-10-23T09:00:00.000Z", "Próxima ocorrência em UTC às 09:00 é 09:00 UTC");
  assertEqual(formatTimeInTimezone(nextUtc, "UTC"), "09:00", "Em UTC, horário é 09:00");
}

// ── 9. VALIDAÇÃO DE SCHEMA COM CANONICAL TIMEZONE ──
console.log("\n--- 9. Validação de schema com canonical timezone ---");
{
  const validSchedule = {
    frequency: "DAILY",
    interval: 1,
    weekdays: ["MO", "TU"],
    monthDay: 1,
    times: ["08:30"],
    startsAt: "2026-10-24",
    endsAt: "",
    timezone: "sao paulo", // Synonym deve ser transformado para canonical
    generationLeadTime: 1440,
    pendingPreviousPolicy: "CREATE_NEW",
    skipDates: [],
  };
  const parsed = scheduleSchema.safeParse(validSchedule);
  assert(parsed.success, "Schema aceita sinônimo de timezone e valida");
  if (parsed.success) {
    assertEqual(parsed.data.timezone, "America/Sao_Paulo", "Transformou 'sao paulo' em 'America/Sao_Paulo'");
  }
}

// ── 10. SIMULAÇÃO DE NAVEGADOR E SERVIDOR EM FUSOS DIFERENTES ──
console.log("\n--- 10. Simulação de cliente e servidor em fusos divergentes ---");
{
  // Suponha que o servidor rode em UTC (Vercel) e o cliente esteja em São Paulo (UTC-3)
  // O cliente envia uma tarefa para as 14:00 da tarde (horário da unidade em SP)
  const userInputString = "2026-10-24T14:00";
  const unitTimezone = "America/Sao_Paulo";

  // Backend processa com parseLocalDateTimeToUtc usando o fuso da unidade
  const storedUtcDate = parseLocalDateTimeToUtc(userInputString, unitTimezone)!;
  assertEqual(storedUtcDate.toISOString(), "2026-10-24T17:00:00.000Z", "Gravado no banco como 17:00 UTC absoluto");

  // API serializa como ISO 8601 UTC
  const apiPayload = {
    id: "task-1",
    deadlineAt: storedUtcDate.toISOString(),
    timezone: unitTimezone,
  };

  // Frontend recebe e exibe usando o fuso fornecido pela tarefa/unidade
  const displayTime = formatTimeInTimezone(apiPayload.deadlineAt, apiPayload.timezone);
  const displayDate = formatDateInTimezone(apiPayload.deadlineAt, apiPayload.timezone);
  const displayFull = formatDateTimeInTimezone(apiPayload.deadlineAt, apiPayload.timezone);

  assertEqual(displayTime, "14:00", "Frontend exibe 14:00 (mesmo que o navegador estivesse em UTC ou Tóquio)");
  assertEqual(displayDate, "24/10/2026", "Frontend exibe 24/10/2026");
  assertEqual(displayFull, "24/10/2026 às 14:00", "Frontend exibe 24/10/2026 às 14:00 perfeitamente sincronizado");
}

console.log(`\n========================================`);
console.log(`RESULTADO FINAL: ${passed} verificações passaram, ${failed} falharam.`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
