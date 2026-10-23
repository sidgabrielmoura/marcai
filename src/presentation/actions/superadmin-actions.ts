"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { getSuperadminContext } from "@/application/security/auth-context";
import {
  subscriptionSchema,
  platformPlanSchema,
  DEFAULT_PLATFORM_PLANS,
  type PlatformPlanInput,
} from "@/application/superadmin/manual-subscription";
import {
  createDefaultTrialSubscription,
  assertCanAddMember,
} from "@/domain/rules/subscription-limits";
import { revalidatePath, revalidateOrganization } from "@/infrastructure/realtime/revalidate";
import { reusableTemplateDraftSchema } from "@/domain/rules/reusable-template-definition";
import { purgeOrganization } from "@/application/superadmin/purge-organization";

export type ActionResult = {
  success?: boolean;
  error?: string;
  data?: any;
};

const idSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(5, "Descreva o motivo com pelo menos 5 caracteres.").max(2000);
const statusSchema = z.enum(["ACTIVE", "SUSPENDED"]);
const slugSchema = z
  .string()
  .trim()
  .min(2, "O slug deve ter pelo menos 2 caracteres.")
  .max(60, "O slug deve ter no máximo 60 caracteres.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "O slug deve conter apenas letras minúsculas, números e hifens (ex: minha-empresa).");

const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"]);

export async function createOrganizationAction(input: {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPassword?: string;
  createDefaultLocation?: boolean;
  businessSegmentId?: string;
  reason?: string;
}): Promise<ActionResult & { organizationId?: string }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres.").max(100),
      slug: slugSchema,
      ownerEmail: z.string().trim().email("E-mail do proprietário inválido.").toLowerCase(),
      ownerName: z.string().trim().max(100).optional().or(z.literal("")),
      ownerPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").optional().or(z.literal("")),
      createDefaultLocation: z.boolean().optional(),
      businessSegmentId: z.string().trim().optional().or(z.literal("")),
      reason: z.string().trim().max(2000).optional().default("Criação de organização via painel Superadmin"),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, slug, ownerEmail, ownerName, ownerPassword, createDefaultLocation, businessSegmentId, reason } = parsed.data;

  try {
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      return { error: "Já existe uma organização com este identificador (slug)." };
    }

    const created = await prisma.$transaction(async (tx) => {
      const trialSubscription = createDefaultTrialSubscription();
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          status: "ACTIVE",
          businessSegmentId: businessSegmentId?.trim() ? businessSegmentId.trim() : null,
          settings: {
            delayMilestones: [15, 30, 60],
            operationalRetentionMonths: 6,
            delayRetentionDays: 60,
            earlyExecutionPolicy: "ALLOW_AND_LOG",
            platformSubscription: trialSubscription,
          },
        },
      });

      if (createDefaultLocation) {
        await tx.location.create({
          data: {
            organizationId: org.id,
            name: "Matriz / Principal",
            status: "ACTIVE",
            timezone: "America/Sao_Paulo",
            openingTime: "08:00",
            closingTime: "20:00",
            operatingDays: "MON,TUE,WED,THU,FRI,SAT",
          },
        });
      }

      // Criação ou vínculo automático do usuário proprietário
      let user = await tx.user.findUnique({ where: { email: ownerEmail } });
      const initialPassword = ownerPassword?.trim() || "tarefai123@";
      const passwordHash = await bcrypt.hash(initialPassword, 10);

      if (!user) {
        user = await tx.user.create({
          data: {
            name, // Nome do proprietário recebe o nome da empresa
            email: ownerEmail,
            passwordHash,
            platformRole: null, // Usuário comum (não superadmin)
            status: "ACTIVE",
          },
        });
      } else if (!user.passwordHash) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { passwordHash },
        });
      }

      const existingMembership = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId: user.id,
          },
        },
      });

      if (!existingMembership) {
        await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: Role.OWNER,
            status: "ACTIVE",
            employeeCode: null,
            pinHash: null,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          organizationId: org.id,
          actorId: actor.userId,
          action: "ORGANIZATION_CREATED",
          entityType: "ORGANIZATION",
          entityId: org.id,
          metadata: { name, slug, ownerEmail, reason },
        },
      });

      return org;
    });

    revalidatePath("/superadmin");
    return { success: true, organizationId: created.id };
  } catch (err: any) {
    console.error("[createOrganizationAction] Erro:", err);
    return { error: err?.message || "Não foi possível criar a organização." };
  }
}

