import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { Priority } from "@/domain/types";
import { notificationTransaction } from "@/infrastructure/notifications/transaction";
import { dispatchPersistedNotifications } from "@/infrastructure/notifications/notification-service";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { authenticate } from "@/application/mobile/security";
import { validateCronRequest } from "@/infrastructure/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testPushPayloadSchema = z.object({
  userIds: z
    .array(z.string().min(1, "O id do usuário não pode ser vazio").max(128))
    .min(1, "Pelo menos um id de usuário deve ser fornecido.")
    .max(100, "Máximo de 100 usuários por disparo de teste."),
  title: z
    .string()
    .max(200, "O título deve ter no máximo 200 caracteres.")
    .optional()
    .nullable(),
  message: z
    .string()
    .max(1000, "A mensagem deve ter no máximo 1000 caracteres.")
    .optional()
    .nullable(),
});

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/push/test",
    description: "Endpoint para teste de disparo de notificações push.",
    usage: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        userIds: ["id_usuario_1", "id_usuario_2"],
        title: "Título opcional (padrão: 'Notificação de teste')",
        message: "Mensagem opcional (padrão: mensagem de teste do sistema)",
      },
    },
  });
}

export async function POST(request: Request) {
  // 1. Autenticação e Autorização (Web session, Mobile Bearer, Cron Secret ou Dev Mode)
  const webContext = await getAuthenticatedContext(false).catch(() => null);

  let mobileContext: any = null;
  const authHeader = request.headers.get("authorization") || "";
  if (!webContext && authHeader.startsWith("Bearer ey")) {
    try {
      const auth = await authenticate(request);
      mobileContext = auth.data;
    } catch {
      // Ignora erro de token móvel inválido para verificar outros métodos
    }
  }

  const isCronAuthorized = validateCronRequest(request).authorized;
  const isDevelopment = process.env.NODE_ENV === "development";

  const activeContext = webContext || mobileContext;
  const isAuthorized = Boolean(activeContext || isCronAuthorized || isDevelopment);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message: "Acesso não autorizado. É necessário estar autenticado ou fornecer credenciais válidas.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 2. Leitura e validação do corpo da requisição
  let body: unknown;
  try {
    const raw = await request.text();
    if (!raw || raw.trim().length === 0) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: "O corpo da requisição é obrigatório e deve ser um JSON válido.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "O corpo da requisição contém JSON inválido.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parseResult = testPushPayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "VALIDATION_FAILED",
        message: "Dados inválidos na requisição.",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { userIds, title, message } = parseResult.data;
  const finalTitle = title?.trim() || "Notificação de teste";
  const finalMessage =
    message?.trim() || "Esta é uma mensagem de teste para verificar o recebimento push no seu aparelho.";

  const uniqueUserIds = [...new Set(userIds)];

  // 3. Localização dos membros e organizações dos usuários fornecidos
  const callerOrgId = activeContext?.activeOrgId || activeContext?.organizationId;
  const members = await prisma.organizationMember.findMany({
    where: {
      userId: { in: uniqueUserIds },
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      organization: { status: "ACTIVE" },
      ...(callerOrgId ? { organizationId: callerOrgId } : {}),
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Mapeia por userId para deduplicar caso o usuário tenha múltiplos vínculos
  const memberByUserId = new Map<string, (typeof members)[0]>();
  for (const m of members) {
    if (!memberByUserId.has(m.userId)) {
      memberByUserId.set(m.userId, m);
    }
  }

  const matchedMembers = Array.from(memberByUserId.values());
  const notFoundUserIds = uniqueUserIds.filter((id) => !memberByUserId.has(id));

  if (matchedMembers.length === 0) {
    return NextResponse.json(
      {
        error: "NO_ACTIVE_USERS_FOUND",
        message: "Nenhum dos usuários fornecidos possui vínculo ativo na organização.",
        notFoundUserIds,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 4. Criação atômica das notificações
  const createdNotices: Array<{
    id: string;
    userId: string;
    organizationId: string;
    userName: string;
    userEmail: string | null;
  }> = [];

  await notificationTransaction(async (tx) => {
    for (const m of matchedMembers) {
      const notice = await tx.notification.create({
        data: {
          organizationId: m.organizationId,
          userId: m.userId,
          type: "OPERATIONAL_ALERT",
          priority: Priority.HIGH,
          title: finalTitle,
          message: finalMessage,
          data: {
            isTest: true,
            testSentAt: new Date().toISOString(),
          },
          deliveries: {
            create: [
              { channel: "INTERNAL", status: "QUEUED" },
              { channel: "PUSH", status: "QUEUED" },
            ],
          },
        },
        select: { id: true },
      });

      createdNotices.push({
        id: notice.id,
        userId: m.userId,
        organizationId: m.organizationId,
        userName: m.user.name,
        userEmail: m.user.email,
      });
    }
  });

  // 5. Disparo imediato para processar push e coletar status real de entrega
  const createdIds = createdNotices.map((n) => n.id);
  if (createdIds.length > 0) {
    await dispatchPersistedNotifications(createdIds);
  }

  // 6. Consulta dos status reais de entrega gerados pelo provedor (FCM / WebPush)
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      notificationId: { in: createdIds },
      channel: "PUSH",
    },
    select: {
      notificationId: true,
      status: true,
      error: true,
      attempts: true,
      sentAt: true,
    },
  });

  const deliveryByNoticeId = new Map<string, (typeof deliveries)[0]>();
  for (const d of deliveries) {
    deliveryByNoticeId.set(d.notificationId, d);
  }

  // Consulta de dispositivos ativos para detalhamento no retorno
  const targetUserIds = matchedMembers.map((m) => m.userId);
  const [nativeInstallations, webTokens] = await Promise.all([
    prisma.nativeInstallation.findMany({
      where: {
        userId: { in: targetUserIds },
        revokedAt: null,
        permission: { in: ["authorized", "provisional"] },
      },
      select: {
        id: true,
        userId: true,
        platform: true,
        permission: true,
        lastSyncAt: true,
      },
    }),
    prisma.userDeviceToken.findMany({
      where: {
        userId: { in: targetUserIds },
      },
      select: {
        id: true,
        userId: true,
        userAgent: true,
        lastUsedAt: true,
      },
    }),
  ]);

  const nativeByUser = new Map<string, typeof nativeInstallations>();
  for (const inst of nativeInstallations) {
    const list = nativeByUser.get(inst.userId) || [];
    list.push(inst);
    nativeByUser.set(inst.userId, list);
  }

  const webByUser = new Map<string, typeof webTokens>();
  for (const wt of webTokens) {
    const list = webByUser.get(wt.userId) || [];
    list.push(wt);
    webByUser.set(wt.userId, list);
  }

  const results = createdNotices.map((notice) => {
    const delivery = deliveryByNoticeId.get(notice.id);
    const userNative = nativeByUser.get(notice.userId) || [];
    const userWeb = webByUser.get(notice.userId) || [];
    const status = delivery?.status || "QUEUED";

    let summary = "";
    if (status === "PROVIDER_ACCEPTED") {
      summary = `Push aceito pelo provedor para ${userNative.length} app(s) nativo(s) e ${userWeb.length} navegador(es).`;
    } else if (status === "SKIPPED_NO_DEVICES") {
      summary = "Nenhum aparelho com token ativo ou permissão push encontrada para este usuário.";
    } else if (status === "PARTIAL_FAILURE") {
      summary = "Enviado com falha parcial para alguns dispositivos.";
    } else if (status === "FAILED") {
      summary = `Falha no envio de push: ${delivery?.error || "Erro no provedor"}`;
    } else {
      summary = `Status de entrega: ${status}`;
    }

    return {
      userId: notice.userId,
      userName: notice.userName,
      userEmail: notice.userEmail,
      organizationId: notice.organizationId,
      notificationId: notice.id,
      status,
      error: delivery?.error || null,
      devices: {
        nativeCount: userNative.length,
        webCount: userWeb.length,
        nativePlatforms: userNative.map((i) => i.platform),
      },
      summary,
    };
  });

  return NextResponse.json(
    {
      success: true,
      dispatchedCount: results.filter((r) => r.status === "PROVIDER_ACCEPTED").length,
      totalUsers: uniqueUserIds.length,
      title: finalTitle,
      message: finalMessage,
      results,
      notFoundUserIds: notFoundUserIds.length > 0 ? notFoundUserIds : undefined,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
