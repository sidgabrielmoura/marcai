"use server";

import { getAuthenticatedContext } from "@/application/security/auth-context";
import { prisma } from "@/infrastructure/database/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const NOTIFICATION_REVALIDATE_PATHS = [
  "/notifications",
  "/tasks",
  "/overview",
  "/management/tasks",
  "/management/processes",
];

function revalidateNotificationPaths() {
  for (const path of NOTIFICATION_REVALIDATE_PATHS) {
    try {
      revalidatePath(path);
    } catch {
      // Ignora erro se rota não existir no contexto
    }
  }
}

/**
 * Marca uma notificação específica ou todas as não lidas como lidas.
 * Suporta chamada via FormData ou parâmetro direto de string.
 */
export async function markNotificationReadAction(input?: FormData | string): Promise<void> {
  const c = await getAuthenticatedContext();
  if (!c) return;

  const id =
    input instanceof FormData
      ? String(input.get("id") || "")
      : typeof input === "string"
        ? input.trim()
        : "";

  await prisma.notification.updateMany({
    where: {
      organizationId: c.organizationId,
      userId: c.userId,
      readAt: null,
      ...(id ? { id } : {}),
    },
    data: { readAt: new Date() },
  });

  revalidateNotificationPaths();
}

/**
 * Marca a notificação como lida e navega para o link da tarefa correspondente.
 */
export async function markNotificationReadAndNavigateAction(form: FormData) {
  const c = await getAuthenticatedContext();
  const id = String(form.get("id") || "");
  const url = String(form.get("url") || "/notifications");

  if (c && id) {
    await prisma.notification.updateMany({
      where: {
        id,
        organizationId: c.organizationId,
        userId: c.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    revalidateNotificationPaths();
  }

  redirect(url);
}

/**
 * Marca todas as notificações não lidas da organização atual como lidas.
 */
export async function markAllNotificationsReadAction() {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };

  await prisma.notification.updateMany({
    where: {
      organizationId: c.organizationId,
      userId: c.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  revalidateNotificationPaths();
  return { success: true };
}

/**
 * Marca uma notificação como não lida novamente.
 */
export async function markNotificationUnreadAction(id: string) {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  if (!id) return { error: "ID da notificação é obrigatório." };

  await prisma.notification.updateMany({
    where: {
      id,
      organizationId: c.organizationId,
      userId: c.userId,
    },
    data: { readAt: null },
  });

  revalidateNotificationPaths();
  return { success: true };
}

/**
 * Exclui uma notificação do usuário.
 */
export async function deleteNotificationAction(id: string) {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };
  if (!id) return { error: "ID da notificação é obrigatório." };

  await prisma.notification.deleteMany({
    where: {
      id,
      organizationId: c.organizationId,
      userId: c.userId,
    },
  });

  revalidateNotificationPaths();
  return { success: true };
}

/**
 * Limpa todas as notificações que já foram lidas.
 */
export async function clearAllReadNotificationsAction() {
  const c = await getAuthenticatedContext();
  if (!c) return { error: "Não autenticado." };

  await prisma.notification.deleteMany({
    where: {
      organizationId: c.organizationId,
      userId: c.userId,
      readAt: { not: null },
    },
  });

  revalidateNotificationPaths();
  return { success: true };
}

export async function getUnreadNotificationsCountAction(): Promise<number> {
  const c = await getAuthenticatedContext(false);
  if (!c) return 0;
  return await prisma.notification.count({
    where: {
      organizationId: c.organizationId,
      userId: c.userId,
      readAt: null,
    },
  });
}

export async function getCurrentUserSummaryAction(): Promise<{
  userId: string;
  userName: string;
  role: string;
  organizationId: string;
  unreadCount: number;
} | null> {
  const c = await getAuthenticatedContext(false);
  if (!c) return null;
  const unreadCount = await prisma.notification.count({
    where: {
      organizationId: c.organizationId,
      userId: c.userId,
      readAt: null,
    },
  });
  return {
    userId: c.userId,
    userName: c.userName,
    role: c.role,
    organizationId: c.organizationId,
    unreadCount,
  };
}