export async function updateOrganizationAction(input: {
  organizationId: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  businessSegmentId?: string | null;
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      organizationId: idSchema,
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
      slug: slugSchema,
      status: statusSchema,
      businessSegmentId: z.string().trim().nullable().optional(),
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { organizationId, name, slug, status, businessSegmentId, reason } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
      const current = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true, status: true, businessSegmentId: true },
      });
      if (!current) return { error: "Organização não encontrada." };

      if (slug !== current.slug) {
        const collision = await tx.organization.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (collision) {
          return { error: "Já existe outra organização utilizando este identificador (slug)." };
        }
      }

      await tx.organization.update({
        where: { id: organizationId },
        data: {
          name,
          slug,
          status,
          ...(businessSegmentId !== undefined ? { businessSegmentId: businessSegmentId || null } : {}),
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          actorId: actor.userId,
          action: "ORGANIZATION_UPDATED",
          entityType: "ORGANIZATION",
          entityId: organizationId,
          metadata: {
            previous: { name: current.name, slug: current.slug, status: current.status },
            updated: { name, slug, status },
            reason,
          },
        },
      });

      return { success: true };
    });

    if (result.success) {
      revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
    }
    return result;
  } catch (err: any) {
    console.error("[updateOrganizationAction] Erro:", err);
    return { error: err?.message || "Não foi possível atualizar a organização." };
  }
}

export async function deleteOrganizationAction(input: {
  organizationId: string;
  confirmationSlug: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      organizationId: idSchema,
      confirmationSlug: z.string().trim(),
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { organizationId, confirmationSlug, reason } = parsed.data;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });

    if (!org) {
      return { error: "Organização não encontrada." };
    }

    if (org.slug.toLowerCase() !== confirmationSlug.toLowerCase().trim()) {
      return {
        error: `O identificador digitado "${confirmationSlug}" não corresponde ao slug da organização "${org.slug}".`,
      };
    }

    const purgeSummary = await prisma.$transaction(async (tx) => {
      return purgeOrganization(tx, organizationId, actor.userId);
    });

    console.info("[deleteOrganizationAction] Organização expurgada com sucesso:", purgeSummary);

    revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    console.error("[deleteOrganizationAction] Erro:", err);
    return { error: err?.message || "Não foi possível excluir a organização." };
  }
}

