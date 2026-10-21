import { prisma } from "@/infrastructure/database/prisma";
import { Prisma } from "@prisma/client";
import { eventBus } from "@/infrastructure/events/event-bus";
import { Priority, Role } from "@/domain/types";
import { sendWebPushNotification } from "@/infrastructure/firebase/firebase-admin";
import { sendOperationalAlertEmail } from "@/infrastructure/email";
import { publishRealtimeNotification } from "@/infrastructure/realtime/ably";

export interface SendNotificationParams {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  priority?: Priority;
  data?: Record<string, unknown>;
  channels?: Array<"INTERNAL" | "EMAIL" | "PUSH">;
  clickAction?: string;
  forcePush?: boolean;
}

export const PUSH_ELIGIBLE_TYPES = new Set([
  "TASK_ASSIGNED",
  "TASK_UNBLOCKED",
  "TASK_TOLERANCE_EXCEEDED",
  "APPROVAL_UPDATED",
  "APPROVAL_OVERDUE",
  "TASK_CANCELLED",
  "TASK_TRANSFERRED_OUT",
  "EXECUTION_COMPLETED",
  "TASK_OVERDUE",
  "TASK_EXPIRING_SOON",
  "SLA_BREACH",
  "APPROVAL_REQUESTED",
  "TASK_CORRECTION_REQUESTED",
  "PAUSE_ALERT",
  "CRITICAL_TASK_ALERT",
  "OPERATIONAL_ALERT",
  "VALIDATION_EXCEPTION",
]);

export function isPushEligible(type: string, priority?: string): boolean {
  if (priority === "CRITICAL" || priority === "HIGH") {
    if (PUSH_ELIGIBLE_TYPES.has(type)) return true;
  }
  return PUSH_ELIGIBLE_TYPES.has(type);
}

export interface DispatchNotificationAsyncParams {
  organizationId: string;
  userIds: string[];
  type: string;
  title: string;
  message: string;
  priority?: Priority | string;
  data?: Record<string, unknown>;
  clickAction?: string;
  forcePush?: boolean;
  forceEmail?: boolean;
}

/**
 * Despacha eventos em tempo real (In-App via SSE/eventBus), Web Push (via FCM)
 * e E-mail (via Resend) para múltiplos destinatários de forma assíncrona e resiliente.
 */
export async function dispatchNotificationAsync(params: DispatchNotificationAsyncParams): Promise<void> {
  const uniqueUsers = Array.from(new Set(params.userIds)).filter(Boolean);
  if (uniqueUsers.length === 0) return;

  const shouldSendPush =
    params.forcePush !== undefined
      ? params.forcePush
      : isPushEligible(params.type, String(params.priority || ""));

  // 1. Emite em tempo real via Ably (e local eventBus)
  void publishRealtimeNotification({
    organizationId: params.organizationId,
    userIds: uniqueUsers,
    title: params.title,
    message: params.message,
    type: params.type,
    priority: String(params.priority || "MEDIUM"),
    data: params.data,
    clickAction: params.clickAction,
  });

  // 2. Dispara Push via Firebase Cloud Messaging para Web e Mobile em tempo real
  if (shouldSendPush) {
    try {
      const userTokens = await prisma.userDeviceToken.findMany({
        where: { userId: { in: uniqueUsers } },
        select: { token: true },
      });

      const nativeInstallations = await prisma.$queryRaw<Array<{ token: string }>>`
        SELECT token
        FROM mobile_installations
        WHERE user_id IN (${Prisma.join(uniqueUsers)})
          AND organization_id = ${params.organizationId}
          AND revoked_at IS NULL
          AND permission IN ('authorized', 'provisional')
          AND last_sync_at > now() - interval '45 days'
      `;

      const allTokens = Array.from(new Set([
        ...userTokens.map((t) => t.token),
        ...nativeInstallations.map((i) => i.token),
      ])).filter(Boolean);

      if (allTokens.length > 0) {
        const clickAction =
          params.clickAction ||
          ((params.data as any)?.taskId
            ? `/tasks/${(params.data as any).taskId}`
            : "/notifications");

        const pushResult = await sendWebPushNotification({
          tokens: allTokens,
          title: params.title,
          body: params.message,
          data: {
            organizationId: params.organizationId,
            type: params.type,
            ...(params.data ? (params.data as Record<string, string | number | boolean>) : {}),
          },
          clickAction,
        });

        // Limpa tokens expirados ou revogados (Token Hygiene)
        if (pushResult.invalidTokens.length > 0) {
          await prisma.userDeviceToken.deleteMany({
            where: { token: { in: pushResult.invalidTokens } },
          });
          await prisma.$executeRaw`
            UPDATE mobile_installations
            SET revoked_at = now()
            WHERE token IN (${Prisma.join(pushResult.invalidTokens)})
          `;
        }
      }
    } catch (pushErr) {
      console.error("[Notification Service] Erro ao enviar Web/Mobile Push assíncrono:", pushErr);
    }
  }

  // 3. Se for de prioridade CRITICAL ou forceEmail for solicitado, despacha e-mail via Resend
  const shouldSendEmail = params.forceEmail || params.priority === "CRITICAL";
  if (shouldSendEmail) {
    try {
      const usersWithEmail = await prisma.user.findMany({
        where: { id: { in: uniqueUsers }, email: { not: null } },
        select: { id: true, email: true },
      });

      const emails = usersWithEmail
        .map((u) => u.email)
        .filter(Boolean) as string[];

      if (emails.length > 0) {
        const org = await prisma.organization.findUnique({
          where: { id: params.organizationId },
          select: { name: true },
        });

        void sendOperationalAlertEmail(emails, {
          orgName: org?.name || "Marcai",
          title: params.title,
          message: params.message,
          priority: String(params.priority || "NORMAL"),
          actionUrl: params.clickAction,
          actionLabel: "Abrir no Marcai",
        });
      }
    } catch (emailErr) {
      console.error("[Notification Service] Erro ao despachar e-mail assíncrono:", emailErr);
    }
  }

  // 4. Se a organização possuir alertas por WhatsApp habilitados via WAHA, despacha assincronamente
  try {
    const { maybeDispatchWhatsAppAlert } = await import("@/infrastructure/whatsapp/waha-service");
    void maybeDispatchWhatsAppAlert({
      organizationId: params.organizationId,
      type: params.type,
      title: params.title,
      message: params.message,
      priority: String(params.priority || "NORMAL"),
      milestoneStep: typeof (params.data as any)?.milestone === "number" ? (params.data as any).milestone : undefined,
      taskTitle: typeof (params.data as any)?.taskTitle === "string" ? (params.data as any).taskTitle : undefined,
      actionUrl: params.clickAction,
    });
  } catch (waErr) {
    // Fail-safe silencioso para nunca afetar outras notificações
  }
}


