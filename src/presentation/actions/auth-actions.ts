"use server";

import {qrInitiatorHash,clearQrBinding} from "@/infrastructure/security/qr-binding";
import { headers } from "next/headers";
import { rate } from "@/application/mobile/security";
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
  email: z.string().trim().email("E-mail inválido"),
  organizationSlug: z.string().trim().toLowerCase().optional(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const LoginPinSchema = z.object({
  organizationSlug: z
    .string().trim().toLowerCase()
    .min(2, "Identificador da organização é obrigatório"),
  employeeCode: z.string().trim().min(1, "Código do funcionário é obrigatório"),
  pin: z.string().regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos numéricos"),
});

async function loginRate(kind:string,identity:string):Promise<string|null>{try{const h=await headers();const ip=h.get("x-vercel-forwarded-for")?.split(",")[0]??"unknown";await rate("web-ip:"+kind+":"+ip,120);await rate("web-identity:"+kind+":"+identity.toLowerCase().trim(),10);return null;}catch{return "Muitas tentativas ou serviço indisponível. Aguarde alguns minutos.";}}

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
    organizationSlug: formData.get("organizationSlug")??undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  const { email, password, organizationSlug } = parsed.data;
  const rateError = await loginRate("password",email);if(rateError)return {error:rateError};

  // Busca do usuário
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      passkeys: { select: { id: true } },
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

  if(organizationSlug){
    const selected=user.memberships.find(m=>m.organization.slug===organizationSlug);
    if(!selected)return {error:"Credenciais inválidas para esta organização."};
    user.memberships=[selected];
  }

  // A platform administrator does not need an operational organization membership.
  if (user.platformRole === "SUPERADMIN" || user.twoFactorEnabled) {
    await clearSession();
    await beginLoginChallenge(user, organizationSlug?user.memberships[0]?.id??null:null);
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

    const destination = member.role === "EMPLOYEE" ? "/tasks" : "/overview";
    if (user.passkeys.length === 0) {
      redirect(`/setup-biometrics?next=${encodeURIComponent(destination)}`);
    } else {
      redirect(destination);
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

  const destination = "/select-org";
  if (user.passkeys.length === 0) {
    redirect(`/setup-biometrics?next=${encodeURIComponent(destination)}`);
  } else {
    redirect(destination);
  }
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
  const rateError = await loginRate("pin",organizationSlug+":"+employeeCode);if(rateError)return {error:rateError};

  // Busca da organização
  const org = await prisma.organization.findUnique({
    where: { slug: organizationSlug.toLowerCase().trim() },
  });

  if (!org || org.status !== "ACTIVE") {
    return { error: "Organização não encontrada ou inativa." };
  }

  // Busca do membro com matrícula
  const matches = await prisma.organizationMember.findMany({
    where: {
      organizationId: org.id,
      employeeCode: employeeCode.trim(),
      status: "ACTIVE",
      user: {status:"ACTIVE"},
    },
    take: 2,
    include: {
      user: {
        include: {
          passkeys: {
            select: { id: true },
          },
        },
      },
    },
  });
  const member = matches.length === 1 ? matches[0] : null;

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

  const destination = member.role === "EMPLOYEE" ? "/tasks" : "/overview";
  if (member.user.passkeys.length === 0) {
    redirect(`/setup-biometrics?next=${encodeURIComponent(destination)}`);
  }

  redirect(destination);
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

export async function loginWithMobileSessionAction(token: string) {
  const binding=await qrInitiatorHash();if(!binding)return {error:"Sessão inválida ou expirada."};
  // A single delete-returning consumes the approved QR, including the 2FA branch.
  const [mobileSession]=await prisma.$queryRaw<Array<{userId:string;memberId:string}>>`DELETE FROM mobile_auth_sessions q USING web_qr_bindings b WHERE q.token=${token} AND b.token=q.token AND b.initiator_hash=${binding} AND b.expires_at>now() AND q.status='APPROVED' AND q."createdAt">now()-interval '5 minutes' RETURNING q."userId",q."memberId"`;
  if(!mobileSession?.userId||!mobileSession.memberId)return {error:"Sessão inválida, expirada ou já utilizada."};
  await prisma.$executeRaw`DELETE FROM web_qr_bindings WHERE token=${token}`;
  await clearQrBinding();
  const user = await prisma.user.findUnique({
    where: { id: mobileSession.userId },
    include: {
      memberships: {
        where: { id: mobileSession.memberId,status:"ACTIVE",organization:{status:"ACTIVE"} },
      },
      passkeys: {
        select: { id: true },
      },
    },
  });

  if (!user || user.status!=="ACTIVE" || user.memberships.length === 0) {
    return { error: "Usuário ou vínculo não encontrado." };
  }

  const member = user.memberships[0];

  if (user.platformRole === "SUPERADMIN" || user.twoFactorEnabled) {
    await clearSession();
    await beginLoginChallenge(user, null);
    return { success: true, redirectUrl: "/verify-access" };
  }

  await createSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    activeOrgId: member.organizationId,
    activeMemberId: member.id,
    role: member.role as Role,
    employeeCode: member.employeeCode,
  });



  const destination = member.role === "EMPLOYEE" ? "/tasks" : "/overview";
  if (user.passkeys.length === 0) {
    return {
      success: true,
      redirectUrl: `/setup-biometrics?next=${encodeURIComponent(destination)}`,
    };
  }

  return { success: true, redirectUrl: destination };
}
