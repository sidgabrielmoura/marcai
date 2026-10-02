"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { Role, MemberStatus, LocationAccessType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { updateMemberAccess } from "@/application/security/update-member-access";
import { canManageMember } from "@/domain/rules/member-access";
import { executeRetentionPurge } from "@/application/jobs/retention-purge";

export type ActionResult = {
  success?: boolean;
  error?: string;
  data?: any;
};

export async function updateMemberAccessAction(input: unknown): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context || !["OWNER", "ADMIN"].includes(context.role)) return { error: "Apenas administradores podem alterar acessos." };
  const result = await prisma.$transaction(tx => updateMemberAccess(tx, context, input), { timeout: 20000 });
  if (result.success) {
    revalidatePath("/management/people");
    revalidatePath("/management/teams");
    revalidatePath("/management/locations");
    revalidatePath("/tasks");
  }
  return result;
}

/**
 * Convidar / Cadastrar Novo Membro na Organização (Item 4, 53)
 */
export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem adicionar colaboradores à organização." };
  }

  const name = formData.get("name") as string;
  const email = (formData.get("email") as string)?.toLowerCase().trim() || null;
  const role = (formData.get("role") as Role) || Role.EMPLOYEE;
  const employeeCode = (formData.get("employeeCode") as string)?.trim() || null;
  const pin = (formData.get("pin") as string)?.trim() || null;
  const primaryLocationId = formData.get("primaryLocationId") as string;
  const teamId = formData.get("teamId") as string;

  if (!name || name.trim().length < 2) {
    return { error: "Nome é obrigatório." };
  }

  const pinHash = pin && pin.length === 6 ? await bcrypt.hash(pin, 10) : null;
  const password = String(formData.get("password") || "");
  if (!z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).safeParse(role).success) return { error: "Permissão inválida." };
  if (role === "ADMIN" && context.role !== "OWNER") return { error: "Somente o proprietário pode conceder acesso de administrador." };
  if (email && !z.email().safeParse(email).success) return { error: "E-mail inválido." };
  if (pin && !/^\d{6}$/.test(pin)) return { error: "O PIN deve conter seis dígitos." };
  if (password && password.length < 12) return { error: "A senha inicial deve ter pelo menos 12 caracteres." };
  if (primaryLocationId && !await prisma.location.findFirst({ where: { id: primaryLocationId, organizationId: context.organizationId } })) return { error: "Unidade inválida." };
  if (teamId && !await prisma.team.findFirst({ where: { id: teamId, organizationId: context.organizationId } })) return { error: "Equipe inválida." };
  if (employeeCode && await prisma.organizationMember.findFirst({ where: { organizationId: context.organizationId, employeeCode } })) return { error: "Esta matrícula já está em uso." };
  const previousUser = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } }) : null;
  if (!pinHash && !password && !previousUser?.passwordHash) return { error: "Defina um PIN ou uma senha inicial para permitir o acesso." };
  if (password && !email) return { error: "Informe um e-mail para acesso por senha." };
  if (previousUser && await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: previousUser.id } } })) return { error: "Esta pessoa já pertence à organização." };
  const defaultPasswordHash = password ? await bcrypt.hash(password, 12) : null;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Localizar ou criar usuário
    let user = email ? await tx.user.findUnique({ where: { email } }) : null;
    if (!user) {
      user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash: defaultPasswordHash,
          status: "ACTIVE",
        },
      });
    }

    // 2. Verificar se já é membro desta organização
    const existing = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: context.organizationId,
          userId: user.id,
        },
      },
    });

    if (existing) {
      throw new Error("Este usuário já faz parte desta organização.");
    }

    // 3. Criar vínculo OrganizationMember
    const member = await tx.organizationMember.create({
      data: {
        organizationId: context.organizationId,
        userId: user.id,
        role,
        status: MemberStatus.ACTIVE,
        employeeCode: employeeCode || `EMP-${Date.now().toString().slice(-4)}`,
        pinHash,
      },
    });

    // 4. Vincular Unidade Principal se informada
    if (primaryLocationId) {
      await tx.memberLocationAccess.create({
        data: {
          memberId: member.id,
          locationId: primaryLocationId,
          type: LocationAccessType.PRIMARY,
          grantedBy: context.memberId,
        },
      });
    }

    // 5. Vincular Equipe se informada
    if (teamId) {
      await tx.teamMember.create({
        data: {
          teamId,
          organizationMemberId: member.id,
          isPrimary: true,
        },
      });
    }

    // 6. Auditoria append-only
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "MEMBER_INVITED",
        entityType: "USER",
        entityId: member.id,
        metadata: { name, role, employeeCode },
      },
    });

    return member;
  });

  revalidatePath("/management/people");
  return { success: true, data: { id: result.id } };
}

