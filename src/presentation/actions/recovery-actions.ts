"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { Role } from "@/domain/types";
import { sendPasswordResetEmail, sendMemberInviteEmail } from "@/infrastructure/email";

export type ActionResult<T = unknown> = { success?: boolean; error?: string; data?: T };

const emailSchema = z.string().email("E-mail inválido.");
const passwordSchema = z.string().min(8, "A senha deve ter no mínimo 8 caracteres.");
const pinSchema = z.string().regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos.");

/**
 * Solicitação de Recuperação de Senha (Item 4)
 * Protegido contra enumeração: responde sucesso genérico independente de existência da conta.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const email = parsed.data.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status === "ACTIVE") {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora de validade

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
    const resetUrl = `${origin}/auth/reset-password?token=${token}`;

    // Dispara e-mail de recuperação via Resend
    void sendPasswordResetEmail(email, {
      name: user.name,
      resetUrl,
      expiresMinutes: 60,
    });

    // Registra notificação interna e auditoria de envio de recuperação
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
    data: "Se o e-mail estiver cadastrado em nossa base, as instruções de recuperação foram enviadas.",
  };
}

/**
 * Redefinição de Senha via Token Seguro (Item 4)
 */
export async function resetPasswordWithTokenAction(token: string, newPassword: string): Promise<ActionResult> {
  if (!token || token.length < 16) {
    return { error: "Link de recuperação inválido ou expirado." };
  }

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { error: parsedPassword.error.issues[0].message };
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "O link de recuperação é inválido ou já expirou. Solicite um novo." };
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });
  });

  return { success: true, data: "Senha alterada com sucesso! Você já pode entrar com a nova senha." };
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

  const origin =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
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
}
