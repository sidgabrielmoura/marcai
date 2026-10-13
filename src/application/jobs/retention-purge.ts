import { prisma } from "@/infrastructure/database/prisma";
import { removeEvidence } from "@/infrastructure/storage/evidence-storage";

export interface RetentionPolicy {
  operationalRetentionMonths: number; // 6 ou 12 meses (padrão: 6)
  delayRetentionDays: number;         // 30, 60 ou 90 dias (padrão: 60)
  evidenceRetentionDays: number;      // Padrão: 180 dias
}

export interface TrashPurgeResult {
  organizationsProcessed: number;
  trashedTasksPurged: number;
  archivedTemplatesPurged: number;
  evidencesPurged: number;
  notificationsPurged: number;
  failures: Array<{ organizationId: string; error: string }>;
}

export interface HistoryPurgeResult {
  organizationsProcessed: number;
  executionsPurged: number;
  tasksPurged: number;
  archivedTemplatesPurged: number;
  evidencesPurged: number;
  failures: Array<{ organizationId: string; error: string }>;
}

export interface PurgeResult {
  trashedTasksPurged: number;
  archivedTemplatesPurged: number;
  evidencesPurged: number;
  executionsArchived: number;
  notificationsPurged: number;
}

/**
 * Expurga templates de processos reutilizáveis arquivados cujo arquivamento (archivedAt)
 * seja anterior ao threshold determinado.
 * Garante integridade desvinculando com segurança de processos criados no passado.
 */
