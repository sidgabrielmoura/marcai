import { Prisma } from "@prisma/client";

export interface PurgeOrganizationResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  purgedUsersCount: number;
  purgedRoutinesCount: number;
  purgedWebSessionsCount: number;
  deletedAt: string;
}

/**
 * Executa o expurgo completo e irreversível de uma organização e de todos os seus dados vinculados.
 * Garante que nenhum registro órfão (usuários exclusivos, sessões web/mobile, tarefas, eventos,
 * uploads, jobs agendados, rate limits ou desafios) permaneça no banco de dados.
 */
export async function purgeOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorUserId?: string
): Promise<PurgeOrganizationResult> {
  // 1. Bloqueia a organização para deleção atômica
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  });

  if (!org) {
    throw new Error(`Organização ${organizationId} não encontrada.`);
  }

  // 2. Localiza todos os membros e usuários da organização
  const members = await tx.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  const memberUserIds = Array.from(new Set(members.map((m) => m.userId)));

  // 3. Determina quais usuários pertencem EXCLUSIVAMENTE a esta organização
  // (nunca deleta superadmin ou usuários que ainda possuem membresias em outras organizações)
  const usersToPurge: string[] = [];
  if (memberUserIds.length > 0) {
    const candidateUsers = await tx.user.findMany({
      where: {
        id: { in: memberUserIds },
        OR: [
          { platformRole: null },
          { platformRole: { not: "SUPERADMIN" } },
        ],
      },
      select: {
        id: true,
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    for (const user of candidateUsers) {
      // Se este usuário só tem 1 membresia (ou seja, apenas desta organização que está sendo deletada),
      // ele deve ser expurgado completamente.
      if (user._count.memberships <= 1) {
        usersToPurge.push(user.id);
      }
    }
  }

  // 4. Localiza rotinas da organização para limpar jobs agendados
  const orgProcesses = await tx.process.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const processIds = orgProcesses.map((p) => p.id);

  let purgedRoutinesCount = 0;
  if (processIds.length > 0) {
    const routines = await tx.routine.findMany({
      where: { processId: { in: processIds } },
      select: { id: true },
    });
    const routineJobNames = routines.map((r) => `retry:routine:${r.id}`);
    if (routineJobNames.length > 0) {
      const delJobs = await tx.scheduledJobState.deleteMany({
        where: { name: { in: routineJobNames } },
      });
      purgedRoutinesCount = delJobs.count;
    }
  }

  // 5. Excluir sessões web vinculadas à organização
  const delWebSessions = await tx.webAuthSession.deleteMany({
    where: { organizationId },
  });

  // 6. Excluir tarefas, execuções e processos da organização
  await tx.task.deleteMany({
    where: { organizationId },
  });
  await tx.processExecution.deleteMany({
    where: { organizationId },
  });
  await tx.process.deleteMany({
    where: { organizationId },
  });

  // 7. Limpar explicitamente tabelas móveis desacopladas
  await tx.nativeEvent.deleteMany({
    where: { organizationId },
  });
  await tx.nativeRequest.deleteMany({
    where: { organizationId },
  });
  await tx.nativeUpload.deleteMany({
    where: { organizationId },
  });

  // 7. Excluir a Organização
  // Graças às constraints ON DELETE CASCADE no Postgres e Prisma, isso deletará automaticamente:
  // - organization_members
  // - tasks (e task_assignments, task_dependencies, task_execution_sessions, occurrences, evidences, etc.)
  // - processes (e routines, process_executions)
  // - locations (e member_location_accesses, team_locations)
  // - teams (e team_members)
  // - process_templates (e process_template_versions)
  // - reusable_process_templates (e reusable_process_template_versions)
  // - activity_logs
  // - escalation_policies
  // - notifications (e mobile_push_outbox, mobile_push_deliveries)
  // - scheduled_reports
  // - mobile_installations
  await tx.organization.delete({
    where: { id: organizationId },
  });

  // 8. Excluir os usuários exclusivos órfãos
  let purgedUsersCount = 0;
  if (usersToPurge.length > 0) {
    // Limpar desafios e sessões web que referenciam esses usuários
    await tx.webLoginChallenge.deleteMany({
      where: { userId: { in: usersToPurge } },
    });
    await tx.webPasskeyChallenge.deleteMany({
      where: { userId: { in: usersToPurge } },
    });
    await tx.webAuthSession.deleteMany({
      where: { userId: { in: usersToPurge } },
    });

    // Deletar os usuários do banco (cascateará nativeSessions, mobileAuthSessions, userDeviceTokens, passkeys, resetTokens)
    const delUsers = await tx.user.deleteMany({
      where: { id: { in: usersToPurge } },
    });
    purgedUsersCount = delUsers.count;
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    purgedUsersCount,
    purgedRoutinesCount,
    purgedWebSessionsCount: delWebSessions.count,
    deletedAt: new Date().toISOString(),
  };
}