/**
 * Serviço de Notificação Multi-canal e Rastreabilidade de Entrega (Item 37, 60).
 * Registra a notificação, persiste as entregas por canal, envia Web Push via FCM
 * e dispara em tempo real no eventBus.
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

  // Emite notificação em tempo real via Ably (e local eventBus)
  void publishRealtimeNotification({
    organizationId: params.organizationId,
    userId: params.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    priority: notification.priority,
    data: params.data,
    notificationId: notification.id,
    clickAction: params.clickAction,
  });

  // Disparo de Web/Mobile Push Notification via Firebase Cloud Messaging em tempo real
  if (channels.includes("PUSH")) {
    try {
      const userTokens = await prisma.userDeviceToken.findMany({
        where: { userId: params.userId },
        select: { token: true },
      });

      const nativeInstallations = await prisma.$queryRaw<Array<{ token: string }>>`
        SELECT token
        FROM mobile_installations
        WHERE user_id = ${params.userId}
          AND organization_id = ${params.organizationId}
          AND revoked_at IS NULL
          AND permission IN ('authorized', 'provisional')
          AND last_sync_at > now() - interval '45 days'
      `;

      const allTokens = Array.from(new Set([
        ...userTokens.map((t) => t.token),
        ...nativeInstallations.map((i) => i.token),
      ])).filter(Boolean);

      if (allTokens.length > 0) {
        const pushResult = await sendWebPushNotification({
          tokens: allTokens,
          title: params.title,
          body: params.message,
          data: {
            notificationId: notification.id,
            organizationId: params.organizationId,
            type: params.type,
            ...(params.data ? (params.data as Record<string, string | number | boolean>) : {}),
          },
          clickAction: params.data?.taskId
            ? `/tasks/${params.data.taskId}`
            : "/notifications",
        });

        // Limpa tokens obsoletos/revogados do banco de dados (Token Hygiene)
        if (pushResult.invalidTokens.length > 0) {
          await prisma.userDeviceToken.deleteMany({
            where: { token: { in: pushResult.invalidTokens } },
          });
          await prisma.$executeRaw`
            UPDATE mobile_installations
            SET revoked_at = now()
            WHERE token IN (${Prisma.join(pushResult.invalidTokens)})
          `;
        }

        const pushDelivery = notification.deliveries.find((d) => d.channel === "PUSH");
        if (pushDelivery) {
          await prisma.notificationDelivery.update({
            where: { id: pushDelivery.id },
            data: {
              status: pushResult.successCount > 0 ? "DELIVERED" : "FAILED",
              error: pushResult.errors.length > 0 ? pushResult.errors.join("; ").slice(0, 500) : null,
            },
          });
        }
      } else {
        const pushDelivery = notification.deliveries.find((d) => d.channel === "PUSH");
        if (pushDelivery) {
          await prisma.notificationDelivery.update({
            where: { id: pushDelivery.id },
            data: {
              status: "SKIPPED_NO_DEVICES",
            },
          });
        }
      }
    } catch (pushError) {
      console.error("[Notification Service] Erro ao enviar Web Push via Firebase:", pushError);
    }
  }

  // Disparo de E-mail via Resend
  if (channels.includes("EMAIL")) {
    try {
      const emailDelivery = notification.deliveries.find((d) => d.channel === "EMAIL");
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { name: true, email: true },
      });

      if (user?.email) {
        const org = await prisma.organization.findUnique({
          where: { id: params.organizationId },
          select: { name: true },
        });

        const actionUrl =
          params.clickAction ||
          (params.data?.taskId ? `/tasks/${params.data.taskId}` : undefined);

        const emailResult = await sendOperationalAlertEmail(user.email, {
          orgName: org?.name || "Marcai",
          title: params.title,
          message: params.message,
          priority: String(priority),
          actionUrl,
          actionLabel: "Abrir no Marcai",
        });

        if (emailDelivery) {
          await prisma.notificationDelivery.update({
            where: { id: emailDelivery.id },
            data: {
              status: emailResult.success ? "DELIVERED" : "FAILED",
              error: emailResult.error || null,
            },
          });
        }
      } else if (emailDelivery) {
        await prisma.notificationDelivery.update({
          where: { id: emailDelivery.id },
          data: {
            status: "SKIPPED_NO_EMAIL",
          },
        });
      }
    } catch (emailError: any) {
      console.error("[Notification Service] Erro ao enviar e-mail via Resend:", emailError);
    }
  }

  return notification;
}