export async function toggleOrganizationStatusAction(
  targetOrgId: string,
  newStatus: "ACTIVE" | "SUSPENDED",
  reason: string
): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ id: idSchema, status: statusSchema, reason: reasonSchema }).safeParse({ id: targetOrgId, status: newStatus, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.data.id} FOR UPDATE`;
    const org = await tx.organization.findUnique({ where: { id: input.data.id }, select: { status: true } });
    if (!org) return { error: "Organização não encontrada." };
    if (org.status === input.data.status) return { success: true };
    await tx.organization.update({ where: { id: input.data.id }, data: { status: input.data.status } });
    await tx.activityLog.create({
      data: {
        organizationId: input.data.id,
        actorId: actor.userId,
        action: input.data.status === "ACTIVE" ? "ORGANIZATION_ACTIVATED" : "ORGANIZATION_SUSPENDED",
        entityType: "ORGANIZATION",
        entityId: input.data.id,
        metadata: { previousStatus: org.status, newStatus: input.data.status, reason: input.data.reason },
      },
    });
    return { success: true };
  });
  revalidateOrganization(targetOrgId);
    revalidatePath("/superadmin");
  return result;
}

// ==========================================
// 2. USUÁRIOS DA PLATAFORMA
// ==========================================

export async function createPlatformUserAction(input: {
  name: string;
  email: string;
  password: string;
  platformRole?: "USER" | "SUPERADMIN";
  organizationId?: string;
  role?: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
  employeeCode?: string;
  pin?: string;
  reason?: string;
}): Promise<ActionResult & { userId?: string }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
      email: z.string().trim().email("E-mail inválido.").toLowerCase(),
      password: z.string().min(8, "A senha deve conter no mínimo 8 caracteres.").max(100),
      platformRole: z.enum(["USER", "SUPERADMIN"]).optional().default("USER"),
      organizationId: z.string().trim().optional().or(z.literal("")),
      role: roleSchema.optional(),
      employeeCode: z.string().trim().max(50).optional().or(z.literal("")),
      pin: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos numéricos.")
        .optional()
        .or(z.literal("")),
      reason: z.string().trim().max(2000).optional().default("Cadastro de usuário via painel Superadmin"),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, email, password, platformRole, organizationId, role, employeeCode, pin, reason } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { error: "Já existe um usuário cadastrado com este e-mail." };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(pin, 10) : null;

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          platformRole: platformRole === "SUPERADMIN" ? "SUPERADMIN" : null,
          status: "ACTIVE",
        },
      });

      if (organizationId) {
        const org = await tx.organization.findUnique({
          where: { id: organizationId },
          select: { id: true },
        });
        if (!org) {
          throw new Error("Organização selecionada não foi encontrada.");
        }

        if (employeeCode) {
          const duplicateCode = await tx.organizationMember.findFirst({
            where: { organizationId, employeeCode },
          });
          if (duplicateCode) {
            throw new Error(`A matrícula "${employeeCode}" já está em uso nesta organização.`);
          }
        }

        await tx.organizationMember.create({
          data: {
            organizationId,
            userId: user.id,
            role: (role as Role) || Role.EMPLOYEE,
            employeeCode: employeeCode || null,
            pinHash,
            status: "ACTIVE",
          },
        });

        await tx.activityLog.create({
          data: {
            organizationId,
            actorId: actor.userId,
            action: "PLATFORM_USER_CREATED_AND_LINKED",
            entityType: "USER",
            entityId: user.id,
            metadata: { name, email, platformRole, role, employeeCode, reason },
          },
        });
      }

      return user;
    });

    revalidatePath("/superadmin");
    return { success: true, userId: createdUser.id };
  } catch (err: any) {
    console.error("[createPlatformUserAction] Erro:", err);
    return { error: err?.message || "Não foi possível criar o usuário." };
  }
}

export async function updatePlatformUserAction(input: {
  userId: string;
  name: string;
  email: string;
  platformRole?: "USER" | "SUPERADMIN";
  newPassword?: string;
  status: "ACTIVE" | "SUSPENDED";
  reason?: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      userId: idSchema,
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
      email: z.string().trim().email("E-mail inválido.").toLowerCase(),
      platformRole: z.enum(["USER", "SUPERADMIN"]).optional().default("USER"),
      newPassword: z.string().min(8, "Nova senha deve ter pelo menos 8 caracteres.").max(100).optional().or(z.literal("")),
      status: statusSchema,
      reason: z.string().trim().max(2000).optional().default("Alteração cadastral de usuário via painel Superadmin"),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { userId, name, email, platformRole, newPassword, status, reason } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          memberships: { select: { organizationId: true, role: true, status: true } },
        },
      });

      if (!user) return { error: "Usuário não encontrado." };

      if (email !== user.email) {
        const collision = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (collision) {
          return { error: "Este e-mail já pertence a outro usuário." };
        }
      }

      // Salvaguarda: não permitir remover o próprio superadmin se for o único no sistema
      if (user.id === actor.userId && platformRole !== "SUPERADMIN") {
        const countSuperadmins = await tx.user.count({
          where: { platformRole: "SUPERADMIN", status: "ACTIVE" },
        });
        if (countSuperadmins <= 1) {
          return { error: "Você é o único Superadmin ativo no sistema e não pode revogar seu próprio papel." };
        }
      }

      // Salvaguarda: suspensão de usuário único proprietário de organização ativa
      if (status === "SUSPENDED" && user.status === "ACTIVE") {
        for (const membership of user.memberships.filter((m) => m.role === "OWNER" && m.status === "ACTIVE")) {
          const otherOwner = await tx.organizationMember.count({
            where: {
              organizationId: membership.organizationId,
              role: "OWNER",
              status: "ACTIVE",
              userId: { not: user.id },
              user: { status: "ACTIVE" },
            },
          });
          if (!otherOwner) {
            return {
              error: "Este usuário é o único proprietário ativo de uma organização. Defina outro proprietário antes de suspendê-lo.",
            };
          }
        }
      }

      const updateData: Prisma.UserUpdateInput = {
        name,
        email,
        platformRole: platformRole === "SUPERADMIN" ? "SUPERADMIN" : null,
        status,
      };

      if (newPassword) {
        updateData.passwordHash = await bcrypt.hash(newPassword, 10);
      }

      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Registra log nas organizações onde o usuário possui vínculo
      if (user.memberships.length > 0) {
        await tx.activityLog.createMany({
          data: user.memberships.map((m) => ({
            organizationId: m.organizationId,
            actorId: actor.userId,
            action: "PLATFORM_USER_UPDATED",
            entityType: "USER",
            entityId: user.id,
            metadata: {
              previous: { name: user.name, email: user.email, platformRole: user.platformRole, status: user.status },
              updated: { name, email, platformRole, status, passwordReset: Boolean(newPassword) },
              reason,
            },
          })),
        });
      }

      return { success: true };
    });

    if (result.success) {
      revalidatePath("/superadmin");
    }
    return result;
  } catch (err: any) {
    console.error("[updatePlatformUserAction] Erro:", err);
    return { error: err?.message || "Não foi possível atualizar o usuário." };
  }
}

export async function deletePlatformUserAction(input: {
  userId: string;
  confirmationEmail: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      userId: idSchema,
      confirmationEmail: z.string().trim().toLowerCase(),
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { userId, confirmationEmail, reason } = parsed.data;

  if (userId === actor.userId) {
    return { error: "Você não pode excluir sua própria conta de Superadmin." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          select: {
            organizationId: true,
            role: true,
            status: true,
            organization: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!user) {
      return { error: "Usuário não encontrado." };
    }

    if (!user.email || user.email.toLowerCase() !== confirmationEmail) {
      return {
        error: `O e-mail digitado "${confirmationEmail}" não confere com o e-mail do usuário "${user.email}".`,
      };
    }

    // Salvaguarda: Não permitir excluir o único OWNER de organização ativa
    for (const membership of user.memberships.filter((m) => m.role === "OWNER" && m.status === "ACTIVE" && m.organization.status === "ACTIVE")) {
      const otherOwners = await prisma.organizationMember.count({
        where: {
          organizationId: membership.organizationId,
          role: "OWNER",
          status: "ACTIVE",
          userId: { not: user.id },
          user: { status: "ACTIVE" },
        },
      });
      if (otherOwners === 0) {
        return {
          error: `Este usuário é o único proprietário ativo da organização "${membership.organization.name}". Defina outro proprietário antes de excluí-lo.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Cria log antes da exclusão nas organizações pertencentes
      if (user.memberships.length > 0) {
        await tx.activityLog.createMany({
          data: user.memberships.map((m) => ({
            organizationId: m.organizationId,
            actorId: actor.userId,
            action: "PLATFORM_USER_DELETED",
            entityType: "USER",
            entityId: user.id,
            metadata: { name: user.name, email: user.email, reason },
          })),
        });
      }

      await tx.user.delete({
        where: { id: userId },
      });
    });

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    console.error("[deletePlatformUserAction] Erro:", err);
    return { error: err?.message || "Não foi possível excluir o usuário." };
  }
}

