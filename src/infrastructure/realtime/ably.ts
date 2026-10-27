import * as Ably from "ably";
import { eventBus } from "@/infrastructure/events/event-bus";

const globalForAbly = globalThis as unknown as {
  ablyRest?: Ably.Rest | null;
};

/**
 * Retorna a instância do cliente Ably.Rest singleton.
 * Resiliente a ambientes onde ABLY_API_KEY não foi configurada.
 */
export function getAblyRest(): Ably.Rest | null {
  if (globalForAbly.ablyRest) {
    return globalForAbly.ablyRest;
  }

  const key = process.env.ABLY_API_KEY;
  if (!key || !key.trim()) {
    return null;
  }

  try {
    globalForAbly.ablyRest = new Ably.Rest(key.trim());
  } catch (err) {
    console.error("[Ably REST] Erro ao instanciar cliente Ably:", err);
    globalForAbly.ablyRest = null;
  }

  return globalForAbly.ablyRest;
}

export const ablyRest = getAblyRest();

export interface PublishNotificationParams {
  organizationId: string;
  userId?: string;
  userIds?: string[];
  title: string;
  message: string;
  type: string;
  priority?: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  changeId?: string;
  clickAction?: string;
  timestamp?: string;
}

/**
 * Publica notificações em tempo real usando Ably.
 * Envia para os canais isolados por usuário (user:{userId}:notifications)
 * e para o canal da organização (org:{organizationId}:notifications).
 * Também repassa ao barramento em memória local para compatibilidade.
 */
export async function publishRealtimeNotification(
  params: PublishNotificationParams
): Promise<void> {
  const timestamp = params.timestamp || new Date().toISOString();
  const recipients = Array.from(
    new Set([
      ...(params.userId ? [params.userId] : []),
      ...(params.userIds || []),
    ])
  ).filter(Boolean);

  const payload = {
    notificationId: params.notificationId,
    changeId: params.changeId ?? params.notificationId,
    kinds: ["NOTIFICATIONS_CHANGED", ...(params.data?.taskId ? ["TASK_CHANGED"] : []), ...(params.data?.executionId ? ["EXECUTION_CHANGED"] : [])],
    organizationId: params.organizationId,
    title: params.title,
    message: params.message,
    type: params.type,
    priority: params.priority || "MEDIUM",
    data: params.data,
    clickAction: params.clickAction,
    timestamp,
  };

  // 1. Emite no barramento local (garante compatibilidade retroativa com SSE e workers na mesma VM)
  try {
    for (const userId of recipients) {
      eventBus.publish("NOTIFICATION_CREATED", params.organizationId, {
        ...payload,
        userId,
      });
    }
    if (recipients.length === 0) {
      eventBus.publish("NOTIFICATION_CREATED", params.organizationId, payload);
    }
  } catch {
    // Fail-safe silencioso para o eventBus
  }

  // 2. Dispara em tempo real via Ably para todos os clientes conectados
  const client = getAblyRest();
  if (!client) {
    return;
  }

  try {
    const promises: Promise<unknown>[] = [];

    // Publica no canal específico de cada destinatário
    for (const userId of recipients) {
      const userChannel = client.channels.get(`user:${userId}:notifications`);
      promises.push(
        userChannel.publish("notification:new", {
          ...payload,
          userId,
        })
      );
    }

    // Se não houver destinatário específico, publica no canal da organização
    if (recipients.length === 0) {
      const orgChannel = client.channels.get(
        `org:${params.organizationId}:notifications`
      );
      promises.push(orgChannel.publish("notification:new", payload));
    }

    await Promise.allSettled(promises);
  } catch (error) {
    console.error("[Ably Realtime] Falha ao publicar notificação em tempo real:", error);
  }
}

/**
 * Publica um evento arbitrário em um canal do Ably.
 */
export async function publishToChannel(
  channelName: string,
  eventName: string,
  data: unknown
): Promise<boolean> {
  const client = getAblyRest();
  if (!client) return false;
  try {
    const channel = client.channels.get(channelName);
    await channel.publish(eventName, data);
    return true;
  } catch (error) {
    console.error(`[Ably REST] Erro ao publicar em ${channelName}:`, error);
    return false;
  }
}
