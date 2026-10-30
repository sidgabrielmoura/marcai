import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import {
  type RegisterAlertParams,
  type WhatsAppAlertSettings,
  WHATSAPP_EVENT_TYPES,
  whatsappAlertSettingsSchema,
  WhatsAppError,
} from "@/domain/whatsapp/contracts";
import { formatOperationalAlertMessage } from "@/domain/whatsapp/formatter";
import {
  isLocationOpenAt,
  getNextOperatingOpening,
  type LocationOperatingRules,
} from "@/domain/rules/operating-hours";
import { wahaClient } from "@/infrastructure/whatsapp/waha-client";

export interface AlertRuleEvaluation {
  eligible: boolean;
  suppressionReason?: string;
  scheduledFor: Date;
}

/**
 * Avalia as regras configuradas pelo proprietário para determinar se um alerta
 * deve ser disparado, agendado para o próximo horário comercial ou suprimido.
 */
export function evaluateAlertRules(
  settings: WhatsAppAlertSettings,
  params: {
    type: string;
    priority?: string | null;
    milestoneStep?: number;
    location?: LocationOperatingRules | null;
  },
  now = new Date()
): AlertRuleEvaluation {
  if (!settings.enabled) {
    return { eligible: false, suppressionReason: "ALERTS_DISABLED", scheduledFor: now };
  }

  const isCritical = params.priority === "CRITICAL";
  const isUrgent = isCritical && settings.alwaysUrgent;

  // Se não for urgente, aplica todos os filtros configurados
  if (!isUrgent) {
    // 1. Tipos de Notificação: lista vazia não envia nada
    if (!settings.notificationTypes || settings.notificationTypes.length === 0) {
      return { eligible: false, suppressionReason: "NO_NOTIFICATION_TYPES_CONFIGURED", scheduledFor: now };
    }

    const matchesType = settings.notificationTypes.some(selected =>
      (WHATSAPP_EVENT_TYPES[selected] || [selected]).includes(params.type)
    );
    if (!matchesType) {
      return { eligible: false, suppressionReason: "EVENT_TYPE_FILTERED", scheduledFor: now };
    }

    // 2. Filtro de Criticidade
    if (settings.criticalityFilter === "CRITICAL_ONLY" && !isCritical) {
      return { eligible: false, suppressionReason: "CRITICALITY_FILTERED", scheduledFor: now };
    }
    if (settings.criticalityFilter === "HIGH_AND_CRITICAL" && !isCritical && params.priority !== "HIGH") {
      return { eligible: false, suppressionReason: "CRITICALITY_FILTERED", scheduledFor: now };
    }

    // 3. Marco de Atraso (triggerStep): marco mínimo
    if (
      settings.triggerStep > 0 &&
      params.milestoneStep !== undefined &&
      params.milestoneStep < settings.triggerStep
    ) {
      return { eligible: false, suppressionReason: "MILESTONE_STEP_BELOW_TRIGGER", scheduledFor: now };
    }

    // 4. Horário Comercial: se fechado, agenda para a próxima abertura da unidade
    if (settings.businessHoursOnly && params.location) {
      const open = isLocationOpenAt(params.location, now);
      if (!open) {
        const nextOpening = getNextOperatingOpening(params.location, now);
        return { eligible: true, suppressionReason: "WAITING_BUSINESS_HOURS", scheduledFor: nextOpening };
      }
    }
  }

  return { eligible: true, scheduledFor: now };
}

/**
 * Registra um alerta operacional de forma atômica e idempotente no banco de dados.
 * Cria a ocorrência (`WhatsAppAlertOccurrence`) e as entregas (`WhatsAppAlertDelivery`) individuais.
 */