export async function updatePlatformUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED", reason: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ userId: idSchema, status: statusSchema, reason: reasonSchema }).safeParse({ userId, status, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('platform-user-status'))`;
    const user = await tx.user.findUnique({ where: { id: input.data.userId }, include: { memberships: { select: { organizationId: true, role: true, status: true } } } });
    if (!user) return { error: "Usuário não encontrado." };
    if (user.id === actor.userId || user.platformRole === "SUPERADMIN") return { error: "Contas de superadmin não podem ser suspensas por esta operação." };
    if (!user.memberships.length) return { error: "Este usuário não tem organização para registrar a auditoria. Regularize o vínculo antes de alterar o acesso." };
    if (input.data.status === "SUSPENDED") {
      for (const membership of user.memberships.filter((member) => member.role === "OWNER" && member.status === "ACTIVE")) {
        const anotherOwner = await tx.organizationMember.count({ where: { organizationId: membership.organizationId, role: "OWNER", status: "ACTIVE", userId: { not: user.id }, user: { status: "ACTIVE" } } });
        if (!anotherOwner) return { error: "Este usuário é o único proprietário ativo de uma organização. Cadastre outro proprietário antes de suspender o acesso." };
      }
    }
    if (user.status === input.data.status) return { success: true };
    await tx.user.update({ where: { id: user.id }, data: { status: input.data.status } });
    await tx.activityLog.createMany({ data: user.memberships.map((member) => ({ organizationId: member.organizationId, actorId: actor.userId, action: "PLATFORM_USER_STATUS_CHANGED", entityType: "USER", entityId: user.id, metadata: { previousStatus: user.status, newStatus: input.data.status, reason: input.data.reason } })) });
    return { success: true };
  });
  revalidatePath("/superadmin");
  return result;
}

// ==========================================
// 3. VÍNCULOS ORGANIZAÇÃO-MEMBRO
// ==========================================

export async function addOrganizationMemberAction(input: {
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
  employeeCode?: string;
  pin?: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      organizationId: idSchema,
      userId: idSchema,
      role: roleSchema,
      employeeCode: z.string().trim().max(50).optional().or(z.literal("")),
      pin: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "O PIN deve conter exatamente 6 dígitos numéricos.")
        .optional()
        .or(z.literal("")),
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { organizationId, userId, role, employeeCode, pin, reason } = parsed.data;

  try {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
    if (!org) return { error: "Organização não encontrada." };

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) return { error: "Usuário não encontrado." };

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (existing) {
      return { error: `Este usuário já é membro da organização "${org.name}".` };
    }

    if (employeeCode) {
      const codeInUse = await prisma.organizationMember.findFirst({
        where: { organizationId, employeeCode },
      });
      if (codeInUse) {
        return { error: `A matrícula "${employeeCode}" já está em uso nesta organização.` };
      }
    }

    const pinHash = pin ? await bcrypt.hash(pin, 10) : null;

    await prisma.$transaction(async (tx) => {
      // Valida limite de colaboradores antes de vincular novo membro no superadmin
      await assertCanAddMember(tx, organizationId);

      await tx.organizationMember.create({
        data: {
          organizationId,
          userId,
          role: role as Role,
          employeeCode: employeeCode || null,
          pinHash,
          status: "ACTIVE",
        },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          actorId: actor.userId,
          action: "ORGANIZATION_MEMBER_LINKED",
          entityType: "ORGANIZATION_MEMBER",
          entityId: userId,
          metadata: { userId, userName: user.name, role, employeeCode, reason },
        },
      });
    });

    revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    console.error("[addOrganizationMemberAction] Erro:", err);
    return { error: err?.message || "Não foi possível vincular o membro à organização." };
  }
}

