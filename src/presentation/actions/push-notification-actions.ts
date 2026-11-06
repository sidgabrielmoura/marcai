"use server";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getSession } from "@/infrastructure/security/session";
import { getAuthenticatedContext } from "@/application/security/auth-context";
export type PushActionResult = {
    success?: boolean;
    error?: string;
};
export async function getPushContextAction() {
    const session = await getSession();
    if (!session?.sessionId || !await getAuthenticatedContext(false))
        return null;
    return { sessionId: session.sessionId };
}
export async function saveDeviceTokenAction(token: string, userAgent?: string, expectedSessionId?: string): Promise<PushActionResult> {
    const session = await getSession();
    if (!session?.sessionId || session.sessionId !== expectedSessionId || !await getAuthenticatedContext(false)) {
        return { error: "A sessão mudou. Entre novamente para ativar as notificações." };
    }
    const parsed = z.object({ token: z.string().min(10).max(4096), userAgent: z.string().max(300).optional() }).safeParse({ token, userAgent: userAgent?.slice(0, 300) });
    if (!parsed.success)
        return { error: "Token de notificação inválido." };
    try {
        const saved = await prisma.$transaction(async (tx) => {
            const [active] = await tx.$queryRaw<Array<{
                id: string;
            }>> `SELECT id FROM web_auth_sessions
        WHERE id=${session.sessionId!}::uuid AND user_id=${session.userId}
          AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`;
            if (!active)
                return false;
            await tx.userDeviceToken.deleteMany({ where: { sessionId: session.sessionId, token: { not: parsed.data.token } } });
            await tx.userDeviceToken.upsert({ where: { token: parsed.data.token },
                create: { userId: session.userId, sessionId: session.sessionId, token: parsed.data.token, userAgent: parsed.data.userAgent },
                update: { userId: session.userId, sessionId: session.sessionId, userAgent: parsed.data.userAgent, lastUsedAt: new Date() },
            });
            return true;
        });
        return saved ? { success: true } : { error: "Sessão encerrada." };
    }
    catch (err) {
        console.error("[Push] Falha ao registrar inscrição:", err);
        return { error: "Não foi possível ativar as notificações. Tente novamente." };
    }
}
export async function removeDeviceTokenAction(token: string): Promise<PushActionResult> {
    const session = await getSession();
    if (!session?.sessionId)
        return { error: "Não autenticado." };
    try {
        await prisma.userDeviceToken.deleteMany({ where: { token, userId: session.userId, sessionId: session.sessionId } });
        return { success: true };
    }
    catch {
        return { error: "Não foi possível desativar as notificações." };
    }
}

/** A test is always bound to the authenticated browser, never to a supplied user ID. */
export async function sendCurrentSessionPushTestAction(expectedSessionId: string): Promise<PushActionResult> {
    const session = await getSession();
    const context = await getAuthenticatedContext(false);
    if (!context || !session?.sessionId || session.sessionId !== expectedSessionId)
        return { error: "A sessão mudou. Entre novamente." };
    const token = await prisma.userDeviceToken.findFirst({ where: { userId: context.userId, sessionId: session.sessionId }, select: { id: true } });
    if (!token) return { error: "Conecte este navegador aos avisos antes de enviar o teste." };
    const recent = await prisma.notification.findFirst({ where: { userId: context.userId, organizationId: context.organizationId, type: "PUSH_TEST", createdAt: { gte: new Date(Date.now() - 60000) } }, select: { id: true } });
    if (recent) return { error: "Aguarde um minuto antes de enviar outro teste." };
    const { sendNotification } = await import("@/infrastructure/notifications/notification-service");
    await sendNotification({ userId: context.userId, organizationId: context.organizationId, type: "PUSH_TEST", title: "Teste de avisos", message: "Este navegador está conectado aos avisos do Tarefaí.", channels: ["INTERNAL", "PUSH"], data: { testWebSessionId: session.sessionId } });
    return { success: true };
}
