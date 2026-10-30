/**
 * Serviço de Integração WhatsApp via WAHA (WhatsApp HTTP API).
 *
 * Este módulo gerencia o roteamento de notificações operacionais e alertas críticos
 * aos contatos ou grupos dos gestores via API REST do WAHA.
 *
 * Diretrizes de Segurança e Resiliência:
 * - Timeouts rigorosos em chamadas de rede (máximo 8s).
 * - Não expõe chaves ou tokens em logs.
 * - Falhas de entrega no WhatsApp nunca bloqueiam ou revertem operações no banco de dados.
 */

import { prisma } from "@/infrastructure/database/prisma";
import { wahaClient } from "./waha-client";
import { publicWhatsAppError } from "@/domain/whatsapp/contracts";

export interface WahaConfig {
  endpoint: string;
  session: string;
  apiKey?: string;
}

export interface WhatsAppAlertSettings {
  enabled: boolean;
  recipientPhone: string;
  recipientName?: string;
  notificationTypes: string[];
  criticalityFilter: "CRITICAL_ONLY" | "HIGH_AND_CRITICAL" | "ALL";
  triggerStep: number;
  repeatInterval: number;
  businessHoursOnly: boolean;
  alwaysUrgent: boolean;
}

export interface SendWhatsAppAlertParams {
  organizationName: string;
  recipientPhone: string;
  title: string;
  message: string;
  type: string;
  priority?: string;
  milestoneStep?: number;
  taskTitle?: string;
  locationName?: string;
  teamName?: string;
  actionUrl?: string;
}

export interface WahaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normaliza o número de telefone para o padrão do WhatsApp (JID: 5511999999999@c.us ou @g.us)
 */
export function normalizeWhatsAppNumber(phone: string): string {
  const clean = phone.trim().replace(/[^\d@a-zA-Z._-]/g, "");
  if (clean.includes("@")) {
    return clean;
  }
  // Se não possuir sufixo, adiciona @c.us
  return `${clean}@c.us`;
}

/**
 * Formata mensagem operacional para WhatsApp com tipografia rica e emojis
 */
export function formatOperationalAlertMessage(params: SendWhatsAppAlertParams): string {
  const isCritical = params.priority === "CRITICAL";
  const priorityBadge = isCritical ? "🚨 *URGENTE / CRÍTICA*" : params.priority ? `⚠️ *${params.priority}*` : "";

  const lines: string[] = [
    `*Tarefaí Alertas* · _${params.organizationName}_`,
    "",
    `🔔 *${params.title}*`,
  ];

  if (priorityBadge) {
    lines.push(priorityBadge);
  }

  if (params.taskTitle) {
    lines.push(`📋 *Tarefa:* ${params.taskTitle}`);
  }

  if (params.locationName) {
    lines.push(`📍 *Unidade:* ${params.locationName}`);
  }

  if (params.teamName) {
    lines.push(`👥 *Equipe:* ${params.teamName}`);
  }

  if (params.milestoneStep !== undefined && params.milestoneStep > 0) {
    lines.push(`⏱️ *Escalação:* ${params.milestoneStep}º Marco de Atraso`);
  }

  lines.push("");
  lines.push(`📝 *Detalhes:*`);
  lines.push(params.message);

  if (params.actionUrl) {
    lines.push("");
    lines.push(`🔗 *Acessar no sistema:* ${params.actionUrl}`);
  }

  lines.push("");
  lines.push(`_Enviado automaticamente pelo sistema de monitoramento operacional Tarefaí._`);

  return lines.join("\n");
}

/**
 * Dispara um alerta para o WhatsApp utilizando a API REST do WAHA.
 * Fail-safe: não propaga exceções que interrompam o fluxo principal.
 */
export async function sendWahaTextMessage(wahaConfig: WahaConfig, recipientPhone: string, text: string): Promise<WahaSendResult> {
  try {
    const result = await wahaClient.sendText(wahaConfig.session, recipientPhone, text);
    return { success: true, ...result };
  } catch (error) { return { success: false, error: publicWhatsAppError(error).error }; }
}

/**
 * Resolve as credenciais do WAHA utilizando prioritariamente as variáveis de ambiente globais do Tarefaí
 * ou configurações específicas caso informadas.
 */
export function resolveWahaConfig(customConfig?: Partial<WahaConfig>): WahaConfig | null {
  const endpoint = (process.env.WAHA_BASE_URL || process.env.WAHA_API_URL || process.env.WAHA_ENDPOINT || "").trim();
  if (!endpoint) return null;

  const session = (customConfig?.session || process.env.WAHA_SESSION || "default").trim();
  const apiKey = (process.env.WAHA_KEY || process.env.WAHA_API_KEY || "").trim() || undefined;

  return {
    endpoint,
    session: session || "default",
    apiKey,
  };
}

/**
 * Verifica o status da sessão no servidor WAHA
 */
export async function checkWahaSessionStatus(wahaConfig?: Partial<WahaConfig>): Promise<{ status: string; connected: boolean; error?: string }> {
  try {
    const session = await wahaClient.getSession(wahaConfig?.session || process.env.WAHA_SESSION || "default");
    return { status: session?.status || "NOT_FOUND", connected: session?.status === "WORKING" };
  } catch (error) { return { status: "UNREACHABLE", connected: false, error: publicWhatsAppError(error).error }; }
}

export interface MaybeDispatchWhatsAppAlertParams {
  taskId?: string;
  executionId?: string;
  locationId?: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  priority?: string;
  milestoneStep?: number;
  taskTitle?: string;
  locationName?: string;
  teamName?: string;
  actionUrl?: string;
}

/**
 * Avalia se a organização possui regras ativas de alerta via WhatsApp e despacha a mensagem pelo WAHA.
 * Execução 100% resiliente: não gera throws para chamadores externos.
 */
export async function maybeDispatchWhatsAppAlert(
  params: MaybeDispatchWhatsAppAlertParams
): Promise<WahaSendResult | null> {
  try {
    const { registerOperationalAlert } = await import("@/application/whatsapp/alerts");
    const result = await registerOperationalAlert({
      organizationId: params.organizationId,
      locationId: params.locationId,
      taskId: params.taskId,
      executionId: params.executionId,
      type: params.type,
      title: params.title,
      message: params.message,
      priority: params.priority,
      milestoneStep: params.milestoneStep,
      taskTitle: params.taskTitle,
      locationName: params.locationName,
      teamName: params.teamName,
      actionUrl: params.actionUrl,
    });
    return result ? { success: true } : null;
  } catch (err: any) {
    console.warn("[whatsapp] Alert dispatch failed", { code: "ALERT_DISPATCH_FAILED" });
    return null;
  }
}

export { WHATSAPP_EVENT_TYPES } from "@/domain/whatsapp/contracts";


