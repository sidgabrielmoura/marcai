"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { Role } from "@/domain/types";
import { sendPasswordResetEmail, sendMemberInviteEmail } from "@/infrastructure/email";
import { assertCanAddMember } from "@/domain/rules/subscription-limits";
import { rate } from "@/application/mobile/security";

export type ActionResult<T = unknown> = { success?: boolean; error?: string; data?: T };

const emailSchema = z.string().trim().email("E-mail inválido.");
const passwordSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres.")
  .max(100, "A senha não pode exceder 100 caracteres.")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "A senha deve conter ao menos uma letra maiúscula, uma minúscula e um número."
  );
const pinSchema = z.string().regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos.");

async function resetRate(kind: string, identity: string): Promise<string | null> {
  try {
    let ip = "unknown";
    try {
      const h = await headers();
      ip =
        h.get("x-vercel-forwarded-for")?.split(",")[0] ??
        h.get("x-forwarded-for")?.split(",")[0] ??
        "unknown";
    } catch {
      // Sem escopo de requisição ativa (ex: chamadas CLI ou scripts de teste)
      ip = "cli-test";
    }
    await rate("web-ip:" + kind + ":" + ip, 60);
    await rate("web-identity:" + kind + ":" + identity.toLowerCase().trim(), 5);
    return null;
  } catch (err: any) {
    if (err?.message?.includes("rate") || err?.code === "RATE_LIMIT_EXCEEDED") {
      return "Muitas solicitações recentes. Por segurança, aguarde alguns minutos.";
    }
    return null;
  }
}

function isTunnelDomain(urlStr: string): boolean {
  return /trycloudflare\.com|ngrok|localtunnel\.me/i.test(urlStr);
}

export async function resolvePublicAppUrl(): Promise<string> {
  // 1. Em produção, sempre direciona para o domínio canônico de produção
  if (process.env.NODE_ENV === "production") {
    const configured = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (configured && !isTunnelDomain(configured)) {
      return configured.replace(/\/+$/, "");
    }
    return "https://tarefai.com";
  }

  // 2. Tenta capturar o host da requisição via headers (se não for túnel efêmero)
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    if (host && !isTunnelDomain(host)) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // Fora do escopo de requisição web (ex: CLI / testes)
  }

  // 3. Fallback para variáveis de ambiente (descartando túneis temporários de webhooks)
  const configured = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured && !isTunnelDomain(configured)) {
    return configured.replace(/\/+$/, "");
  }

  // 4. Fallback final seguro
  return "https://tarefai.com";
}

/**
 * Solicitação de Recuperação de Senha (Item 4)
 * Protegido contra enumeração: responde sucesso genérico independente de existência da conta.
 * Armazena apenas o hash SHA-256 do token no banco para máxima segurança.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const email = parsed.data.toLowerCase().trim();
  const rateLimitError = await resetRate("password-reset-request", email);
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status === "ACTIVE") {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresMinutes = 30;
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000); // 30 minutos de validade

    // Invalida tokens de reset anteriores do mesmo usuário
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    const origin = await resolvePublicAppUrl();
    const resetUrl = `${origin}/redefinir-senha?token=${rawToken}`;

    // Dispara e-mail de recuperação via Resend
    void sendPasswordResetEmail(email, {
      name: user.name,
      resetUrl,
      expiresMinutes,
    });

    // Registra auditoria
    const member = await prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
    });

    if (member) {
      await prisma.activityLog.create({
        data: {
          organizationId: member.organizationId,
          actorId: member.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "USER",
          entityId: user.id,
        },
      });
    }
  }

  return {
    success: true,
    data: "Se o e-mail estiver cadastrado, as instruções de recuperação foram enviadas.",
  };
}

export type TokenValidationResult = {
  valid: boolean;
  name?: string;
  emailMasked?: string;
  error?: string;
};

/**
 * Validação prévia de token para a tela de redefinição de senha.
 * Garante que o link só seja considerado válido se existir, não tiver sido usado e não tiver expirado.
 */
export async function validatePasswordResetTokenAction(
  rawToken: string
): Promise<TokenValidationResult> {
  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return {
      valid: false,
      error:
        "Este link de recuperação é inválido, expirou ou já foi utilizado. Por motivos de segurança, cada link só pode ser acessado uma vez.",
    };
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
        },
      },
    },
  });

  if (
    !resetToken ||
    resetToken.usedAt !== null ||
    resetToken.expiresAt < new Date() ||
    resetToken.user.status !== "ACTIVE"
  ) {
    return {
      valid: false,
      error:
        "Este link de recuperação é inválido, expirou ou já foi utilizado. Por motivos de segurança, cada link só pode ser acessado uma vez.",
    };
  }

  const email = resetToken.user.email || "";
  const atIndex = email.indexOf("@");
  const maskedEmail =
    atIndex > 1
      ? `${email[0]}***${email.slice(atIndex - 1)}`
      : email;

  return {
    valid: true,
    name: resetToken.user.name,
    emailMasked: maskedEmail,
  };
}

/**
 * Redefinição de Senha via Token Seguro (Uso Único Atômico).
 * Marca o token como consumido imediatamente, revoga todas as sessões anteriores
 * e atualiza a credencial do usuário.
 */
