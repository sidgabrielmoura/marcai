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
    catch {
        console.error("[Push] Falha ao registrar inscrição.");
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
