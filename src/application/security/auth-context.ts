import { getSession } from "@/infrastructure/security/session";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagerScope, Role } from "@/domain/types";
import { redirect } from "next/navigation";
import { hasSecondFactorProof } from "@/infrastructure/security/totp";

export interface AuthenticatedContext {
  userId: string;
  userName: string;
  userEmail: string | null;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  memberId: string;
  role: Role;
  employeeCode?: string | null;
  scope?: ManagerScope;
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Acesso não autorizado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Você não possui permissão para esta ação") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Pipeline Server-Side: Resolve e valida a identidade, organização ativa,
 * vínculo, papel e escopo operacional de forma intransigente no servidor.
 */
export async function getAuthenticatedContext(
  redirectOnFailure: boolean = true
): Promise<AuthenticatedContext | null> {
  const session = await getSession();

  if (!session) {
    if (redirectOnFailure) {
      redirect("/login");
    }
    return null;
  }

  // Validação estrita do vínculo ativo no banco de dados
  const member = await prisma.organizationMember.findFirst({
    where: {
      id: session.activeMemberId,
      organizationId: session.activeOrgId,
      userId: session.userId,
      status: "ACTIVE",
    },
    include: {
      organization: true,
      user: true,
      locationAccesses: {
        where: {
          location: { organizationId: session.activeOrgId, status: "ACTIVE" },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          ],
        },
      },
      teamMemberships: { where: { team: { organizationId: session.activeOrgId, status: "ACTIVE" } } },
    },
  });

  if (!member || member.organization.status !== "ACTIVE" || member.user.status !== "ACTIVE") {
    if (redirectOnFailure) {
      redirect("/login");
    }
    return null;
  }
  if (!hasSecondFactorProof(member.user, session.secondFactorProof)) {
    if (redirectOnFailure) redirect("/login");
    return null;
  }

  let scope: ManagerScope | undefined = undefined;

  if (member.role === "MANAGER" || member.role === "EMPLOYEE") {
    scope = {
      locationIds: member.locationAccesses.map((la) => la.locationId),
      teamIds: member.teamMemberships.map((tm) => tm.teamId),
    };
  }

  return {
    userId: member.user.id,
    userName: member.user.name,
    userEmail: member.user.email,
    organizationId: member.organization.id,
    organizationName: member.organization.name,
    organizationSlug: member.organization.slug,
    memberId: member.id,
    role: member.role as Role,
    employeeCode: member.employeeCode,
    scope,
  };
}

export async function getManagementContext() {
  const context = await getAuthenticatedContext();
  if (!context || !["OWNER", "ADMIN", "MANAGER"].includes(context.role)) redirect("/tasks");
  return context;
}

/**
 * Validação estrita de contexto Superadmin da Plataforma (Item 58)
 */
export async function getSuperadminContext(
  redirectOnFailure: boolean = true
): Promise<{ userId: string; userName: string; email: string } | null> {
  const session = await getSession();

  if (!session) {
    if (redirectOnFailure) {
      redirect("/login");
    }
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      platformRole: "SUPERADMIN",
      status: "ACTIVE",
    },
  });

  if (!user) {
    if (redirectOnFailure) {
      redirect("/overview");
    }
    return null;
  }
  if (session.role !== "SUPERADMIN" || !hasSecondFactorProof(user, session.secondFactorProof)) {
    if (redirectOnFailure) redirect("/login");
    return null;
  }

  return {
    userId: user.id,
    userName: user.name,
    email: user.email || "",
  };
}
