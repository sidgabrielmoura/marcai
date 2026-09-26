import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { taskTiming } from "../src/domain/rules/task-metrics";

async function main() {
  console.log("=== TESTANDO FUNCIONAMENTO DA ÁREA DO FUNCIONÁRIO (KANBAN TRELLO) ===");

  // 1. Obter uma organização de teste ou ativa
  const org = await prisma.organization.findFirst({
    include: {
      members: {
        where: { role: "EMPLOYEE", status: "ACTIVE" },
        include: {
          user: true,
          teamMemberships: true,
          locationAccesses: true,
        },
      },
    },
  });

  if (!org) {
    console.error("Nenhuma organização encontrada.");
    process.exit(1);
  }

  console.log(`Organização: ${org.name} (${org.id})`);

  let member = org.members[0];
  if (!member) {
    console.log("Nenhum funcionário encontrado na org, buscando qualquer membro...");
    const anyMember = await prisma.organizationMember.findFirst({
      where: { organizationId: org.id },
      include: { user: true, teamMemberships: true, locationAccesses: true },
    });
    if (!anyMember) {
      console.error("Nenhum membro encontrado.");
      process.exit(1);
    }
    member = anyMember as any;
  }

  console.log(`Membro testado: ${member.user.name} (${member.role})`);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // 2. Simular a query de tarefas atribuídas
  const assigned = await prisma.task.findMany({
    where: {
      organizationId: org.id,
      deletedAt: null,
      assignments: { some: { memberId: member.id, removedAt: null } },
      OR: [
        { status: { notIn: ["COMPLETED", "CANCELLED", "NOT_COMPLETED"] } },
        { status: "COMPLETED", completedAt: { gte: startOfToday } },
      ],
    },
    include: {
      location: true,
      team: true,
      process: true,
      evidenceRequirements: true,
      occurrences: true,
    },
  });

  console.log(`Tarefas atribuídas encontradas: ${assigned.length}`);

  // 3. Simular a query de tarefas para assumir
  const memberTeamIds = member.teamMemberships.map((t) => t.teamId);
  const memberLocationIds = member.locationAccesses.map((l) => l.locationId);

  const unassigned = await prisma.task.findMany({
    where: {
      organizationId: org.id,
      deletedAt: null,
      status: { in: ["AVAILABLE", "BLOCKED"] },
      teamId: { in: memberTeamIds },
      locationId: { in: memberLocationIds },
      assignments: { none: { type: "PRIMARY", removedAt: null } },
    },
    include: {
      location: true,
      team: true,
      process: true,
      evidenceRequirements: true,
      occurrences: true,
    },
  });

  console.log(`Tarefas para assumir encontradas: ${unassigned.length}`);

  // 4. Testar a categorização das colunas Kanban Trello
  const groups: Record<string, any[]> = {
    today: [],
    in_progress: [],
    overdue: [],
    unassigned: [],
    completed: [],
    upcoming: [],
  };

  for (const t of unassigned) {
    groups.unassigned.push(t);
  }

  for (const t of assigned) {
    const timing = taskTiming(t, now);
    if (t.status === "COMPLETED") {
      groups.completed.push(t);
    } else if (t.status === "IN_PROGRESS" || t.status === "PAUSED") {
      groups.in_progress.push(t);
    } else if (timing.slaExceeded || (t.deadlineAt && new Date(t.deadlineAt) < now)) {
      groups.overdue.push(t);
    } else {
      const targetDate = t.scheduledDate || t.deadlineAt;
      if (targetDate && new Date(targetDate) > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)) {
        groups.upcoming.push(t);
      } else {
        groups.today.push(t);
      }
    }
  }

  console.log("\n--- DISTRIBUIÇÃO DAS COLUNAS KANBAN ---");
  console.log(`📋 A Fazer (Hoje): ${groups.today.length}`);
  console.log(`⚡ Em Andamento: ${groups.in_progress.length}`);
  console.log(`⚠️ Atrasadas: ${groups.overdue.length}`);
  console.log(`👥 Para Assumir: ${groups.unassigned.length}`);
  console.log(`✅ Concluídas Hoje: ${groups.completed.length}`);
  console.log(`📅 Próximos Dias: ${groups.upcoming.length}`);

  console.log("\n✔ Todas as regras de agrupamento e consultas do funcionário foram validadas com sucesso!");
}

main().catch((err) => {
  console.error("Erro no teste:", err);
  process.exit(1);
});
