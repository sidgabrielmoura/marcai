import type { Prisma, Priority } from "@prisma/client";
import { dispatchNotificationAsync } from "@/infrastructure/notifications/notification-service";

export interface NotifyOptions {
  type?: string;
  priority?: Priority;
  excludeUserId?: string;
  data?: Record<string, unknown>;
}

/**
 * Notifica os gestores responsáveis (OWNER, ADMIN e MANAGER da unidade/equipe).
 */
export async function notifyManagers(
  tx: Prisma.TransactionClient,
  task: {
    organizationId: string;
    locationId: string | null;
    teamId: string | null;
    id: string;
  },
  title: string,
  message: string,
  options?: NotifyOptions
) {
  const members = await tx.organizationMember.findMany({
    where: {
      organizationId: task.organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      OR: [
        { role: { in: ["OWNER", "ADMIN"] } },
        {
          role: "MANAGER",
          locationAccesses: {
            some: {
              locationId: task.locationId ?? "__none__",
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
              ],
            },
          },
          teamMemberships: {
            some: { teamId: task.teamId ?? "__none__" },
          },
        },
      ],
    },
    select: { userId: true },
  });

  const recipientUserIds = [
    ...new Set(
      members
        .map((m) => m.userId)
        .filter((uid) => !options?.excludeUserId || uid !== options.excludeUserId)
    ),
  ];

  if (recipientUserIds.length > 0) {
    const type = options?.type ?? "OPERATIONAL_ALERT";
    const priority = options?.priority ?? "HIGH";
    const data = (options?.data ?? { taskId: task.id }) as Prisma.InputJsonValue;

    await tx.notification.createMany({
      data: recipientUserIds.map((userId) => ({
        organizationId: task.organizationId,
        userId,
        type,
        priority,
        title,
        message,
        data,
      })),
    });

    void dispatchNotificationAsync({
      organizationId: task.organizationId,
      userIds: recipientUserIds,
      type,
      priority,
      title,
      message,
      data: (options?.data ?? { taskId: task.id }) as Record<string, unknown>,
      clickAction: `/tasks/${task.id}`,
    });
  }
}

/**
 * Notifica os responsáveis atribuídos a uma tarefa (PRIMARY e COLLABORATOR ativos).
 */
export async function notifyTaskAssignees(
  tx: Prisma.TransactionClient,
  task: {
    organizationId: string;
    id: string;
    title: string;
    priority?: Priority;
  },
  title: string,
  message: string,
  options?: NotifyOptions
) {
  const assignments = await tx.taskAssignment.findMany({
    where: {
      taskId: task.id,
      removedAt: null,
      task: { organizationId: task.organizationId },
    },
    include: {
      member: {
        select: { userId: true, status: true },
      },
    },
  });

  const recipientUserIds = [
    ...new Set(
      assignments
        .filter((a) => a.member.status === "ACTIVE")
        .map((a) => a.member.userId)
        .filter((uid) => !options?.excludeUserId || uid !== options.excludeUserId)
    ),
  ];

  if (recipientUserIds.length > 0) {
    const type = options?.type ?? "TASK_NOTIFICATION";
    const priority = options?.priority ?? task.priority ?? "MEDIUM";
    const data = (options?.data ?? { taskId: task.id }) as Prisma.InputJsonValue;

    await tx.notification.createMany({
      data: recipientUserIds.map((userId) => ({
        organizationId: task.organizationId,
        userId,
        type,
        priority,
        title,
        message,
        data,
      })),
    });

    void dispatchNotificationAsync({
      organizationId: task.organizationId,
      userIds: recipientUserIds,
      type,
      priority,
      title,
      message,
      data: (options?.data ?? { taskId: task.id }) as Record<string, unknown>,
      clickAction: `/tasks/${task.id}`,
    });
  }
}

/**
 * Notifica o aprovador designado ou a equipe aprovadora de uma etapa de workflow.
 */
export async function notifyApprovers(
  tx: Prisma.TransactionClient,
  task: {
    organizationId: string;
    id: string;
    title: string;
    locationId?: string | null;
    teamId?: string | null;
  },
  step: {
    id: string;
    sequence: number;
    approverMemberId?: string | null;
    approverTeamId?: string | null;
  },
  title: string,
  message: string,
  options?: NotifyOptions
) {
  const recipientUserIds = new Set<string>();

  if (step.approverMemberId) {
    const member = await tx.organizationMember.findFirst({
      where: {
        id: step.approverMemberId,
        organizationId: task.organizationId,
        status: "ACTIVE",
      },
      select: { userId: true },
    });
    if (member && (!options?.excludeUserId || member.userId !== options.excludeUserId)) {
      recipientUserIds.add(member.userId);
    }
  } else if (step.approverTeamId) {
    const teamMembers = await tx.teamMember.findMany({
      where: {
        teamId: step.approverTeamId,
        team: { organizationId: task.organizationId },
        member: { status: "ACTIVE" },
      },
      include: {
        member: { select: { userId: true } },
      },
    });
    for (const tm of teamMembers) {
      if (!options?.excludeUserId || tm.member.userId !== options.excludeUserId) {
        recipientUserIds.add(tm.member.userId);
      }
    }
  }

  // Se nenhum aprovador específico foi encontrado, notifica os gestores gerais da tarefa
  if (recipientUserIds.size === 0) {
    await notifyManagers(
      tx,
      {
        organizationId: task.organizationId,
        locationId: task.locationId ?? null,
        teamId: task.teamId ?? null,
        id: task.id,
      },
      title,
      message,
      {
        ...options,
        type: options?.type ?? "APPROVAL_REQUESTED",
        priority: options?.priority ?? "HIGH",
        data: { taskId: task.id, stepId: step.id },
      }
    );
    return;
  }

  const approverUserIds = Array.from(recipientUserIds);
  const type = options?.type ?? "APPROVAL_REQUESTED";
  const priority = options?.priority ?? "HIGH";
  const data = (options?.data ?? { taskId: task.id, stepId: step.id }) as Prisma.InputJsonValue;

  await tx.notification.createMany({
    data: approverUserIds.map((userId) => ({
      organizationId: task.organizationId,
      userId,
      type,
      priority,
      title,
      message,
      data,
    })),
  });

  void dispatchNotificationAsync({
    organizationId: task.organizationId,
    userIds: approverUserIds,
    type,
    priority,
    title,
    message,
    data: (options?.data ?? { taskId: task.id, stepId: step.id }) as Record<string, unknown>,
    clickAction: `/tasks/${task.id}`,
    forcePush: true, // Aprovação de gestor é prioritária (Web Push garantido)
  });
}