export async function removeOrganizationMemberAction(input: {
  organizationId: string;
  userId: string;
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      organizationId: idSchema,
      userId: idSchema,
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { organizationId, userId, reason } = parsed.data;

  try {
    const member = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: { select: { name: true } }, user: { select: { name: true } } },
    });

    if (!member) {
      return { error: "Vínculo de membro não encontrado." };
    }

    // Se for OWNER ativo, checa se há outro OWNER ativo
    if (member.role === "OWNER" && member.status === "ACTIVE") {
      const otherOwners = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: "OWNER",
          status: "ACTIVE",
          userId: { not: userId },
        },
      });
      if (otherOwners === 0) {
        return {
          error: `Este usuário é o único proprietário ativo da organização "${member.organization.name}". Defina outro proprietário antes de remover o vínculo.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.activityLog.create({
        data: {
          organizationId,
          actorId: actor.userId,
          action: "ORGANIZATION_MEMBER_UNLINKED",
          entityType: "ORGANIZATION_MEMBER",
          entityId: member.id,
          metadata: { userId, userName: member.user.name, previousRole: member.role, reason },
        },
      });

      await tx.organizationMember.delete({
        where: { id: member.id },
      });
    });

    revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    console.error("[removeOrganizationMemberAction] Erro:", err);
    return { error: err?.message || "Não foi possível remover o vínculo." };
  }
}

export async function updateOrganizationMemberRoleAction(input: {
  organizationId: string;
  userId: string;
  newRole: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
  reason: string;
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      organizationId: idSchema,
      userId: idSchema,
      newRole: roleSchema,
      reason: reasonSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { organizationId, userId, newRole, reason } = parsed.data;

  try {
    const member = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: { select: { name: true } }, user: { select: { name: true } } },
    });

    if (!member) {
      return { error: "Vínculo de membro não encontrado." };
    }

    if (member.role === newRole) {
      return { success: true };
    }

    // Se estiver rebaixando de OWNER, garante que há outro OWNER
    if (member.role === "OWNER" && newRole !== "OWNER") {
      const otherOwners = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: "OWNER",
          status: "ACTIVE",
          userId: { not: userId },
        },
      });
      if (otherOwners === 0) {
        return {
          error: `Este usuário é o único proprietário ativo da organização "${member.organization.name}". Defina outro proprietário antes de alterar este papel.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({
        where: { id: member.id },
        data: { role: newRole as Role },
      });

      await tx.activityLog.create({
        data: {
          organizationId,
          actorId: actor.userId,
          action: "ORGANIZATION_MEMBER_ROLE_CHANGED",
          entityType: "ORGANIZATION_MEMBER",
          entityId: member.id,
          metadata: { userId, userName: member.user.name, previousRole: member.role, newRole, reason },
        },
      });
    });

    revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    console.error("[updateOrganizationMemberRoleAction] Erro:", err);
    return { error: err?.message || "Não foi possível atualizar o papel do membro." };
  }
}

// ==========================================
// 4. PLANOS E SUPORTE
// ==========================================

