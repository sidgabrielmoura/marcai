import { getSession } from "@/infrastructure/security/session";
import { prisma } from "@/infrastructure/database/prisma";
import { ManagerScope, Role } from "@/domain/types";
import { redirect } from "next/navigation";
import { hasSecondFactorProof } from "@/infrastructure/security/totp";
import { readManualSubscription, type ManualSubscription } from "@/application/superadmin/manual-subscription";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { requestRead } from "@/infrastructure/database/request-memo";

export const authenticatedMemberSelect = {
  id: true, userId: true, organizationId: true, status: true, role: true, employeeCode: true, pinHash: true,
  user: { select: { id: true, name: true, email: true, status: true, platformRole: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true } },
  organization: { select: { id: true, name: true, slug: true, status: true, settings: true } },
  locationAccesses: { select: { locationId: true, startsAt: true, expiresAt: true, location: { select: { organizationId: true, status: true } } } },
  teamMemberships: { select: { teamId: true, team: { select: { organizationId: true, status: true } } } },
} as const satisfies Prisma.OrganizationMemberSelect;

export type AuthenticatedMember = Prisma.OrganizationMemberGetPayload<{ select: typeof authenticatedMemberSelect }>;

export function contextFromMember(member: AuthenticatedMember, now = new Date()): AuthenticatedContext {
  const scope = member.role === "MANAGER" || member.role === "EMPLOYEE" ? {
    locationIds: member.locationAccesses.filter(a => a.location.organizationId === member.organizationId && a.location.status === "ACTIVE" && (!a.startsAt || a.startsAt <= now) && (!a.expiresAt || a.expiresAt > now)).map(a => a.locationId),
    teamIds: member.teamMemberships.filter(a => a.team.organizationId === member.organizationId && a.team.status === "ACTIVE").map(a => a.teamId),
  } : undefined;
  return {
    userId: member.user.id, userName: member.user.name, userEmail: member.user.email,
    organizationId: member.organization.id, organizationName: member.organization.name, organizationSlug: member.organization.slug,
    memberId: member.id, role: member.role as Role, employeeCode: member.employeeCode, scope,
    subscription: readManualSubscription(member.organization.settings),
  };
}

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
  subscription?: ManualSubscription | null;
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
async function loadAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  const session = await getSession();

  if (!session) {
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
    select: authenticatedMemberSelect,
  });

  if (!member || member.organization.status !== "ACTIVE" || member.user.status !== "ACTIVE") {
    return null;
  }
  if (!hasSecondFactorProof(member.user, session.secondFactorProof)) {
    return null;
  }

  return contextFromMember(member);
}

const getRenderContext = cache(loadAuthenticatedContext);

export async function getAuthenticatedContext(redirectOnFailure = true): Promise<AuthenticatedContext | null> {
  const context = await requestRead("authenticated-context", getRenderContext);
  if (!context && redirectOnFailure) redirect("/login");
  return context;
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
    select: { id: true, name: true, email: true, platformRole: true, twoFactorEnabled: true, twoFactorSecret: true },
  });

  if (!user) {
    if (redirectOnFailure) {
      redirect("/overview");
    }
    return null;
  }
  const isSuperadminAuthorized =
    (session.role === "SUPERADMIN" || user.platformRole === "SUPERADMIN") &&
    hasSecondFactorProof(user, session.secondFactorProof);

  if (!isSuperadminAuthorized) {
    if (redirectOnFailure) redirect("/login");
    return null;
  }

  return {
    userId: user.id,
    userName: user.name,
    email: user.email || "",
  };
}