/**
 * Ativar / Desativar Membro (Item 53)
 * Gestores podem alterar status de colaboradores de suas equipes
 */
export async function updateMemberStatusAction(
  memberId: string,
  newStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED"
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (!["OWNER", "ADMIN", "MANAGER"].includes(context.role)) {
    return { error: "Apenas administradores ou gestores podem alterar o status de membros." };
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: context.organizationId },
  });

  if (!member) return { error: "Membro não encontrado." };
  if (!z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).safeParse(newStatus).success) return { error: "Status inválido." };
  if (member.id === context.memberId || member.role === "OWNER") return { error: "Não é possível desativar o próprio acesso ou o proprietário por esta ação." };
  if (!canManageMember(context.role, context.memberId, member)) {
    return { error: "Você não possui permissão para alterar o status desta pessoa." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: member.id },
      data: { status: newStatus as MemberStatus },
    });

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: `MEMBER_STATUS_${newStatus}`,
        entityType: "USER",
        entityId: member.id,
        metadata: { previousStatus: member.status, newStatus },
      },
    });
  });

  revalidatePath("/management/people");
  return { success: true };
}

/**
 * Redefinir PIN de Funcionário (Item 4)
 */
export async function resetMemberPinAction(
  memberId: string,
  newPin: string
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (!["OWNER", "ADMIN", "MANAGER"].includes(context.role)) {
    return { error: "Acesso não autorizado." };
  }

  if (context.role === "MANAGER") {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { settings: true },
    });
    const orgSettings = (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, any>;
    if (!orgSettings.allowManagersToEditSensitiveData) {
      return { error: "Gestores não possuem permissão para alterar dados sensíveis de acesso (PIN). Ative a permissão nas configurações da organização." };
    }
  }

  if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) {
    return { error: "O PIN deve conter exatamente 6 dígitos numéricos." };
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: context.organizationId },
  });

  if (!member) return { error: "Membro não encontrado." };

  if (!canManageMember(context.role, context.memberId, member)) return { error: "Você não pode redefinir o acesso desta pessoa." };
  const pinHash = await bcrypt.hash(newPin, 10);

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: member.id },
      data: { pinHash },
    });

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "MEMBER_PIN_RESET",
        entityType: "USER",
        entityId: member.id,
      },
    });
  });

  revalidatePath("/management/people");
  return { success: true };
}

const updateMemberDetailsSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(2, "O nome deve ter no mínimo 2 caracteres").max(100),
  email: z.string().email("E-mail inválido").nullable().optional().or(z.literal("")),
  password: z.string().min(12, "A senha deve ter no mínimo 12 caracteres").nullable().optional().or(z.literal("")),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).optional(),
  pin: z.string().regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos numéricos").nullable().optional().or(z.literal("")),
  locationId: z.string().nullable().optional().or(z.literal("")),
  teamId: z.string().nullable().optional().or(z.literal("")),
});

type UpdateMemberDetailsInput = z.infer<typeof updateMemberDetailsSchema>;

