"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/infrastructure/database/prisma";
import {
  createSession,
  clearSession,
  getSession,
} from "@/infrastructure/security/session";
import { redirect } from "next/navigation";
import { Role } from "@/domain/types";
import { beginLoginChallenge, clearLoginChallenge } from "@/infrastructure/security/login-challenge";
import { hasSecondFactorProof } from "@/infrastructure/security/totp";

const LoginPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const LoginPinSchema = z.object({
  organizationSlug: z
    .string()
    .min(2, "Identificador da organização é obrigatório"),
  employeeCode: z.string().min(1, "Código do funcionário é obrigatório"),
  pin: z.string().regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos numéricos"),
});

export type AuthState = {
  success?: boolean;
  error?: string;
};

export async function loginWithPasswordAction(
  prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = LoginPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  const { email, password } = parsed.data;

  // Busca do usuário
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      memberships: {
        where: { status: "ACTIVE", organization: { status: "ACTIVE" } },
        include: { organization: true },
      },
    },
  });

  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    // Resposta genérica contra enumeração de contas
    return { error: "Credenciais inválidas. Verifique seu e-mail e senha." };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return { error: "Credenciais inválidas. Verifique seu e-mail e senha." };
  }

  // A platform administrator does not need an operational organization membership.
  if (user.platformRole === "SUPERADMIN" || user.twoFactorEnabled) {
    await clearSession();
    await beginLoginChallenge(user, null);
    redirect("/verify-access");
  }

  if (user.memberships.length === 0) {
    return {
      error: "Usuário não possui vínculos ativos em nenhuma organização.",
    };
  }

  // Se tiver apenas 1 organização, define imediatamente
  if (user.memberships.length === 1) {
    const member = user.memberships[0];
    await createSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      activeOrgId: member.organizationId,
      activeMemberId: member.id,
      role: member.role as Role,
      employeeCode: member.employeeCode,
    });

    if (member.role === "EMPLOYEE") {
      redirect("/tasks");
    } else {
      redirect("/overview");
    }
  }

  // Se possuir múltiplos vínculos, grava sessão parcial para seleção
  const primaryMember = user.memberships[0];
  await createSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    activeOrgId: primaryMember.organizationId,
    activeMemberId: primaryMember.id,
    role: primaryMember.role as Role,
    employeeCode: primaryMember.employeeCode,
  });

  redirect("/select-org");
}

export async function loginWithPinAction(
  prevState: AuthState | null,
  formData: FormData,
): Promise<AuthState> {
  const parsed = LoginPinSchema.safeParse({
    organizationSlug: formData.get("organizationSlug"),
    employeeCode: formData.get("employeeCode"),
    pin: formData.get("pin"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  const { organizationSlug, employeeCode, pin } = parsed.data;

  // Busca da organização
  const org = await prisma.organization.findUnique({
    where: { slug: organizationSlug.toLowerCase().trim() },
  });

  if (!org || org.status !== "ACTIVE") {
    return { error: "Organização não encontrada ou inativa." };
  }

  // Busca do membro com matrícula
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: org.id,
      employeeCode: employeeCode.trim(),
      status: "ACTIVE",
    },
    include: {
      user: true,
    },
  });

  if (!member || !member.pinHash || member.user.status !== "ACTIVE") {
    return { error: "Matrícula ou PIN inválido para esta organização." };
  }

  const isPinValid = await bcrypt.compare(pin, member.pinHash);
  if (!isPinValid) {
    return { error: "Matrícula ou PIN inválido para esta organização." };
  }
  if (member.user.platformRole === "SUPERADMIN") return { error: "Use seu e-mail e senha para acessar a administração da plataforma." };
  if (member.user.twoFactorEnabled || member.user.platformRole === "SUPERADMIN") {
    await clearSession();
    await beginLoginChallenge(member.user, member.id);
    redirect("/verify-access");
  }

  await createSession({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    activeOrgId: org.id,
    activeMemberId: member.id,
    role: member.role as Role,
    employeeCode: member.employeeCode,
  });

  if (member.role === "EMPLOYEE") {
    redirect("/tasks");
  } else {
    redirect("/overview");
  }
}

export async function switchOrganizationAction(targetOrgId: string) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Validar se o usuário autenticado realmente pertence à organização destino
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: targetOrgId,
        userId: session.userId,
      },
    },
    include: {
      user: true,
      organization: true,
    },
  });

  if (
    !member ||
    member.status !== "ACTIVE" ||
    member.organization.status !== "ACTIVE" || member.user.status !== "ACTIVE"
  ) {
    throw new Error("Você não possui permissão para acessar esta organização.");
  }
  if (!hasSecondFactorProof(member.user, session.secondFactorProof)) redirect("/login");

  await createSession({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    activeOrgId: member.organizationId,
    activeMemberId: member.id,
    role: member.role as Role,
    employeeCode: member.employeeCode,
    secondFactorProof: session.secondFactorProof,
  });

  if (member.role === "EMPLOYEE") {
    redirect("/tasks");
  } else {
    redirect("/overview");
  }
}

export type UserOrganizationOption = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  isActive: boolean;
};

export async function getUserOrganizationsAction(): Promise<UserOrganizationOption[]> {
  const session = await getSession();
  if (!session) return [];
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE" || !hasSecondFactorProof(user, session.secondFactorProof)) return [];

  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId: session.userId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
      user: { status: "ACTIVE" },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: {
      organization: { name: "asc" },
    },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role as Role,
    isActive: m.organization.id === session.activeOrgId,
  }));
}

export async function logoutAction() {
  await clearSession();
  await clearLoginChallenge();
  redirect("/login");
}
