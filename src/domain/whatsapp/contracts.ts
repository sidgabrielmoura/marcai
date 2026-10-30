import { z } from "zod";

export const recipientLimit = 5;
export const remoteStatusSchema = z.enum(["STOPPED", "STARTING", "SCAN_QR_CODE", "WORKING", "FAILED"]);
export type RemoteStatus = z.infer<typeof remoteStatusSchema>;
export const operationSchema = z.enum(["connect", "refresh", "disconnect", "start", "restart", "stop", "delete"]);
export type WhatsAppOperation = z.infer<typeof operationSchema>;
export const instanceIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const sessionNameSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const createInstanceSchema = z.object({
  name: z.string().trim().min(2).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  locationId: instanceIdSchema,
}).strict();
export const recipientsSchema = z.array(z.object({
  name: z.string().trim().max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  phone: z.string().trim().regex(/^\+?[1-9][0-9 ()-]{7,23}$/)
    .transform(value => value.replace(/\D/g, ""))
    .refine(value => value.length >= 8 && value.length <= 15 && (!value.startsWith("55") || [12, 13].includes(value.length))),
}).strict()).max(recipientLimit).refine(rows => new Set(rows.map(row => row.phone)).size === rows.length);

export class WhatsAppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function publicWhatsAppError(error: unknown) {
  if (error instanceof WhatsAppError) return { error: error.message, code: error.code, status: error.status };
  if (error instanceof z.ZodError) return { error: "Confira os dados informados. Use números com país e DDD, sem duplicatas, até o limite de cinco.", code: "INVALID_INPUT", status: 400 };
  console.warn("[whatsapp] Operation failed", { code: "INTERNAL_ERROR" });
  return { error: "Não foi possível concluir a operação. Tente novamente.", code: "INTERNAL_ERROR", status: 500 };
}
export function whatsappChannel(organizationId: string, locationId: string, id: string) {
  return `whatsapp:${organizationId}:${locationId}:${id}`;
}
export interface ConnectionDTO {
  status: string; qr: string | null; qrExpiresAt: number | null; revision: number; deleted?: boolean;
}
export const webhookSchema = z.object({
  id: z.string().min(1).max(160), timestamp: z.number().int().positive().max(8640000000000000),
  session: sessionNameSchema, event: z.enum(["session.status", "message", "message.any", "message.ack"]),
  me: z.object({ id: z.string().max(160), pushName: z.string().max(160).optional() }).nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type WahaWebhook = z.infer<typeof webhookSchema>;
export const statusPayloadSchema = z.object({ name: sessionNameSchema, status: remoteStatusSchema });
export const ackPayloadSchema = z.object({ id: z.string().min(1).max(200), ack: z.number().int().min(-1).max(4) });
export function knownIdentity(me: { id: string; pushName?: string } | null | undefined) {
  const phone = me?.id.match(/^(\d{8,15})@(?:c\.us|s\.whatsapp\.net)$/)?.[1];
  const name = me?.pushName?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return { ...(phone ? { connectedPhone: phone } : {}), ...(name ? { connectedName: name } : {}) };
}
export const WHATSAPP_EVENT_TYPES: Record<string, string[]> = {
  TASK_OVERDUE: ["TASK_OVERDUE", "TASK_TOLERANCE_EXCEEDED", "SLA_BREACH"],
  IMPEDIMENT_REPORTED: ["IMPEDIMENT_REPORTED", "OPERATIONAL_ALERT", "VALIDATION_EXCEPTION"],
  APPROVAL_PENDING: ["APPROVAL_PENDING", "APPROVAL_REQUESTED", "APPROVAL_OVERDUE"],
  DEADLINE_WARNING: ["DEADLINE_WARNING", "TASK_EXPIRING_SOON", "CRITICAL_TASK_ALERT"],
  PROCESS_STALLED: ["PROCESS_STALLED", "PAUSE_ALERT"],
};

export const whatsappAlertSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  notificationTypes: z.array(z.string()).default([]),
  criticalityFilter: z.enum(["CRITICAL_ONLY", "HIGH_AND_CRITICAL", "ALL"]).default("CRITICAL_ONLY"),
  triggerStep: z.number().int().min(0).max(10).default(0),
  repeatInterval: z.number().int().min(0).max(1440).default(0),
  businessHoursOnly: z.boolean().default(false),
  alwaysUrgent: z.boolean().default(false),
  recipientPhone: z.string().optional(),
  recipientName: z.string().optional(),
});
export type WhatsAppAlertSettings = z.infer<typeof whatsappAlertSettingsSchema>;

export interface RegisterAlertParams {
  organizationId: string;
  locationId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  type: string;
  title: string;
  message: string;
  priority?: string | null;
  milestoneStep?: number;
  taskTitle?: string;
  locationName?: string;
  teamName?: string;
  actionUrl?: string;
}