export async function registerOperationalAlert(params: RegisterAlertParams) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: params.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, settings: true },
    });
    if (!org) return null;

    const rawSettings = (org.settings as Record<string, unknown> | null)?.whatsappAlerts;
    const parsedSettings = whatsappAlertSettingsSchema.safeParse(rawSettings);
    if (!parsedSettings.success || !parsedSettings.data.enabled) {
      return null;
    }
    const settings = parsedSettings.data;

    // Resolução da Unidade e Metadados
    let locationId = params.locationId;
    let resolvedTaskTitle = params.taskTitle;
    let resolvedTeamName = params.teamName;
    let resolvedProcessName: string | undefined;

    if (params.taskId) {
      const task = await prisma.task.findUnique({
        where: { id: params.taskId },
        select: {
          locationId: true,
          title: true,
          team: { select: { name: true } },
        },
      });
      if (task) {
        if (!locationId) locationId = task.locationId;
        if (!resolvedTaskTitle) resolvedTaskTitle = task.title;
        if (!resolvedTeamName && task.team?.name) resolvedTeamName = task.team.name;
      }
    } else if (params.executionId) {
      const exec = await prisma.processExecution.findUnique({
        where: { id: params.executionId },
        select: {
          locationId: true,
          process: { select: { locationId: true, name: true } },
        },
      });
      if (exec) {
        if (!locationId) locationId = exec.locationId || exec.process?.locationId || null;
        if (exec.process?.name) resolvedProcessName = exec.process.name;
      }
    }

    if (!locationId) {
      // Fallback: se o alerta for de nível da organização ou a entidade não especificar unidade,
      // utiliza a unidade ativa padrão/primária da organização
      const defaultLoc = await prisma.location.findFirst({
        where: { organizationId: params.organizationId, status: "ACTIVE" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      locationId = defaultLoc?.id || null;
    }

    if (!locationId) {
      return null;
    }

    const location = await prisma.location.findFirst({
      where: { id: locationId, organizationId: params.organizationId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        timezone: true,
        openingTime: true,
        closingTime: true,
        operatingDays: true,
      },
    });
    if (!location) {
      return null;
    }

    const now = new Date();
    const evaluation = evaluateAlertRules(settings, {
      type: params.type,
      priority: params.priority,
      milestoneStep: params.milestoneStep,
      location,
    }, now);

    if (!evaluation.eligible) {
      return null;
    }

    // Busca os destinatários cadastrados pelo proprietário
    const recipients = await prisma.whatsAppRecipient.findMany({
      where: { organizationId: params.organizationId },
      select: { phone: true, name: true },
      orderBy: { phone: "asc" },
    });
    if (!recipients.length) {
      return null;
    }

    // Busca a instância ativa do WhatsApp da unidade
    let instance = await prisma.whatsAppInstance.findFirst({
      where: {
        organizationId: params.organizationId,
        locationId: location.id,
        status: "WORKING",
      },
      select: { id: true, session: true },
    });

    if (!instance) {
      // Fallback: busca qualquer instância conectada ativa da organização
      instance = await prisma.whatsAppInstance.findFirst({
        where: {
          organizationId: params.organizationId,
          status: "WORKING",
        },
        select: { id: true, session: true },
        orderBy: { createdAt: "asc" },
      });
    }

    // Chave única canônica do incidente
    const incidentKey = params.taskId
      ? `task:${params.taskId}:${params.type}:step_${params.milestoneStep ?? 0}`
      : params.executionId
        ? `execution:${params.executionId}:${params.type}:step_${params.milestoneStep ?? 0}`
        : `org:${params.organizationId}:${params.type}:${now.toISOString().slice(0, 10)}`;

    const messageText = formatOperationalAlertMessage({
      organizationName: org.name,
      title: params.title,
      message: params.message,
      type: params.type,
      priority: params.priority,
      milestoneStep: params.milestoneStep,
      taskTitle: resolvedTaskTitle,
      processName: resolvedProcessName,
      locationName: location.name,
      teamName: resolvedTeamName,
      actionUrl: params.actionUrl,
    });

    const isScheduledFuture = evaluation.scheduledFor.getTime() > now.getTime() + 1000;
    const initialStatus = isScheduledFuture ? "SCHEDULED" : "PENDING";

    const occurrence = await prisma.$transaction(async tx => {
      // Upsert atômico da ocorrência
      const occ = await tx.whatsAppAlertOccurrence.upsert({
        where: {
          organizationId_incidentKey: {
            organizationId: params.organizationId,
            incidentKey,
          },
        },
        create: {
          organizationId: params.organizationId,
          locationId: location.id,
          taskId: params.taskId || null,
          executionId: params.executionId || null,
          incidentKey,
          eventType: params.type,
          priority: params.priority || null,
          milestoneStep: params.milestoneStep ?? 0,
          title: params.title,
          message: messageText,
          actionUrl: params.actionUrl || null,
          status: "ACTIVE",
          isResolved: false,
          repeatInterval: settings.repeatInterval || 0,
          repeatCount: 0,
          nextRepeatAt: null,
        },
        update: {
          // Atualiza dados caso ocorra alteração na mesma ocorrência não resolvida
          title: params.title,
          message: messageText,
          actionUrl: params.actionUrl || null,
        },
      });

      // Se a ocorrência já estava resolvida, não reenvia
      if (occ.isResolved) {
        return occ;
      }

      // Criação das entregas para cada destinatário (round 0)
      for (const recipient of recipients) {
        await tx.whatsAppAlertDelivery.upsert({
          where: {
            occurrenceId_recipientPhone_round: {
              occurrenceId: occ.id,
              recipientPhone: recipient.phone,
              round: 0,
            },
          },
          create: {
            occurrenceId: occ.id,
            organizationId: params.organizationId,
            locationId: location.id,
            instanceId: instance?.id || null,
            session: instance?.session || null,
            recipientPhone: recipient.phone,
            recipientName: recipient.name || null,
            round: 0,
            status: initialStatus,
            suppressionReason: evaluation.suppressionReason || null,
            scheduledFor: evaluation.scheduledFor,
          },
          update: {},
        });
      }

      return occ;
    });

    // Disparo imediato síncrono/fail-safe se estiver pronto (PENDING)
    if (!isScheduledFuture && instance) {
      try {
        await dispatchPendingWhatsAppAlerts({ organizationId: params.organizationId });
      } catch (dispatchErr) {
        console.warn("[whatsapp-alerts] Immediate dispatch failed, will retry:", dispatchErr);
      }
    }

    return {
      occurrenceId: occurrence.id,
      scheduledFor: evaluation.scheduledFor,
      deliveriesCount: recipients.length,
    };
  } catch (error) {
    console.warn("[whatsapp-alerts] Registration failed:", error);
    return null;
  }
}

/**
 * Worker para despachar entregas pendentes com lease distribuído e concorrência segura.
 */
export async function dispatchPendingWhatsAppAlerts(options?: {
  organizationId?: string;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = Math.min(options?.limit || 20, 50);
  const leaseToken = randomUUID();
  const leaseUntil = new Date(Date.now() + 60000); // 60 segundos de lease
  const now = new Date();

  // 1. Busca entregas elegíveis (PENDING com scheduledFor <= now e lease livre)
  const candidates = await prisma.whatsAppAlertDelivery.findMany({
    where: {
      status: "PENDING",
      AND: [
        { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      ],
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
      occurrence: { isResolved: false, status: "ACTIVE" },
    },
    select: { id: true },
    take: limit,
  });

  if (!candidates.length) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const candidateIds = candidates.map(c => c.id);

  // 2. Reclama atomicamente com lease
  await prisma.whatsAppAlertDelivery.updateMany({
    where: {
      id: { in: candidateIds },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseToken,
      leaseUntil,
      status: "PROCESSING",
    },
  });

  // 3. Lê as entregas sob posse deste worker
  const claimedDeliveries = await prisma.whatsAppAlertDelivery.findMany({
    where: {
      id: { in: candidateIds },
      leaseToken,
    },
    include: {
      occurrence: {
        include: {
          organization: { select: { id: true, status: true } },
          location: { select: { id: true, status: true } },
        },
      },
      instance: { select: { id: true, session: true, status: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const delivery of claimedDeliveries) {
    try {
      // Revalidação de elegibilidade no momento do envio
      if (
        delivery.occurrence.isResolved ||
        delivery.occurrence.organization.status !== "ACTIVE" ||
        (delivery.occurrence.location && delivery.occurrence.location.status !== "ACTIVE")
      ) {
        await prisma.whatsAppAlertDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "CANCELLED",
            suppressionReason: "RESOURCE_INACTIVE_OR_RESOLVED",
            leaseToken: null,
            leaseUntil: null,
          },
        });
        continue;
      }

      // Resolução da sessão ativa
      let session = delivery.instance?.session;
      let instanceId = delivery.instance?.id;

      if (!session || delivery.instance?.status !== "WORKING") {
        let working = await prisma.whatsAppInstance.findFirst({
          where: {
            organizationId: delivery.organizationId,
            locationId: delivery.locationId || undefined,
            status: "WORKING",
          },
          select: { id: true, session: true },
        });

        if (!working) {
          working = await prisma.whatsAppInstance.findFirst({
            where: {
              organizationId: delivery.organizationId,
              status: "WORKING",
            },
            select: { id: true, session: true },
            orderBy: { createdAt: "asc" },
          });
        }

        if (working) {
          session = working.session;
          instanceId = working.id;
        } else {
          // Sem instância ativa no momento: adia para tentar novamente em 3 minutos
          await prisma.whatsAppAlertDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "PENDING",
              scheduledFor: new Date(Date.now() + 3 * 60 * 1000),
              lastError: "Instância da unidade não está conectada (WORKING).",
              leaseToken: null,
              leaseUntil: null,
            },
          });
          failed++;
          continue;
        }
      }

      // Envia via client WAHA (faz check-exists e sendText)
      const result = await wahaClient.sendText(session, delivery.recipientPhone, delivery.occurrence.message);

      const resAny = result as any;
      const messageId = (resAny?.id || resAny?.messageId || resAny?.key?.id || null) as string | null;
      const messageIdHash = messageId
        ? createHash("sha256").update(messageId).digest("hex")
        : null;

      await prisma.whatsAppAlertDelivery.update({
        where: { id: delivery.id },
        data: {
          instanceId,
          session,
          status: "SENT",
          providerMessageId: messageId,
          providerMessageIdHash: messageIdHash,
          providerAck: 1, // SERVER
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          leaseToken: null,
          leaseUntil: null,
        },
      });

      // Se repetição configurada, agenda próxima execução na ocorrência
      if (delivery.occurrence.repeatInterval > 0) {
        await prisma.whatsAppAlertOccurrence.update({
          where: { id: delivery.occurrence.id },
          data: {
            nextRepeatAt: new Date(Date.now() + delivery.occurrence.repeatInterval * 60 * 1000),
          },
        });
      }

      sent++;
    } catch (error: unknown) {
      failed++;
      const isRecipientUnavailable =
        error instanceof WhatsAppError && error.code === "RECIPIENT_UNAVAILABLE";
      const nextAttempts = delivery.attempts + 1;
      const isPermanent = isRecipientUnavailable || nextAttempts >= 3;

      const errorMessage =
        error instanceof Error ? error.message.slice(0, 500) : "Erro de comunicação com o WhatsApp.";

      await prisma.whatsAppAlertDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isPermanent ? "FAILED" : "PENDING",
          scheduledFor: isPermanent ? null : new Date(Date.now() + nextAttempts * 90 * 1000),
          attempts: { increment: 1 },
          lastError: errorMessage,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }
  }

  return { processed: claimedDeliveries.length, sent, failed };
}

/**
 * Cria rodadas de repetição para ocorrências ativas cujo `nextRepeatAt` venceu.
 */
export async function processDueRepeatAlerts(options?: {
  organizationId?: string;
  limit?: number;
}): Promise<{ repeated: number }> {
  const limit = Math.min(options?.limit || 10, 30);
  const now = new Date();

  const occurrences = await prisma.whatsAppAlertOccurrence.findMany({
    where: {
      status: "ACTIVE",
      isResolved: false,
      repeatInterval: { gt: 0 },
      nextRepeatAt: { lte: now },
      ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
    },
    include: {
      task: { select: { id: true, status: true } },
    },
    take: limit,
  });

  let repeated = 0;

  for (const occ of occurrences) {
    // Se a tarefa foi finalizada ou cancelada, resolve a ocorrência e encerra repetições
    if (occ.task && (occ.task.status === "COMPLETED" || occ.task.status === "CANCELLED")) {
      await resolveAlertsForTask(occ.task.id, occ.organizationId);
      continue;
    }

    const nextRound = occ.repeatCount + 1;

    // Busca os destinatários atuais
    const recipients = await prisma.whatsAppRecipient.findMany({
      where: { organizationId: occ.organizationId },
      select: { phone: true, name: true },
    });

    if (!recipients.length) {
      await prisma.whatsAppAlertOccurrence.update({
        where: { id: occ.id },
        data: { nextRepeatAt: null, status: "EXPIRED" },
      });
      continue;
    }

    let instance = await prisma.whatsAppInstance.findFirst({
      where: { organizationId: occ.organizationId, locationId: occ.locationId || undefined, status: "WORKING" },
      select: { id: true, session: true },
    });
    if (!instance) {
      instance = await prisma.whatsAppInstance.findFirst({
        where: { organizationId: occ.organizationId, status: "WORKING" },
        select: { id: true, session: true },
        orderBy: { createdAt: "asc" },
      });
    }

    // Cria as entregas da nova rodada
    for (const recipient of recipients) {
      await prisma.whatsAppAlertDelivery.upsert({
        where: {
          occurrenceId_recipientPhone_round: {
            occurrenceId: occ.id,
            recipientPhone: recipient.phone,
            round: nextRound,
          },
        },
        create: {
          occurrenceId: occ.id,
          organizationId: occ.organizationId,
          locationId: occ.locationId,
          instanceId: instance?.id || null,
          session: instance?.session || null,
          recipientPhone: recipient.phone,
          recipientName: recipient.name || null,
          round: nextRound,
          status: "PENDING",
          scheduledFor: now,
        },
        update: {},
      });
    }

    // Avança o contador e agenda o próximo intervalo
    await prisma.whatsAppAlertOccurrence.update({
      where: { id: occ.id },
      data: {
        repeatCount: nextRound,
        nextRepeatAt: new Date(Date.now() + occ.repeatInterval * 60 * 1000),
      },
    });

    repeated++;
  }

  if (repeated > 0) {
    void dispatchPendingWhatsAppAlerts(options);
  }

  return { repeated };
}

/**
 * Cancela ocorrências e entregas pendentes quando uma tarefa é resolvida/concluída.
 */
export async function resolveAlertsForTask(taskId: string, organizationId: string): Promise<void> {
  const occurrences = await prisma.whatsAppAlertOccurrence.findMany({
    where: { taskId, organizationId, status: "ACTIVE", isResolved: false },
    select: { id: true },
  });

  if (!occurrences.length) return;
  const occurrenceIds = occurrences.map(o => o.id);

  await prisma.$transaction([
    prisma.whatsAppAlertOccurrence.updateMany({
      where: { id: { in: occurrenceIds } },
      data: {
        status: "RESOLVED",
        isResolved: true,
        resolvedAt: new Date(),
        nextRepeatAt: null,
      },
    }),
    prisma.whatsAppAlertDelivery.updateMany({
      where: {
        occurrenceId: { in: occurrenceIds },
        status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        suppressionReason: "TASK_RESOLVED",
        leaseToken: null,
        leaseUntil: null,
      },
    }),
  ]);
}

/**
 * Cancela ocorrências e entregas pendentes quando uma execução de processo é resolvida/concluída.
 */
export async function resolveAlertsForExecution(executionId: string, organizationId: string): Promise<void> {
  const occurrences = await prisma.whatsAppAlertOccurrence.findMany({
    where: { executionId, organizationId, status: "ACTIVE", isResolved: false },
    select: { id: true },
  });

  if (!occurrences.length) return;
  const occurrenceIds = occurrences.map(o => o.id);

  await prisma.$transaction([
    prisma.whatsAppAlertOccurrence.updateMany({
      where: { id: { in: occurrenceIds } },
      data: {
        status: "RESOLVED",
        isResolved: true,
        resolvedAt: new Date(),
        nextRepeatAt: null,
      },
    }),
    prisma.whatsAppAlertDelivery.updateMany({
      where: {
        occurrenceId: { in: occurrenceIds },
        status: { in: ["PENDING", "SCHEDULED", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        suppressionReason: "EXECUTION_RESOLVED",
        leaseToken: null,
        leaseUntil: null,
      },
    }),
  ]);
}