export async function resetPasswordWithTokenAction(
  rawToken: string,
  newPassword: string
): Promise<ActionResult> {
  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return { error: "Link de recuperação inválido ou expirado." };
  }

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { error: parsedPassword.error.issues[0].message };
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { token: tokenHash },
        include: { user: true },
      });

      if (
        !resetToken ||
        resetToken.usedAt !== null ||
        resetToken.expiresAt < new Date() ||
        resetToken.user.status !== "ACTIVE"
      ) {
        return {
          error:
            "O link de recuperação é inválido, já foi utilizado ou expirou. Solicite um novo link.",
        };
      }

      // 1. Marca imediatamente o token como utilizado (Uso Único)
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      // 2. Remove quaisquer outros tokens pendentes deste usuário
      await tx.passwordResetToken.deleteMany({
        where: { userId: resetToken.userId, id: { not: resetToken.id } },
      });

      // 3. Atualiza a senha e o timestamp do usuário
      const passwordHash = await bcrypt.hash(parsedPassword.data, 10);
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, updatedAt: new Date() },
      });

      // 4. Revoga todas as sessões ativas existentes por segurança
      await tx.$executeRaw`
        UPDATE web_auth_sessions 
        SET revoked_at = now() 
        WHERE user_id = ${resetToken.userId} AND revoked_at IS NULL
      `;
      await tx.mobileAuthSession.deleteMany({
        where: { userId: resetToken.userId },
      });

      // 5. Auditoria de segurança
      const member = await tx.organizationMember.findFirst({
        where: { userId: resetToken.userId, status: "ACTIVE" },
      });

      if (member) {
        await tx.activityLog.create({
          data: {
            organizationId: member.organizationId,
            actorId: member.id,
            action: "PASSWORD_RESET_COMPLETED",
            entityType: "USER",
            entityId: resetToken.userId,
          },
        });
      }

      return { success: true };
    });

    if (result.error) {
      return { error: result.error };
    }

    return {
      success: true,
      data: "Sua senha foi redefinida com sucesso! Você já pode entrar com sua nova senha.",
    };
  } catch (err: any) {
    console.error("[resetPasswordWithTokenAction] Erro:", err);
    return {
      error: "Não foi possível concluir a redefinição de senha. Tente novamente.",
    };
  }
}

/**
 * Criação de Convite por Token (Item 4, 53)
 */
export async function createMemberInviteAction(email: string, role: Role = Role.EMPLOYEE): Promise<ActionResult<{ inviteUrl: string }>> {
  const context = await getAuthenticatedContext();
  if (!context || !["OWNER", "ADMIN"].includes(context.role)) {
    return { error: "Apenas proprietários e administradores podem enviar convites." };
  }

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { error: parsedEmail.error.issues[0].message };
  }

  const targetEmail = parsedEmail.data.toLowerCase().trim();

  try {
    await assertCanAddMember(prisma, context.organizationId);
  } catch (err: any) {
    return { error: err?.message || "Não é possível enviar convite no momento devido aos limites do plano." };
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  await prisma.memberInvite.create({
    data: {
      organizationId: context.organizationId,
      email: targetEmail,
      role: role as any,
      token,
      expiresAt,
      invitedBy: context.memberId,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.memberId,
      action: "MEMBER_INVITED",
      entityType: "USER",
      entityId: targetEmail,
      metadata: { role },
    },
  });

  const origin = await resolvePublicAppUrl();
  const fullInviteUrl = `${origin}/auth/accept-invite?token=${token}`;

  // Dispara convite por e-mail via Resend
  void sendMemberInviteEmail(targetEmail, {
    orgName: context.organizationName,
    inviterName: context.userName,
    role: String(role),
    inviteUrl: fullInviteUrl,
    expiresDays: 7,
  });

  return {
    success: true,
    data: {
      inviteUrl: `/auth/accept-invite?token=${token}`,
    },
  };
}

/**
 * Aceite de Convite por Token (Item 4)
 */
export async function acceptMemberInviteAction(
  token: string,
  name: string,
  password?: string,
  pin?: string
): Promise<ActionResult> {
  const invite = await prisma.memberInvite.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { error: "Convite inválido ou expirado." };
  }

  if (!name.trim()) {
    return { error: "Informe seu nome completo." };
  }

  let passwordHash: string | null = null;
  let pinHash: string | null = null;

  if (password) {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    passwordHash = await bcrypt.hash(parsed.data, 10);
  }

  if (pin) {
    const parsed = pinSchema.safeParse(pin);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    pinHash = await bcrypt.hash(parsed.data, 10);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Procura ou cria usuário
      let user = await tx.user.findUnique({ where: { email: invite.email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            name: name.trim(),
            email: invite.email,
            passwordHash,
            status: "ACTIVE",
          },
        });
      } else if (passwordHash) {
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
      }

      // Cria ou ativa membro
      const existingMember = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId: user.id,
          },
        },
      });

      if (!existingMember) {
        await assertCanAddMember(tx, invite.organizationId);
        await tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
            status: "ACTIVE",
            pinHash,
          },
        });
      } else {
        if (existingMember.status !== "ACTIVE") {
          await assertCanAddMember(tx, invite.organizationId);
        }
        await tx.organizationMember.update({
          where: { id: existingMember.id },
          data: { status: "ACTIVE", pinHash: pinHash ?? existingMember.pinHash },
        });
      }

      await tx.memberInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
    });

    return { success: true };
  } catch (err: any) {
    console.error("[acceptMemberInviteAction] Erro:", err);
    return { error: err?.message || "Não foi possível aceitar o convite." };
  }
}