export async function purgeArchivedTemplatesForOrg(
  organizationId: string,
  threshold: Date
): Promise<number> {
  let purgedCount = 0;
  const BATCH_SIZE = 50;
  let hasMore = true;

  while (hasMore) {
    const oldTemplates = await prisma.reusableProcessTemplate.findMany({
      where: {
        organizationId,
        status: "ARCHIVED",
        OR: [
          { archivedAt: { lte: threshold } },
          {
            archivedAt: null,
            updatedAt: { lte: threshold },
          },
        ],
      },
      include: {
        versions: { select: { id: true } },
      },
      take: BATCH_SIZE,
    });

    if (oldTemplates.length === 0) {
      hasMore = false;
      break;
    }

    for (const template of oldTemplates) {
      const versionIds = template.versions.map((v) => v.id);

      // Desvincular com segurança os processos que mantinham referência a essas versões
      // (os processos continuam funcionando normalmente com seu templateOriginSnapshot)
      if (versionIds.length > 0) {
        await prisma.process.updateMany({
          where: {
            originReusableTemplateVersionId: { in: versionIds },
          },
          data: {
            originReusableTemplateVersionId: null,
          },
        });
      }

      // Remover referência circular do publishedVersionId antes de deletar
      if (template.publishedVersionId) {
        await prisma.reusableProcessTemplate.update({
          where: { id: template.id },
          data: { publishedVersionId: null },
        });
      }

      // Deletar o template (as versões são deletadas via cascade onDelete)
      await prisma.reusableProcessTemplate.delete({
        where: { id: template.id },
      });

      purgedCount++;
    }

    if (oldTemplates.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return purgedCount;
}

/**
 * Expurgo da Lixeira, Templates Arquivados e Histórico de Alertas (Executado mensalmente).
 * Remove:
 * 1. Tarefas que estão na lixeira (deletedAt != null) há mais tempo que `delayRetentionDays` (30, 60 ou 90 dias).
 * 2. Templates de processo arquivados há mais tempo que `delayRetentionDays`.
 * 3. Arquivos físicos de evidência associados a essas tarefas.
 * 4. Notificações / logs temporários de alerta gerados há mais tempo que `delayRetentionDays`.
 * 5. Evidências de tarefas concluídas/canceladas anteriores a `evidenceRetentionDays`.
 */
export async function purgeTrashedTasks(
  targetOrgId?: string,
  now = new Date()
): Promise<TrashPurgeResult> {
  const orgs = targetOrgId
    ? await prisma.organization.findMany({
        where: { id: targetOrgId },
        select: { id: true, settings: true },
      })
    : await prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, settings: true },
      });

  let trashedTasksPurged = 0;
  let archivedTemplatesPurged = 0;
  let evidencesPurged = 0;
  let notificationsPurged = 0;
  const failures: Array<{ organizationId: string; error: string }> = [];

  for (const org of orgs) {
    try {
      const settings = (org.settings as Record<string, any>) || {};
      const configuredDays = Number(settings.delayRetentionDays ?? settings.archiveDelayDays ?? 60);
      const days = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 60;
      const trashThreshold = new Date(now.getTime() - days * 86_400_000);

      let orgTasksCount = 0;
      let orgEvidencesCount = 0;
      let hasMore = true;
      const BATCH_SIZE = 100;

      // 1. Purgar tarefas da lixeira
      while (hasMore) {
        const batch = await prisma.task.findMany({
          where: {
            organizationId: org.id,
            deletedAt: { lte: trashThreshold },
          },
          include: {
            evidenceRequirements: {
              include: { submissions: true },
            },
          },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const task of batch) {
          // Remover arquivos de evidência físicos
          for (const req of task.evidenceRequirements) {
            for (const sub of req.submissions) {
              if (sub.storageKey) {
                try {
                  await removeEvidence(sub.storageKey);
                  orgEvidencesCount++;
                } catch {
                  // Ignora falhas de arquivo inexistente
                }
              }
            }
          }

          // Limpar dependências para integridade relacional
          await prisma.taskDependency.deleteMany({
            where: {
              OR: [
                { taskId: task.id },
                { dependsOnId: task.id },
              ],
            },
          });

          await prisma.task.delete({ where: { id: task.id } });
          orgTasksCount++;
        }

        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      // 2. Purgar templates arquivados anteriores ao threshold da lixeira
      const orgTemplatesCount = await purgeArchivedTemplatesForOrg(org.id, trashThreshold);

      // 3. Purgar notificações e alertas temporários anteriores ao threshold da lixeira
      const deletedNotifs = await prisma.notification.deleteMany({
        where: {
          organizationId: org.id,
          createdAt: { lte: trashThreshold },
        },
      });
      const orgNotifsCount = deletedNotifs.count;

      // 4. Expurgo de evidências com retenção própria após evidenceRetentionDays
      const evidenceDays = Number(settings.evidenceRetentionDays ?? 180);
      const evidenceThreshold = new Date(
        now.getTime() - (Number.isFinite(evidenceDays) ? evidenceDays : 180) * 86_400_000
      );
      const oldSubmissions = await prisma.evidenceSubmission.findMany({
        where: {
          storageKey: { not: null },
          createdAt: { lte: evidenceThreshold },
          requirement: {
            task: {
              organizationId: org.id,
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
            orgEvidencesCount++;
          } catch {
            // Ignora
          }
          await prisma.evidenceSubmission.update({
            where: { id: sub.id },
            data: {
              storageKey: null,
              value: "[Evidência expurgada conforme política de retenção]",
            },
          });
        }
      }

      trashedTasksPurged += orgTasksCount;
      archivedTemplatesPurged += orgTemplatesCount;
      evidencesPurged += orgEvidencesCount;
      notificationsPurged += orgNotifsCount;

      if (orgTasksCount > 0 || orgTemplatesCount > 0 || orgEvidencesCount > 0 || orgNotifsCount > 0) {
        await prisma.activityLog.create({
          data: {
            organizationId: org.id,
            action: "TRASH_PURGE_EXECUTED",
            entityType: "ORGANIZATION",
            entityId: org.id,
            metadata: {
              delayRetentionDays: days,
              trashedTasksPurged: orgTasksCount,
              archivedTemplatesPurged: orgTemplatesCount,
              evidencesPurged: orgEvidencesCount,
              notificationsPurged: orgNotifsCount,
              executedAt: now.toISOString(),
            },
          },
        });
      }
    } catch (err) {
      failures.push({
        organizationId: org.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    organizationsProcessed: orgs.length,
    trashedTasksPurged,
    archivedTemplatesPurged,
    evidencesPurged,
    notificationsPurged,
    failures,
  };
}

/**
 * Expurgo de Histórico de Execuções, Tarefas e Templates Arquivados (Executado de 6 em 6 meses).
 * Remove:
 * 1. ProcessExecution concluídas ou canceladas com mais de `operationalRetentionMonths` (6 ou 12 meses).
 * 2. Todas as tarefas pertencentes a essas execuções e seus arquivos físicos de evidência.
 * 3. Tarefas avulsas (AD_HOC sem executionId) concluídas/canceladas anteriores a esse período.
 * 4. Templates arquivados anteriores a esse período (caso não purgados pela lixeira).
 */
export async function purgeOperationalHistory(
  targetOrgId?: string,
  now = new Date()
): Promise<HistoryPurgeResult> {
  const orgs = targetOrgId
    ? await prisma.organization.findMany({
        where: { id: targetOrgId },
        select: { id: true, settings: true },
      })
    : await prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, settings: true },
      });

  let executionsPurged = 0;
  let tasksPurged = 0;
  let archivedTemplatesPurged = 0;
  let evidencesPurged = 0;
  const failures: Array<{ organizationId: string; error: string }> = [];

  for (const org of orgs) {
    try {
      const settings = (org.settings as Record<string, any>) || {};
      const configuredMonths = Number(settings.operationalRetentionMonths ?? 6);
      const months = Number.isFinite(configuredMonths) && configuredMonths > 0 ? configuredMonths : 6;

      const historyThreshold = new Date(now);
      historyThreshold.setMonth(historyThreshold.getMonth() - months);

      let orgExecsCount = 0;
      let orgTasksCount = 0;
      let orgEvidencesCount = 0;

      // 1. Purgar execuções de processos finalizadas ou canceladas
      let hasMoreExecs = true;
      const EXEC_BATCH = 50;

      while (hasMoreExecs) {
        const oldExecutions = await prisma.processExecution.findMany({
          where: {
            organizationId: org.id,
            status: { in: ["COMPLETED", "CANCELLED"] },
            OR: [
              { completedAt: { lte: historyThreshold } },
              { cancelledAt: { lte: historyThreshold } },
              {
                completedAt: null,
                cancelledAt: null,
                updatedAt: { lte: historyThreshold },
              },
            ],
          },
          include: {
            tasks: {
              include: {
                evidenceRequirements: {
                  include: { submissions: true },
                },
              },
            },
          },
          take: EXEC_BATCH,
        });

        if (oldExecutions.length === 0) {
          hasMoreExecs = false;
          break;
        }

        for (const exec of oldExecutions) {
          // Remover tarefas filhas e arquivos de evidência
          for (const task of exec.tasks) {
            for (const req of task.evidenceRequirements) {
              for (const sub of req.submissions) {
                if (sub.storageKey) {
                  try {
                    await removeEvidence(sub.storageKey);
                    orgEvidencesCount++;
                  } catch {
                    // Ignora
                  }
                }
              }
            }

            // Limpar dependências da tarefa
            await prisma.taskDependency.deleteMany({
              where: {
                OR: [
                  { taskId: task.id },
                  { dependsOnId: task.id },
                ],
              },
            });

            await prisma.task.delete({ where: { id: task.id } });
            orgTasksCount++;
          }

          // Excluir a execução do processo
          await prisma.processExecution.delete({ where: { id: exec.id } });
          orgExecsCount++;
        }

        if (oldExecutions.length < EXEC_BATCH) {
          hasMoreExecs = false;
        }
      }

      // 2. Purgar tarefas avulsas (AD_HOC sem executionId) concluídas/canceladas antigas
      let hasMoreAdHoc = true;
      const AD_HOC_BATCH = 100;

      while (hasMoreAdHoc) {
        const oldAdHocTasks = await prisma.task.findMany({
          where: {
            organizationId: org.id,
            executionId: null,
            status: { in: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] },
            deletedAt: null, // Tarefas deletadas são tratadas pelo expurgo da lixeira
            OR: [
              { completedAt: { lte: historyThreshold } },
              { cancelledAt: { lte: historyThreshold } },
              {
                completedAt: null,
                cancelledAt: null,
                updatedAt: { lte: historyThreshold },
              },
            ],
          },
          include: {
            evidenceRequirements: {
              include: { submissions: true },
            },
          },
          take: AD_HOC_BATCH,
        });

        if (oldAdHocTasks.length === 0) {
          hasMoreAdHoc = false;
          break;
        }

        for (const task of oldAdHocTasks) {
          for (const req of task.evidenceRequirements) {
            for (const sub of req.submissions) {
              if (sub.storageKey) {
                try {
                  await removeEvidence(sub.storageKey);
                  orgEvidencesCount++;
                } catch {
                  // Ignora
                }
              }
            }
          }

          await prisma.taskDependency.deleteMany({
            where: {
              OR: [
                { taskId: task.id },
                { dependsOnId: task.id },
              ],
            },
          });

          await prisma.task.delete({ where: { id: task.id } });
          orgTasksCount++;
        }

        if (oldAdHocTasks.length < AD_HOC_BATCH) {
          hasMoreAdHoc = false;
        }
      }

      // 3. Purgar templates arquivados antigos (garantia de retenção máxima de histórico)
      const orgTemplatesCount = await purgeArchivedTemplatesForOrg(org.id, historyThreshold);

      executionsPurged += orgExecsCount;
      tasksPurged += orgTasksCount;
      archivedTemplatesPurged += orgTemplatesCount;
      evidencesPurged += orgEvidencesCount;

      if (orgExecsCount > 0 || orgTasksCount > 0 || orgTemplatesCount > 0 || orgEvidencesCount > 0) {
        await prisma.activityLog.create({
          data: {
            organizationId: org.id,
            action: "HISTORY_PURGE_EXECUTED",
            entityType: "ORGANIZATION",
            entityId: org.id,
            metadata: {
              operationalRetentionMonths: months,
              executionsPurged: orgExecsCount,
              tasksPurged: orgTasksCount,
              archivedTemplatesPurged: orgTemplatesCount,
              evidencesPurged: orgEvidencesCount,
              executedAt: now.toISOString(),
            },
          },
        });
      }
    } catch (err) {
      failures.push({
        organizationId: org.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    organizationsProcessed: orgs.length,
    executionsPurged,
    tasksPurged,
    archivedTemplatesPurged,
    evidencesPurged,
    failures,
  };
}

/**
 * Serviço unificado de Retenção e Expurgo Operacional.
 * Acionado manualmente pelo painel de Configurações para executar tanto a lixeira quanto o histórico.
 */
export async function executeRetentionPurge(
  organizationId: string,
  now = new Date()
): Promise<PurgeResult> {
  const trashResult = await purgeTrashedTasks(organizationId, now);
  const historyResult = await purgeOperationalHistory(organizationId, now);

  const result: PurgeResult = {
    trashedTasksPurged: trashResult.trashedTasksPurged,
    archivedTemplatesPurged: trashResult.archivedTemplatesPurged + historyResult.archivedTemplatesPurged,
    evidencesPurged: trashResult.evidencesPurged + historyResult.evidencesPurged,
    executionsArchived: historyResult.executionsPurged,
    notificationsPurged: trashResult.notificationsPurged,
  };

  return result;
}
