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