/**
 * Atualizar Dados do Colaborador (Nome, E-mail, Equipe e dados sensíveis sob controle)
 */
export async function updateMemberDetailsAction(input: UpdateMemberDetailsInput): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (!["OWNER", "ADMIN", "MANAGER"].includes(context.role)) {
    return { error: "Acesso não autorizado." };
  }

  const parsed = updateMemberDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
    select: { settings: true },
  });
  const orgSettings = (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, any>;
  const allowManagersToEditSensitiveData = Boolean(orgSettings.allowManagersToEditSensitiveData);

  const target = await prisma.organizationMember.findFirst({
    where: { id: data.memberId, organizationId: context.organizationId },
    include: {
      user: true,
      teamMemberships: true,
      locationAccesses: true,
    },
  });

  if (!target) return { error: "Colaborador não encontrado nesta organização." };

  // Regras de Gestor (MANAGER)
  if (context.role === "MANAGER") {
    if (target.role !== "EMPLOYEE") {
      return { error: "Gestores só possuem permissão para alterar colaboradores da equipe." };
    }

    const currentPrimaryLocId = target.locationAccesses.find(l => l.type === "PRIMARY")?.locationId || target.locationAccesses[0]?.locationId || "";
    const hasSensitiveChanges = Boolean(
      (data.password && data.password.trim().length > 0) ||
      (data.pin && data.pin.trim().length > 0) ||
      (data.role && data.role !== target.role) ||
      (data.locationId !== undefined && data.locationId !== currentPrimaryLocId)
    );

    if (hasSensitiveChanges && !allowManagersToEditSensitiveData) {
      return {
        error: "Gestores só possuem permissão para alterar dados simples (nome, e-mail e equipe). A alteração de dados sensíveis de acesso (senha, PIN, permissão e unidade) está desabilitada para gestores nas configurações da organização.",
      };
    }

    if (data.role && data.role === "ADMIN") {
      return { error: "Gestores não podem conceder permissão de Administrador." };
    }
  }

  // Regras de Administrador (ADMIN)
  if (context.role === "ADMIN") {
    if (target.role === "OWNER") {
      return { error: "Administradores não podem alterar dados do proprietário." };
    }
    if (target.role === "ADMIN" && target.id !== context.memberId) {
      return { error: "Somente o proprietário pode alterar dados de outro administrador." };
    }
    if (data.role === "ADMIN" && target.role !== "ADMIN") {
      return { error: "Somente o proprietário pode conceder permissão de Administrador." };
    }
  }

  // Regras de Proprietário (OWNER)
  if (context.role === "OWNER") {
    if (target.id === context.memberId && data.role) {
      return { error: "O proprietário não pode alterar seu próprio cargo." };
    }
  }

  // Validação de e-mail único
  const cleanEmail = data.email && data.email.trim() ? data.email.trim().toLowerCase() : null;
  if (cleanEmail && cleanEmail !== target.user.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true },
    });
    if (existingUser && existingUser.id !== target.userId) {
      return { error: "Este e-mail já está sendo utilizado por outro usuário." };
    }
  }

  // Validação de Unidade e Equipe se informadas
  if (data.locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: data.locationId, organizationId: context.organizationId, status: "ACTIVE" },
    });
    if (!loc) return { error: "Unidade selecionada não é válida ou não está ativa." };
  }

  if (data.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: data.teamId, organizationId: context.organizationId, status: "ACTIVE" },
    });
    if (!team) return { error: "Equipe selecionada não é válida ou não está ativa." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"member:" + target.id}))`;

    // 1. Atualizar User (nome, email, senha)
    const userUpdate: Record<string, any> = {};
    if (data.name.trim() !== target.user.name) {
      userUpdate.name = data.name.trim();
    }
    if (cleanEmail !== target.user.email) {
      userUpdate.email = cleanEmail;
    }
    if (data.password && data.password.trim()) {
      userUpdate.passwordHash = await bcrypt.hash(data.password.trim(), 12);
    }

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: target.userId },
        data: userUpdate,
      });
    }

    // 2. Atualizar OrganizationMember (role, pin)
    const memberUpdate: Record<string, any> = {};
    if (data.role && data.role !== target.role) {
      memberUpdate.role = data.role as Role;
    }
    if (data.pin && data.pin.trim()) {
      memberUpdate.pinHash = await bcrypt.hash(data.pin.trim(), 10);
    }

    if (Object.keys(memberUpdate).length > 0) {
      await tx.organizationMember.update({
        where: { id: target.id },
        data: memberUpdate,
      });
    }

    // 3. Atualizar Equipe
    if (data.teamId !== undefined) {
      if (data.teamId) {
        await tx.teamMember.deleteMany({
          where: { organizationMemberId: target.id, teamId: { not: data.teamId }, isPrimary: true },
        });
        await tx.teamMember.upsert({
          where: {
            teamId_organizationMemberId: {
              teamId: data.teamId,
              organizationMemberId: target.id,
            },
          },
          create: {
            teamId: data.teamId,
            organizationMemberId: target.id,
            isPrimary: true,
          },
          update: {
            isPrimary: true,
          },
        });
      } else {
        await tx.teamMember.deleteMany({
          where: { organizationMemberId: target.id },
        });
      }
    }

    // 4. Atualizar Unidade
    const canChangeLocation = context.role !== "MANAGER" || allowManagersToEditSensitiveData;
    if (data.locationId !== undefined && canChangeLocation) {
      if (data.locationId) {
        await tx.memberLocationAccess.deleteMany({
          where: { memberId: target.id, locationId: { not: data.locationId }, type: LocationAccessType.PRIMARY },
        });
        await tx.memberLocationAccess.upsert({
          where: {
            memberId_locationId: {
              memberId: target.id,
              locationId: data.locationId,
            },
          },
          create: {
            memberId: target.id,
            locationId: data.locationId,
            type: LocationAccessType.PRIMARY,
            grantedBy: context.memberId,
          },
          update: {
            type: LocationAccessType.PRIMARY,
          },
        });
      } else {
        await tx.memberLocationAccess.deleteMany({
          where: { memberId: target.id, type: LocationAccessType.PRIMARY },
        });
      }
    }

    // 5. Auditoria
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "MEMBER_DETAILS_UPDATED",
        entityType: "USER",
        entityId: target.id,
        metadata: {
          updatedName: Boolean(userUpdate.name),
          updatedEmail: Boolean(userUpdate.email !== undefined),
          updatedPassword: Boolean(userUpdate.passwordHash),
          updatedRole: Boolean(memberUpdate.role),
          updatedPin: Boolean(memberUpdate.pinHash),
          updatedTeam: Boolean(data.teamId !== undefined),
          updatedLocation: Boolean(data.locationId !== undefined && canChangeLocation),
        },
      },
    });
  });

  revalidatePath("/management/people");
  return { success: true };
}

/**
 * Excluir Permanentemente Colaborador do Banco de Dados
 * Permitido apenas para OWNER e ADMIN (Gerente Geral). Gestores NÃO podem excluir.
 */
export async function deleteMemberAction(memberId: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas o proprietário e gerentes gerais podem excluir permanentemente colaboradores do banco de dados." };
  }

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: context.organizationId },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  });

  if (!member) return { error: "Colaborador não encontrado nesta organização." };
  if (member.id === context.memberId) return { error: "Você não pode excluir sua própria conta." };
  if (member.role === Role.OWNER) return { error: "Não é possível excluir o proprietário da organização." };
  if (member.role === Role.ADMIN && context.role !== Role.OWNER) {
    return { error: "Somente o proprietário pode excluir outro administrador." };
  }

  await prisma.$transaction(async (tx) => {
    // 1. Excluir vínculo OrganizationMember (cascateia acessos, equipes, atribuições, sessões, submissões)
    await tx.organizationMember.delete({
      where: { id: member.id },
    });

    // 2. Se o usuário não possui vínculo em nenhuma outra organização, remove do banco de dados
    if (member.user.memberships.length <= 1) {
      await tx.user.delete({
        where: { id: member.userId },
      });
    }

    // 3. Auditoria
    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "MEMBER_PERMANENTLY_DELETED",
        entityType: "USER",
        entityId: member.id,
        metadata: {
          name: member.user.name,
          email: member.user.email,
          role: member.role,
        },
      },
    });
  });

  revalidatePath("/management/people");
  return { success: true };
}

/**
 * Criar Unidade Operacional (Item 5, 55)
 */
export async function saveLocationAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem criar unidades." };
  }

  const name = formData.get("name") as string;
  const address = (formData.get("address") as string) || null;
  const timezone = (formData.get("timezone") as string) || "America/Sao_Paulo";
  const openingTime = (formData.get("openingTime") as string) || "08:00";
  const closingTime = (formData.get("closingTime") as string) || "20:00";
  const operatingDays = formData.has("operatingDays") ? String(formData.get("operatingDays")) : "MON,TUE,WED,THU,FRI,SAT";

  if (!name || name.trim().length < 2) {
    return { error: "Nome da unidade é obrigatório." };
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime)) return { error: "Informe horários válidos." };
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }); } catch { return { error: "Fuso horário inválido." }; }
  if (!operatingDays.split(",").every(day => ["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(day))) return { error: "Dias de operação inválidos." };
  const locationId = String(formData.get("locationId") || "");
  if (locationId && !await prisma.location.findFirst({ where: { id: locationId, organizationId: context.organizationId } })) return { error: "Unidade não encontrada nesta organização." };
  const location = await prisma.$transaction(async (tx) => {
    const data = {
        organizationId: context.organizationId,
        name,
        address,
        timezone,
        openingTime,
        closingTime,
        operatingDays,
        status: "ACTIVE",
    };
    const loc = locationId ? await tx.location.update({ where: { id: locationId, organizationId: context.organizationId }, data }) : await tx.location.create({ data });

    if (formData.has("teamIds")) {
      const teamIds = String(formData.get("teamIds")).split(",").map(s => s.trim()).filter(Boolean);
      await tx.teamLocation.deleteMany({ where: { locationId: loc.id } });
      if (teamIds.length > 0) {
        await tx.teamLocation.createMany({
          data: teamIds.map(tId => ({
            teamId: tId,
            locationId: loc.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: locationId ? "LOCATION_UPDATED" : "LOCATION_CREATED",
        entityType: "LOCATION",
        entityId: loc.id,
        metadata: { name, openingTime, closingTime },
      },
    });

    return loc;
  });

  revalidatePath("/management/locations");
  return { success: true, data: { id: location.id } };
}

/**
 * Criar Equipe Operacional (Item 5, 54)
 */
export async function saveTeamAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem criar equipes." };
  }

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const managerMemberId = (formData.get("managerMemberId") as string) || null;

  if (!name || name.trim().length < 2) {
    return { error: "Nome da equipe é obrigatório." };
  }

  if (managerMemberId && !await prisma.organizationMember.findFirst({ where: { id: managerMemberId, organizationId: context.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MANAGER"] } } })) return { error: "Gestor inválido." };

  const teamId = String(formData.get("teamId") || "");
  if (teamId && !await prisma.team.findFirst({ where: { id: teamId, organizationId: context.organizationId } })) return { error: "Equipe não encontrada nesta organização." };
  const team = await prisma.$transaction(async (tx) => {
    const data = {
        organizationId: context.organizationId,
        name,
        description,
        managerMemberId,
        status: "ACTIVE",
    };
    const t = teamId ? await tx.team.update({ where: { id: teamId, organizationId: context.organizationId }, data }) : await tx.team.create({ data });

    if (formData.has("locationIds")) {
      const locationIds = String(formData.get("locationIds")).split(",").map(s => s.trim()).filter(Boolean);
      await tx.teamLocation.deleteMany({ where: { teamId: t.id } });
      if (locationIds.length > 0) {
        await tx.teamLocation.createMany({
          data: locationIds.map(locId => ({
            teamId: t.id,
            locationId: locId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (formData.has("memberIds")) {
      const rawMemberIds = String(formData.get("memberIds") || "");
      const memberIds = rawMemberIds.split(",").map((s) => s.trim()).filter(Boolean);
      await tx.teamMember.deleteMany({
        where: { teamId: t.id, organizationMemberId: { notIn: memberIds } },
      });
      if (memberIds.length > 0) {
        const validMembers = await tx.organizationMember.findMany({
          where: { id: { in: memberIds }, organizationId: context.organizationId, status: "ACTIVE" },
          select: { id: true },
        });
        for (const vm of validMembers) {
          await tx.teamMember.upsert({
            where: { teamId_organizationMemberId: { teamId: t.id, organizationMemberId: vm.id } },
            create: { teamId: t.id, organizationMemberId: vm.id },
            update: {},
          });
        }
      }
    }

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: teamId ? "TEAM_UPDATED" : "TEAM_CREATED",
        entityType: "TEAM",
        entityId: t.id,
        metadata: { name },
      },
    });

    return t;
  });

  revalidatePath("/management/teams");
  return { success: true, data: { id: team.id } };
}

/**
 * Atualizar integrantes de uma equipe
 */
export async function updateTeamMembersAction(
  teamId: string,
  memberIds: string[]
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    if (context.role === Role.MANAGER) {
      const isManagerOfTeam = await prisma.team.findFirst({
        where: { id: teamId, organizationId: context.organizationId, managerMemberId: context.memberId, status: "ACTIVE" },
      });
      if (!isManagerOfTeam) {
        return { error: "Apenas o gestor desta equipe ou administradores podem gerenciar integrantes." };
      }
    } else {
      return { error: "Sem permissão para gerenciar integrantes." };
    }
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: context.organizationId, status: "ACTIVE" },
  });
  if (!team) return { error: "Equipe não encontrada nesta organização." };

  const validMembers = memberIds.length > 0
    ? await prisma.organizationMember.findMany({
        where: { id: { in: memberIds }, organizationId: context.organizationId, status: "ACTIVE" },
        select: { id: true },
      })
    : [];
  const validMemberIds = validMembers.map((m) => m.id);

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.deleteMany({
      where: { teamId: team.id, organizationMemberId: { notIn: validMemberIds } },
    });
    for (const mId of validMemberIds) {
      await tx.teamMember.upsert({
        where: { teamId_organizationMemberId: { teamId: team.id, organizationMemberId: mId } },
        create: { teamId: team.id, organizationMemberId: mId },
        update: {},
      });
    }

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "TEAM_MEMBERS_UPDATED",
        entityType: "TEAM",
        entityId: team.id,
        metadata: { memberIds: validMemberIds },
      },
    });
  });

  revalidatePath("/management/teams");
  revalidatePath("/management/people");
  return { success: true };
}

/**
 * Atualizar unidades vinculadas a uma equipe
 */
export async function updateTeamLocationsAction(
  teamId: string,
  locationIds: string[]
): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    if (context.role === Role.MANAGER) {
      const isManagerOfTeam = await prisma.team.findFirst({
        where: { id: teamId, organizationId: context.organizationId, managerMemberId: context.memberId, status: "ACTIVE" },
      });
      if (!isManagerOfTeam) {
        return { error: "Apenas o gestor desta equipe ou administradores podem gerenciar unidades." };
      }
    } else {
      return { error: "Sem permissão para gerenciar unidades da equipe." };
    }
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: context.organizationId, status: "ACTIVE" },
  });
  if (!team) return { error: "Equipe não encontrada nesta organização." };

  const validLocations = locationIds.length > 0
    ? await prisma.location.findMany({
        where: { id: { in: locationIds }, organizationId: context.organizationId, status: "ACTIVE" },
        select: { id: true },
      })
    : [];
  const validLocationIds = validLocations.map((l) => l.id);

  await prisma.$transaction(async (tx) => {
    await tx.teamLocation.deleteMany({
      where: { teamId: team.id },
    });
    if (validLocationIds.length > 0) {
      await tx.teamLocation.createMany({
        data: validLocationIds.map((locId) => ({
          teamId: team.id,
          locationId: locId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.activityLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.memberId,
        action: "TEAM_LOCATIONS_UPDATED",
        entityType: "TEAM",
        entityId: team.id,
        metadata: { locationIds: validLocationIds },
      },
    });
  });

  revalidatePath("/management/teams");
  return { success: true };
}

/**
 * Atualizar Parâmetros e Configurações da Organização (Item 29, 39, 57)
 */
export async function updateOrganizationSettingsAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem alterar configurações da organização." };
  }

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: context.organizationId } });
  const settings = (org.settings && typeof org.settings === "object" && !Array.isArray(org.settings) ? org.settings : {}) as Record<string, any>;
  const updated = { ...settings };
  const name = formData.has("name") ? String(formData.get("name")).trim() : undefined;
  if (name !== undefined && name.length < 2) return { error: "Informe o nome da organização." };
  if (formData.has("delayMilestones")) {
    const values = String(formData.get("delayMilestones")).split(",").map(Number);
    if (!values.length || values.some(v => !Number.isInteger(v) || v < 1 || v > 43200)) return { error: "Use marcos de atraso em minutos, separados por vírgulas." };
    updated.delayMilestones = [...new Set(values)].sort((a, b) => a - b);
  }
  for (const key of ["operationalRetentionMonths", "delayRetentionDays"]) if (formData.has(key)) {
    const value = Number(formData.get(key));
    if (!Number.isInteger(value) || value < 1 || value > 3650) return { error: "Período de retenção inválido." };
    updated[key] = value;
  }
  if (formData.has("earlyExecutionPolicy")) {
    const policy = String(formData.get("earlyExecutionPolicy"));
    if (!["BLOCK", "ALLOW", "ALLOW_AND_LOG", "ALLOW_AND_ALERT", "NOT_ALLOWED", "ALLOWED_ANYTIME", "ALLOWED_WITHIN_WINDOW", "ALLOWED_WITH_JUSTIFICATION"].includes(policy)) return { error: "Regra de execução antecipada inválida." };
    updated.earlyExecutionPolicy = policy;
  }
  if (formData.has("hasSecuritySettings") || formData.has("allowManagersToEditSensitiveData")) {
    const val = formData.get("allowManagersToEditSensitiveData");
    updated.allowManagersToEditSensitiveData = val === "on" || val === "true" || val === "1";
  }
  await prisma.$transaction(async tx => {
    await tx.organization.update({ where: { id: context.organizationId }, data: { name, settings: updated } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: "ORGANIZATION_SETTINGS_UPDATED", entityType: "ORGANIZATION", entityId: context.organizationId } });
  });
  revalidatePath("/management/settings"); revalidatePath("/overview");
  return { success: true };
}

/**
 * Executa o expurgo de retenção para a organização ativa (Item 39)
 */
export async function executeRetentionPurgeAction(): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem executar expurgo de retenção." };
  }

  const result = await executeRetentionPurge(context.organizationId);

  await prisma.activityLog.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.memberId,
      action: "RETENTION_PURGE_EXECUTED",
      entityType: "ORGANIZATION",
      entityId: context.organizationId,
      metadata: result as any,
    },
  });

  revalidatePath("/management/settings");
  revalidatePath("/management/tasks/trash");
  return { success: true, data: result };
}
