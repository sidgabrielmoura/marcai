import { prisma } from "@/infrastructure/database/prisma";
import { eventBus } from "@/infrastructure/events/event-bus";
import { Priority, Role } from "@/domain/types";

export interface SendNotificationParams {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  priority?: Priority;
  data?: Record<string, unknown>;
  channels?: Array<"INTERNAL" | "EMAIL" | "PUSH">;
}

/**
 * Serviço de Notificação Multi-canal e Rastreabilidade de Entrega (Item 37, 60).
 * Registra a notificação, persiste as entregas por canal e dispara em tempo real no eventBus.
 */
export async function sendNotification(params: SendNotificationParams) {
  const priority = params.priority || Priority.MEDIUM;
  const channels = params.channels || ["INTERNAL", "PUSH", "EMAIL"];

  const notification = await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      type: params.type,
      priority: priority as any,
      title: params.title,
      message: params.message,
      data: params.data ? (params.data as any) : undefined,
      deliveries: {
        create: channels.map((channel) => ({
          channel,
          status: "SENT",
          sentAt: new Date(),
        })),
      },
    },
    include: {
      deliveries: true,
    },
  });

  // Emite evento em tempo real via eventBus para os clientes conectados
  eventBus.publish("NOTIFICATION_CREATED", params.organizationId, {
    notificationId: notification.id,
    userId: params.userId,
    title: params.title,
    message: params.message,
    priority: notification.priority,
  });

  return notification;
}
