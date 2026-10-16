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
export async function sendWahaTextMessage(
  wahaConfig: WahaConfig,
  recipientPhone: string,
  text: string
): Promise<WahaSendResult> {
  if (!wahaConfig.endpoint || !recipientPhone) {
    return {
      success: false,
      error: "WAHA Endpoint ou destinatário não configurados.",
    };
  }

  const endpointUrl = wahaConfig.endpoint.replace(/\/+$/, "");
  const session = wahaConfig.session || "default";
  const chatId = normalizeWhatsAppNumber(recipientPhone);

  const url = `${endpointUrl}/api/sendText`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (wahaConfig.apiKey) {
      headers["X-Api-Key"] = wahaConfig.apiKey;
      headers["Authorization"] = `Bearer ${wahaConfig.apiKey}`;
    }

    const payload = {
      chatId,
      text,
      session,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn(`[WAHA Service] Falha ao enviar mensagem (Status ${response.status}):`, errorText.slice(0, 200));
      return {
        success: false,
        error: `Servidor WAHA retornou erro HTTP ${response.status}`,
      };
    }

    const data = (await response.json().catch(() => ({}))) as any;
    return {
      success: true,
      messageId: data?.id || data?.messageId || "sent",
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err?.name === "AbortError";
    const errorMsg = isAbort ? "Timeout na conexão com o WAHA (8s)." : (err?.message || "Erro desconhecido");
    console.warn(`[WAHA Service] Erro de rede na integração:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Resolve as credenciais do WAHA utilizando prioritariamente as variáveis de ambiente globais do Tarefaí
 * ou configurações específicas caso informadas.
 */
export function resolveWahaConfig(customConfig?: Partial<WahaConfig>): WahaConfig | null {
  const endpoint = (customConfig?.endpoint || process.env.WAHA_API_URL || process.env.WAHA_ENDPOINT || "").trim();
  if (!endpoint) return null;

  const session = (customConfig?.session || process.env.WAHA_SESSION || "default").trim();
  const apiKey = (customConfig?.apiKey || process.env.WAHA_API_KEY || "").trim() || undefined;

  return {
    endpoint,
    session: session || "default",
    apiKey,
  };
}

/**
 * Verifica o status da sessão no servidor WAHA
 */
export async function checkWahaSessionStatus(
  wahaConfig?: Partial<WahaConfig>
): Promise<{ status: string; connected: boolean; error?: string }> {
  const resolved = resolveWahaConfig(wahaConfig);
  if (!resolved || !resolved.endpoint) {
    return { status: "NOT_CONFIGURED", connected: false, error: "WAHA_API_URL não configurada no servidor." };
  }

  const endpointUrl = resolved.endpoint.replace(/\/+$/, "");
  const session = resolved.session || "default";
  const url = `${endpointUrl}/api/sessions/${session}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: Record<string, string> = {};
    if (resolved.apiKey) {
      headers["X-Api-Key"] = resolved.apiKey;
      headers["Authorization"] = `Bearer ${resolved.apiKey}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { status: `HTTP_${response.status}`, connected: false };
    }

    const data = (await response.json().catch(() => ({}))) as any;
    const status = data?.status || "UNKNOWN";
    const connected = status === "WORKING" || status === "SCAN_QR_CODE" || status === "STARTING";

    return { status, connected };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      status: "UNREACHABLE",
      connected: false,
      error: err?.message || "Servidor WAHA inacessível",
    };
  }
}

export interface MaybeDispatchWhatsAppAlertParams {
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
    const org = await prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { name: true, settings: true },
    });

    if (!org) return null;

    const settings = (org.settings as any) || {};
    const whatsappAlerts: WhatsAppAlertSettings | undefined = settings.whatsappAlerts;

    if (!whatsappAlerts?.enabled || !whatsappAlerts?.recipientPhone) {
      return null;
    }

    const waha = resolveWahaConfig(settings.waha);
    if (!waha || !waha.endpoint) {
      return null;
    }

    const isCritical = params.priority === "CRITICAL";
    const isHigh = params.priority === "HIGH";

    // 1. Filtro de tipos de notificações
    if (
      Array.isArray(whatsappAlerts.notificationTypes) &&
      whatsappAlerts.notificationTypes.length > 0 &&
      !whatsappAlerts.notificationTypes.includes(params.type)
    ) {
      if (!(isCritical && whatsappAlerts.alwaysUrgent)) {
        return null;
      }
    }

    // 2. Filtro de Criticidade
    const filter = whatsappAlerts.criticalityFilter || "CRITICAL_ONLY";
    if (filter === "CRITICAL_ONLY" && !isCritical) {
      return null;
    }
    if (filter === "HIGH_AND_CRITICAL" && !isCritical && !isHigh) {
      return null;
    }

    // 3. Filtro de Marco / Passo do Alerta (para atrasos e escalações)
    if (
      params.milestoneStep !== undefined &&
      whatsappAlerts.triggerStep > 0 &&
      params.milestoneStep < whatsappAlerts.triggerStep
    ) {
      if (!(isCritical && whatsappAlerts.alwaysUrgent)) {
        return null;
      }
    }

    // 4. Silenciamento fora do horário comercial (Não perturbar)
    if (whatsappAlerts.businessHoursOnly) {
      const now = new Date();
      const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const hours = brTime.getHours();
      const day = brTime.getDay(); // 0 = Domingo, 6 = Sábado
      const isWeekend = day === 0 || day === 6;
      const isOutsideHours = hours < 8 || hours >= 19;

      if ((isWeekend || isOutsideHours) && !(isCritical && whatsappAlerts.alwaysUrgent)) {
        return null;
      }
    }

    // 5. Formatação do Alerta Operacional
    const text = formatOperationalAlertMessage({
      organizationName: org.name,
      recipientPhone: whatsappAlerts.recipientPhone,
      title: params.title,
      message: params.message,
      type: params.type,
      priority: params.priority,
      milestoneStep: params.milestoneStep,
      taskTitle: params.taskTitle,
      locationName: params.locationName,
      teamName: params.teamName,
      actionUrl: params.actionUrl,
    });

    return await sendWahaTextMessage(waha, whatsappAlerts.recipientPhone, text);
  } catch (err: any) {
    console.warn("[WAHA Service] Falha ao processar despacho de alerta WhatsApp:", err?.message || err);
    return null;
  }
}

