import {
  type ManualSubscription,
  readManualSubscription,
} from "@/application/superadmin/manual-subscription";
import type { Prisma } from "@prisma/client";

export function getIsoDateInSaoPaulo(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Cria o objeto da assinatura padrão do Piloto Gratuito (30 dias).
 */
export function createDefaultTrialSubscription(startDate: Date = new Date()): ManualSubscription {
  const startsOn = getIsoDateInSaoPaulo(startDate);
  const endsOn = getIsoDateInSaoPaulo(addDays(startDate, 30));

  return {
    planName: "Piloto Gratuito (30 dias)",
    status: "TRIAL",
    cycle: "CUSTOM",
    amountCents: 0,
    startsOn,
    endsOn,
    memberLimit: 5,
    locationLimit: 1,
    notes: "Piloto gratuito de avaliação de 30 dias gerado automaticamente na criação da organização.",
  };
}

/**
 * Verifica se a assinatura está com a vigência encerrada ou cancelada.
 */
export function isSubscriptionExpired(
  subscription: ManualSubscription | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status === "CANCELLED" || subscription.status === "PAST_DUE") {
    return true;
  }
  if (!subscription.endsOn) {
    return false;
  }

  const todayStr = getIsoDateInSaoPaulo(now);
  const todayMs = new Date(`${todayStr}T12:00:00Z`).getTime();
  const endMs = new Date(`${subscription.endsOn}T12:00:00Z`).getTime();

  if (Number.isNaN(todayMs) || Number.isNaN(endMs)) return false;

  return endMs < todayMs;
}

/**
 * Avalia se a organização pode criar uma nova unidade de acordo com o plano contratado.
 */
export function checkLocationLimit(params: {
  subscription: ManualSubscription | null;
  currentActiveLocationsCount: number;
  now?: Date;
}): { allowed: boolean; reason?: string } {
  const { subscription, currentActiveLocationsCount, now } = params;

  if (subscription && isSubscriptionExpired(subscription, now)) {
    return {
      allowed: false,
      reason: "A vigência do plano expirou. Regularize ou renove sua assinatura para cadastrar novas unidades.",
    };
  }

  if (subscription?.locationLimit != null) {
    if (currentActiveLocationsCount >= subscription.locationLimit) {
      const unitWord = subscription.locationLimit === 1 ? "unidade operacional" : "unidades operacionais";
      return {
        allowed: false,
        reason: `Limite de unidades do plano atingido (${currentActiveLocationsCount}/${subscription.locationLimit} ${unitWord}). Faça upgrade do plano para cadastrar novas unidades.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Avalia se a organização pode adicionar ou reativar um colaborador de acordo com o plano contratado.
 */
export function checkMemberLimit(params: {
  subscription: ManualSubscription | null;
  currentActiveMembersCount: number;
  now?: Date;
}): { allowed: boolean; reason?: string } {
  const { subscription, currentActiveMembersCount, now } = params;

  if (subscription && isSubscriptionExpired(subscription, now)) {
    return {
      allowed: false,
      reason: "A vigência do plano expirou. Regularize ou renove sua assinatura para cadastrar novos colaboradores.",
    };
  }

  if (subscription?.memberLimit != null) {
    if (currentActiveMembersCount >= subscription.memberLimit) {
      const personWord = subscription.memberLimit === 1 ? "colaborador ativo" : "colaboradores ativos";
      return {
        allowed: false,
        reason: `Limite de colaboradores do plano atingido (${currentActiveMembersCount}/${subscription.memberLimit} ${personWord}). Faça upgrade do plano para adicionar novos colaboradores.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Helper transacional para validar se uma nova unidade pode ser criada.
 * Lança erro caso o limite tenha sido atingido ou a vigência tenha expirado.
 */
export async function assertCanCreateLocation(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new Error("Organização não encontrada.");
  }

  const subscription = readManualSubscription(org.settings);
  const currentActiveLocationsCount = await tx.location.count({
    where: { organizationId, status: "ACTIVE" },
  });

  const check = checkLocationLimit({ subscription, currentActiveLocationsCount });
  if (!check.allowed) {
    throw new Error(check.reason);
  }
}

/**
 * Helper transacional para validar se um novo colaborador pode ser adicionado ou ativado.
 * Lança erro caso o limite tenha sido atingido ou a vigência tenha expirado.
 */
export async function assertCanAddMember(
  tx: Prisma.TransactionClient,
  organizationId: string
): Promise<void> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new Error("Organização não encontrada.");
  }

  const subscription = readManualSubscription(org.settings);
  const currentActiveMembersCount = await tx.organizationMember.count({
    where: { organizationId, status: "ACTIVE", user: { status: "ACTIVE" } },
  });

  const check = checkMemberLimit({ subscription, currentActiveMembersCount });
  if (!check.allowed) {
    throw new Error(check.reason);
  }
}
