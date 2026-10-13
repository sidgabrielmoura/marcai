"use server";

import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getSession } from "@/infrastructure/security/session";

const saveTokenSchema = z.object({
  token: z.string().min(10).max(500),
  userAgent: z.string().max(300).optional(),
});

export type PushActionResult = { success?: boolean; error?: string };

/**
 * Registra ou atualiza o token de dispositivo (FCM) vinculado ao usuário autenticado.
 */
export async function saveDeviceTokenAction(
  token: string,
  userAgent?: string
): Promise<PushActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { error: "Não autenticado." };
  }

  const user = await prisma.user.findFirst({
    where: { id: session.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!user) {
    return { error: "Não autenticado." };
  }

  const parsed = saveTokenSchema.safeParse({ token, userAgent });
  if (!parsed.success) {
    return { error: "Token de notificação inválido." };
  }

  try {
    await prisma.userDeviceToken.upsert({
      where: { token: parsed.data.token },
      create: {
        userId: user.id,
        token: parsed.data.token,
        userAgent: parsed.data.userAgent || null,
        lastUsedAt: new Date(),
      },
      update: {
        userId: user.id,
        lastUsedAt: new Date(),
        userAgent: parsed.data.userAgent || undefined,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[Push Notification Action] Erro ao salvar token:", error);
    return { error: "Falha ao registrar token para notificações." };
  }
}

/**
 * Remove o token do dispositivo ao deslogar ou revogar permissão.
 */
export async function removeDeviceTokenAction(token: string): Promise<PushActionResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { error: "Não autenticado." };
  }

  try {
    await prisma.userDeviceToken.deleteMany({
      where: {
        token,
        userId: session.userId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[Push Notification Action] Erro ao remover token:", error);
    return { error: "Falha ao desativar notificações para este dispositivo." };
  }
}
