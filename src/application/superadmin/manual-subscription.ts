import { z } from "zod";

const optionalLimit = z.number().int().min(1).max(10_000_000).nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Informe uma data válida.");

export const subscriptionSchema = z.object({
  planName: z.string().trim().min(2).max(80),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]),
  cycle: z.enum(["MONTHLY", "YEARLY", "CUSTOM"]),
  amountCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  startsOn: date,
  endsOn: date.nullable(),
  memberLimit: optionalLimit,
  locationLimit: optionalLimit,
  notes: z.string().trim().max(2000),
}).strict().refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
  message: "O fim da vigência deve ser posterior ao início.", path: ["endsOn"],
});

export type ManualSubscription = z.infer<typeof subscriptionSchema>;

export function readManualSubscription(settings: unknown): ManualSubscription | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const result = subscriptionSchema.safeParse((settings as Record<string, unknown>).platformSubscription);
  return result.success ? result.data : null;
}

export const subscriptionStatusLabels: Record<ManualSubscription["status"], string> = {
  TRIAL: "Em avaliação", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCELLED: "Cancelada",
};

export const cycleLabels: Record<ManualSubscription["cycle"], string> = {
  MONTHLY: "Mensal",
  YEARLY: "Anual",
  CUSTOM: "Personalizado",
};

export const platformPlanSchema = z.object({
  name: z.string().trim().min(2, "Nome do plano deve ter no mínimo 2 caracteres.").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  cycle: z.enum(["MONTHLY", "YEARLY", "CUSTOM"]).default("MONTHLY"),
  amountCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  memberLimit: optionalLimit,
  locationLimit: optionalLimit,
  features: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export type PlatformPlanInput = z.infer<typeof platformPlanSchema>;

export interface PlatformPlanModel {
  id: string;
  name: string;
  description: string | null;
  cycle: string;
  amountCents: number | null;
  memberLimit: number | null;
  locationLimit: number | null;
  features: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PLATFORM_PLANS = [
  {
    name: "Start / Básico",
    description: "Ideal para pequenas operações padronizarem rotinas com agilidade.",
    cycle: "MONTHLY" as const,
    amountCents: 19900,
    memberLimit: 10,
    locationLimit: 1,
    features: "Até 10 colaboradores ativos\n1 unidade operacional\nChecklists e processos ilimitados\nSuporte por ticket",
    status: "ACTIVE" as const,
  },
  {
    name: "Profissional",
    description: "Para empresas em crescimento com múltiplas unidades e equipes estruturadas.",
    cycle: "MONTHLY" as const,
    amountCents: 49900,
    memberLimit: 30,
    locationLimit: 3,
    features: "Até 30 colaboradores ativos\nAté 3 unidades operacionais\nFluxos com aprovações em múltiplos níveis\nRelatórios agendados\nSuporte prioritário",
    status: "ACTIVE" as const,
  },
  {
    name: "Enterprise",
    description: "Operações de grande porte com múltiplos turnos, alta volumetria e auditoria contínua.",
    cycle: "MONTHLY" as const,
    amountCents: 129900,
    memberLimit: null,
    locationLimit: null,
    features: "Colaboradores e unidades ilimitados\nSLA de suporte dedicado\nExportação avançada de dados\nAuditoria completa e logs de conformidade",
    status: "ACTIVE" as const,
  },
  {
    name: "Piloto Gratuito (30 dias)",
    description: "Período de teste e homologação assistida sem custo contratual.",
    cycle: "CUSTOM" as const,
    amountCents: 0,
    memberLimit: 5,
    locationLimit: 1,
    features: "Válido por 30 dias de homologação\nAté 5 colaboradores\n1 unidade piloto",
    status: "ACTIVE" as const,
  },
];

export interface SubscriptionNotice {
  planName: string;
  status: ManualSubscription["status"];
  endsOn: string;
  startsOn: string;
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isTrial: boolean;
  thresholdDays: number;
}

export function getSubscriptionNotice(
  subscription: ManualSubscription | null,
  thresholdDays = 7
): SubscriptionNotice | null {
  if (!subscription) return null;

  if (subscription.status === "CANCELLED") return null;

  if (!subscription.endsOn) {
    if (subscription.status === "PAST_DUE") {
      return {
        planName: subscription.planName,
        status: "PAST_DUE",
        endsOn: "",
        startsOn: subscription.startsOn,
        daysRemaining: 0,
        isExpired: true,
        isExpiringSoon: false,
        isTrial: false,
        thresholdDays,
      };
    }
    return null;
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todayMs = new Date(`${todayStr}T12:00:00Z`).getTime();
  const endMs = new Date(`${subscription.endsOn}T12:00:00Z`).getTime();

  if (Number.isNaN(todayMs) || Number.isNaN(endMs)) return null;

  const diffMs = endMs - todayMs;
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= thresholdDays;

  if (!isExpired && !isExpiringSoon && subscription.status !== "PAST_DUE") {
    return null;
  }

  const isTrial =
    subscription.status === "TRIAL" ||
    subscription.planName.toLowerCase().includes("piloto") ||
    subscription.planName.toLowerCase().includes("trial");

  return {
    planName: subscription.planName,
    status: subscription.status,
    endsOn: subscription.endsOn,
    startsOn: subscription.startsOn,
    daysRemaining,
    isExpired,
    isExpiringSoon,
    isTrial,
    thresholdDays,
  };
}


