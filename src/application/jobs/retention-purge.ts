import { prisma } from "@/infrastructure/database/prisma";
import { removeEvidence } from "@/infrastructure/storage/evidence-storage";

export interface RetentionPolicy {
  operationalRetentionMonths: number; // Padrão: 12 meses
  archiveDelayDays: number;           // Padrão: 90 dias
  evidenceRetentionDays: number;      // Padrão: 180 dias
}

export interface PurgeResult {
  trashedTasksPurged: number;
  evidencesPurged: number;
  executionsArchived: number;
}

/**
 * Serviço de Retenção e Expurgo Operacional (Item 39).
 * Executa a política configurada por organização:
 * 1. Purgar tarefas na lixeira com mais de `archiveDelayDays` (ex.: 90 dias).
 * 2. Expurgo físico de evidências antigas após `evidenceRetentionDays`.
 * 3. Arquivamento de execuções completas com mais de `operationalRetentionMonths` (ex.: 12 meses).
 */
export async function executeRetentionPurge(
  organizationId: string,
  now = new Date()
): Promise<PurgeResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings as Record<string, any>) || {};
  const policy: RetentionPolicy = {
    operationalRetentionMonths: settings.operationalRetentionMonths ?? 12,
    archiveDelayDays: settings.archiveDelayDays ?? 90,
    evidenceRetentionDays: settings.evidenceRetentionDays ?? 180,
  };

  let trashedTasksPurged = 0;
  let evidencesPurged = 0;
  let executionsArchived = 0;

  const trashThreshold = new Date(now.getTime() - policy.archiveDelayDays * 86400000);
  const oldTrashedTasks = await prisma.task.findMany({
    where: {
      organizationId,
      deletedAt: { lte: trashThreshold },
    },
    include: {
      evidenceRequirements: {
        include: { submissions: true },
      },
    },
    take: 100,
  });

  for (const task of oldTrashedTasks) {
    // Remover arquivos de evidência físicos
    for (const req of task.evidenceRequirements) {
      for (const sub of req.submissions) {
        if (sub.storageKey) {
          try {
            await removeEvidence(sub.storageKey);
            evidencesPurged++;
          } catch {
            // Ignora falhas de arquivo já removido
          }
        }
      }
    }

    await prisma.task.delete({ where: { id: task.id } });
    trashedTasksPurged++;
  }

  // 2. Expurgo de evidências com expurgo próprio
  const evidenceThreshold = new Date(now.getTime() - policy.evidenceRetentionDays * 86400000);
  const oldSubmissions = await prisma.evidenceSubmission.findMany({
    where: {
      storageKey: { not: null },
      createdAt: { lte: evidenceThreshold },
      requirement: {
        task: {
          organizationId,
          status: { in: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
        },
      },
    },
    take: 100,
  });

  for (const sub of oldSubmissions) {
    if (sub.storageKey) {
      try {
        await removeEvidence(sub.storageKey);
        evidencesPurged++;
      } catch {
        // Ignora
      }
      await prisma.evidenceSubmission.update({
        where: { id: sub.id },
        data: { storageKey: null, value: "[Evidência expurgada conforme política de retenção]" },
      });
    }
  }

  // 3. Auditoria do expurgo
  if (trashedTasksPurged > 0 || evidencesPurged > 0 || executionsArchived > 0) {
    await prisma.activityLog.create({
      data: {
        organizationId,
        action: "RETENTION_PURGE_EXECUTED",
        entityType: "ORGANIZATION",
        entityId: organizationId,
        metadata: {
          trashedTasksPurged,
          evidencesPurged,
          executionsArchived,
          executedAt: now.toISOString(),
        },
      },
    });
  }

  return { trashedTasksPurged, evidencesPurged, executionsArchived };
}