export async function saveManualSubscriptionAction(
  organizationId: string,
  value: unknown,
  reason?: string
): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z
    .object({
      organizationId: idSchema,
      subscription: subscriptionSchema,
      reason: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .transform((v) => v || "Registro de assinatura comercial pelo superadmin"),
    })
    .safeParse({ organizationId, subscription: value, reason });
  if (!input.success) return { error: input.error.issues[0].message };
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${input.data.organizationId} FOR UPDATE`;
    const org = await tx.organization.findUnique({
      where: { id: input.data.organizationId },
      select: { settings: true },
    });
    if (!org) return { error: "Organização não encontrada." };
    const previous =
      org.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
        ? org.settings
        : {};
    const settings = {
      ...previous,
      platformSubscription: input.data.subscription,
    } as Prisma.InputJsonObject;
    await tx.organization.update({
      where: { id: input.data.organizationId },
      data: { settings },
    });
    await tx.activityLog.create({
      data: {
        organizationId: input.data.organizationId,
        actorId: actor.userId,
        action: "MANUAL_SUBSCRIPTION_UPDATED",
        entityType: "ORGANIZATION",
        entityId: input.data.organizationId,
        metadata: {
          previous: previous.platformSubscription ?? null,
          subscription: input.data.subscription,
          reason: input.data.reason,
        },
      },
    });
    return { success: true };
  });
  revalidateOrganization(organizationId);
    revalidatePath("/superadmin");
  return result;
}

export async function createPlatformPlanAction(input: unknown): Promise<ActionResult & { plan?: any }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = platformPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const plan = await prisma.platformPlan.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        cycle: parsed.data.cycle,
        amountCents: parsed.data.amountCents,
        memberLimit: parsed.data.memberLimit,
        locationLimit: parsed.data.locationLimit,
        features: parsed.data.features || null,
        status: parsed.data.status,
      },
    });

    const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (firstOrg) {
      await prisma.activityLog.create({
        data: {
          organizationId: firstOrg.id,
          actorId: actor.userId,
          action: "PLATFORM_PLAN_CREATED",
          entityType: "PLATFORM_PLAN",
          entityId: plan.id,
          metadata: { planName: plan.name, cycle: plan.cycle, amountCents: plan.amountCents },
        },
      });
    }

    revalidatePath("/superadmin");
    return { success: true, plan };
  } catch (err: any) {
    return { error: err?.message || "Erro ao criar plano pronto." };
  }
}

export async function updatePlatformPlanAction(id: string, input: unknown): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { error: "ID de plano inválido." };

  const parsed = platformPlanSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const existing = await prisma.platformPlan.findUnique({ where: { id } });
    if (!existing) return { error: "Plano não encontrado." };

    await prisma.platformPlan.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.cycle ? { cycle: parsed.data.cycle } : {}),
        ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
        ...(parsed.data.memberLimit !== undefined ? { memberLimit: parsed.data.memberLimit } : {}),
        ...(parsed.data.locationLimit !== undefined ? { locationLimit: parsed.data.locationLimit } : {}),
        ...(parsed.data.features !== undefined ? { features: parsed.data.features } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });

    const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (firstOrg) {
      await prisma.activityLog.create({
        data: {
          organizationId: firstOrg.id,
          actorId: actor.userId,
          action: "PLATFORM_PLAN_UPDATED",
          entityType: "PLATFORM_PLAN",
          entityId: id,
          metadata: { planName: parsed.data.name ?? existing.name },
        },
      });
    }

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao atualizar plano." };
  }
}

export async function deletePlatformPlanAction(id: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const idCheck = idSchema.safeParse(id);
  if (!idCheck.success) return { error: "ID de plano inválido." };

  try {
    const plan = await prisma.platformPlan.findUnique({ where: { id } });
    if (!plan) return { error: "Plano não encontrado." };

    await prisma.platformPlan.delete({ where: { id } });

    const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
    if (firstOrg) {
      await prisma.activityLog.create({
        data: {
          organizationId: firstOrg.id,
          actorId: actor.userId,
          action: "PLATFORM_PLAN_DELETED",
          entityType: "PLATFORM_PLAN",
          entityId: id,
          metadata: { planName: plan.name },
        },
      });
    }

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao excluir plano." };
  }
}

export async function seedDefaultPlatformPlansAction(): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  try {
    for (const plan of DEFAULT_PLATFORM_PLANS) {
      const exists = await prisma.platformPlan.findFirst({ where: { name: plan.name } });
      if (!exists) {
        await prisma.platformPlan.create({ data: plan });
      }
    }
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao carregar modelos padrão." };
  }
}

export async function addSupportNoteAction(organizationId: string, status: string, note: string): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };
  const input = z.object({ organizationId: idSchema, status: z.enum(["OPEN", "FOLLOW_UP", "RESOLVED"]), note: reasonSchema }).safeParse({ organizationId, status, note });
  if (!input.success) return { error: input.error.issues[0].message };
  const org = await prisma.organization.findUnique({ where: { id: input.data.organizationId }, select: { id: true } });
  if (!org) return { error: "Organização não encontrada." };
  await prisma.activityLog.create({
    data: {
      organizationId: org.id,
      actorId: actor.userId,
      action: "SUPPORT_NOTE_ADDED",
      entityType: "ORGANIZATION",
      entityId: org.id,
      metadata: { status: input.data.status, note: input.data.note },
    },
  });
  revalidatePath("/superadmin");
  return { success: true };
}

export async function createBusinessSegmentAction(input: {
  name: string;
  description?: string;
}): Promise<ActionResult & { segmentId?: string; segment?: any }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
      description: z.string().trim().max(500).optional().or(z.literal("")),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, description } = parsed.data;
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  try {
    const existing = await prisma.platformBusinessSegment.findFirst({
      where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }] },
    });
    if (existing) {
      return { error: "Já existe um tipo de negócio com este nome." };
    }

    const created = await prisma.platformBusinessSegment.create({
      data: {
        name,
        slug,
        description: description || null,
        status: "ACTIVE",
      },
    });

    revalidatePath("/superadmin");
    return { success: true, segmentId: created.id, segment: created };
  } catch (err: any) {
    return { error: err?.message || "Erro ao cadastrar tipo de negócio." };
  }
}

export async function updateBusinessSegmentAction(input: {
  id: string;
  name: string;
  description?: string;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      id: idSchema,
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
      description: z.string().trim().max(500).optional().or(z.literal("")),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, name, description, status } = parsed.data;

  try {
    const current = await prisma.platformBusinessSegment.findUnique({ where: { id } });
    if (!current) return { error: "Tipo de negócio não encontrado." };

    await prisma.platformBusinessSegment.update({
      where: { id },
      data: {
        name,
        description: description || null,
        status,
      },
    });

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao atualizar tipo de negócio." };
  }
}

export async function deleteBusinessSegmentAction(input: { id: string }): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { error: "Identificador inválido." };

  try {
    const segment = await prisma.platformBusinessSegment.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { organizations: true, templates: true } } },
    });
    if (!segment) return { error: "Tipo de negócio não encontrado." };

    if (segment._count.organizations > 0) {
      // Se houver organizações vinculadas, desativa ao invés de deletar
      await prisma.platformBusinessSegment.update({
        where: { id: segment.id },
        data: { status: "INACTIVE" },
      });
      revalidatePath("/superadmin");
      return { success: true };
    }

    await prisma.platformBusinessSegment.delete({
      where: { id: segment.id },
    });

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao remover tipo de negócio." };
  }
}

export async function createPlatformTemplateAction(input: {
  segmentId: string;
  name: string;
  description?: string;
  criticality?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tasks: Array<{
    title: string;
    instructions?: string;
    evidenceType?: string;
    required?: boolean;
    slaMinutes?: number;
    toleranceMinutes?: number;
    taskType?: string;
    formFields?: Array<{
      question: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }>;
}): Promise<ActionResult & { templateId?: string }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      segmentId: idSchema,
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(150),
      description: z.string().trim().max(1000).optional().or(z.literal("")),
      criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      tasks: z
        .array(
          z.object({
            title: z.string().trim().min(1, "Título da etapa obrigatório.").max(200),
            instructions: z.string().trim().max(2000).optional().default(""),
            evidenceType: z.string().optional().default("PHOTO"),
            required: z.boolean().optional().default(true),
            slaMinutes: z.number().int().min(1).max(10080).optional().default(60),
            toleranceMinutes: z.number().int().min(0).max(1440).optional().default(20),
            taskType: z.enum(["STANDARD", "FORM"]).optional().default("STANDARD"),
            formFields: z
              .array(
                z.object({
                  question: z.string().trim().min(1).max(500),
                  type: z.string().default("TEXT"),
                  required: z.boolean().default(false),
                  options: z.array(z.string()).default([]),
                })
              )
              .optional()
              .default([]),
          })
        )
        .min(1, "Adicione pelo menos 1 etapa ao template."),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { segmentId, name, description, criticality, tasks } = parsed.data;

  try {
    const segment = await prisma.platformBusinessSegment.findUnique({
      where: { id: segmentId },
    });
    if (!segment) return { error: "Tipo de negócio não encontrado." };

    const definition = {
      schemaVersion: 1,
      name,
      description: description || "",
      jobKey: "CUSTOM",
      criticality,
      teamSlots: [{ id: "team-1", label: "Operação" }],
      memberSlots: [{ id: "approver-1", label: "Gestor", kind: "APPROVER" }],
      tasks: tasks.map((t, idx) => ({
        id: `task-${idx + 1}`,
        title: t.title,
        taskType: t.taskType,
        objective: "",
        instructions: t.instructions || "",
        formFields: t.formFields.map((f, fIdx) => ({
          id: `field-${fIdx + 1}`,
          question: f.question,
          type: f.type,
          required: f.required,
          options: f.options,
        })),
        teamSlotId: "team-1",
        assigneeSlotId: "",
        priority: "MEDIUM",
        criticality: "MEDIUM",
        slaMinutes: t.slaMinutes,
        toleranceMinutes: t.toleranceMinutes,
        required: t.required,
        evidenceType: t.evidenceType,
        dependsOn: [],
        dependencyType: "BLOCKING",
        dependencyLogic: "AND",
        approverSlotIds: [],
        approvalMode: "SEQUENTIAL",
      })),
      schedule: null,
    };

    const created = await prisma.platformTemplate.create({
      data: {
        segmentId,
        name,
        description: description || null,
        definition,
        version: 1,
        status: "ACTIVE",
      },
    });

    revalidatePath("/superadmin");
    return { success: true, templateId: created.id };
  } catch (err: any) {
    return { error: err?.message || "Erro ao criar template de plataforma." };
  }
}

export async function updatePlatformTemplateAction(input: {
  id: string;
  name: string;
  description?: string;
  criticality?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tasks: Array<{
    title: string;
    instructions?: string;
    evidenceType?: string;
    required?: boolean;
    slaMinutes?: number;
    toleranceMinutes?: number;
    taskType?: string;
    formFields?: Array<{
      question: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }>;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      id: idSchema,
      name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(150),
      description: z.string().trim().max(1000).optional().or(z.literal("")),
      criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
      tasks: z
        .array(
          z.object({
            title: z.string().trim().min(1, "Título da etapa obrigatório.").max(200),
            instructions: z.string().trim().max(2000).optional().default(""),
            evidenceType: z.string().optional().default("PHOTO"),
            required: z.boolean().optional().default(true),
            slaMinutes: z.number().int().min(1).max(10080).optional().default(60),
            toleranceMinutes: z.number().int().min(0).max(1440).optional().default(20),
            taskType: z.enum(["STANDARD", "FORM"]).optional().default("STANDARD"),
            formFields: z
              .array(
                z.object({
                  question: z.string().trim().min(1).max(500),
                  type: z.string().default("TEXT"),
                  required: z.boolean().default(false),
                  options: z.array(z.string()).default([]),
                })
              )
              .optional()
              .default([]),
          })
        )
        .min(1, "Adicione pelo menos 1 etapa ao template."),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, name, description, criticality, tasks, status } = parsed.data;

  try {
    const current = await prisma.platformTemplate.findUnique({ where: { id } });
    if (!current) return { error: "Template não encontrado." };

    const definition = {
      schemaVersion: 1,
      name,
      description: description || "",
      jobKey: "CUSTOM",
      criticality,
      teamSlots: [{ id: "team-1", label: "Operação" }],
      memberSlots: [{ id: "approver-1", label: "Gestor", kind: "APPROVER" }],
      tasks: tasks.map((t, idx) => ({
        id: `task-${idx + 1}`,
        title: t.title,
        taskType: t.taskType,
        objective: "",
        instructions: t.instructions || "",
        formFields: t.formFields.map((f, fIdx) => ({
          id: `field-${fIdx + 1}`,
          question: f.question,
          type: f.type,
          required: f.required,
          options: f.options,
        })),
        teamSlotId: "team-1",
        assigneeSlotId: "",
        priority: "MEDIUM",
        criticality: "MEDIUM",
        slaMinutes: t.slaMinutes,
        toleranceMinutes: t.toleranceMinutes,
        required: t.required,
        evidenceType: t.evidenceType,
        dependsOn: [],
        dependencyType: "BLOCKING",
        dependencyLogic: "AND",
        approverSlotIds: [],
        approvalMode: "SEQUENTIAL",
      })),
      schedule: null,
    };

    await prisma.platformTemplate.update({
      where: { id },
      data: {
        name,
        description: description || null,
        definition,
        version: current.version + 1,
        status,
      },
    });

    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao atualizar template." };
  }
}

export async function deletePlatformTemplateAction(input: { id: string }): Promise<ActionResult> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { error: "Identificador inválido." };

  try {
    await prisma.platformTemplate.delete({ where: { id: parsed.data.id } });
    revalidatePath("/superadmin");
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Erro ao excluir template." };
  }
}

export async function savePlatformTemplateDefinitionAction(input: {
  id?: string;
  segmentId: string;
  definition: unknown;
}): Promise<ActionResult & { id?: string; segmentId?: string }> {
  const actor = await getSuperadminContext(false);
  if (!actor) return { error: "Acesso negado." };

  const parsed = z
    .object({
      id: idSchema.optional(),
      segmentId: idSchema,
      definition: z.unknown(),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, segmentId } = parsed.data;

  const segment = await prisma.platformBusinessSegment.findUnique({
    where: { id: segmentId },
  });
  if (!segment) {
    return { error: "Segmento de negócio não encontrado." };
  }

  const defParsed = reusableTemplateDraftSchema.safeParse(input.definition);
  if (!defParsed.success) {
    return { error: defParsed.error.issues[0]?.message || "Definição do template inválida." };
  }

  const d = defParsed.data;

  try {
    if (id) {
      const existing = await prisma.platformTemplate.findUnique({ where: { id } });
      if (!existing) return { error: "Template não encontrado." };

      const updated = await prisma.platformTemplate.update({
        where: { id },
        data: {
          segmentId,
          name: d.name || "Template sem nome",
          description: d.description || null,
          definition: d as any,
          version: existing.version + 1,
          updatedAt: new Date(),
        },
      });

      revalidatePath("/superadmin");
      revalidatePath("/management/templates");
      return { success: true, id: updated.id, segmentId };
    } else {
      const created = await prisma.platformTemplate.create({
        data: {
          segmentId,
          name: d.name || "Template sem nome",
          description: d.description || null,
          definition: d as any,
          version: 1,
          status: "ACTIVE",
        },
      });

      revalidatePath("/superadmin");
      revalidatePath("/management/templates");
      return { success: true, id: created.id, segmentId };
    }
  } catch (err: any) {
    return { error: err?.message || "Erro ao salvar template da plataforma." };
  }
}



