import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import { listTasks, execution } from "../src/application/mobile/data";
import type { AuthenticatedContext } from "../src/application/security/auth-context";

async function main() {
  console.log("=== VERIFICANDO ISOLAMENTO DE PROCESSOS ARQUIVADOS ===");

  // 1. Localizar barbearia-sg e um membro EMPLOYEE
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: "barbearia-sg" },
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

  const employee = org.members[0];
  if (!employee) {
    throw new Error("Nenhum funcionário ativo encontrado na barbearia-sg!");
  }

  const employeeContext: AuthenticatedContext = {
    userId: employee.userId,
    userName: employee.user.name,
    userEmail: employee.user.email,
    memberId: employee.id,
    role: "EMPLOYEE",
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    scope: {
      teamIds: employee.teamMemberships.map((m) => m.teamId),
      locationIds: employee.locationAccesses.map((l) => l.locationId),
    },
  };

  console.log(`Contexto do funcionário: ${employeeContext.userName} (${employeeContext.memberId})`);
  console.log(`Equipes: ${employeeContext.scope?.teamIds.join(", ")}`);
  console.log(`Unidades: ${employeeContext.scope?.locationIds.join(", ")}`);

  // 2. Chamar listTasks como o funcionário
  const now = new Date();
  const tasksResult = await listTasks(employeeContext, null, "", "all", now);

  console.log(`Total de tarefas retornadas para o funcionário: ${tasksResult.items.length}`);
  console.log(`Contagens do quadro:`, tasksResult.counts);

  // Verificar se alguma tarefa retornada pertence ao processo arquivado
  const archivedTask = tasksResult.items.find(
    (t) => t.processName === "Abertura de loja" || t.title.toLowerCase().includes("limpar") || t.title.toLowerCase().includes("abrir"),
  );

  if (archivedTask) {
    console.error("FALHA: Tarefa de processo arquivado ainda visível!", archivedTask);
    process.exit(1);
  } else {
    console.log("✔ SUCESSO: Nenhuma tarefa de processo arquivado retornada na lista do funcionário.");
  }

  // 3. Tentar acessar a execução arquivada diretamente
  const archivedExecution = await prisma.processExecution.findFirst({
    where: {
      organizationId: org.id,
      process: { name: "Abertura de loja" },
    },
  });

  if (archivedExecution) {
    console.log(`Testando acesso direto à execução arquivada: ${archivedExecution.id}`);
    let directAccessBlocked = false;
    try {
      await execution(employeeContext, archivedExecution.id);
    } catch (err: any) {
      directAccessBlocked = true;
      console.log(`✔ SUCESSO: Acesso direto bloqueado com erro esperado: ${err.message || err.code}`);
    }

    if (!directAccessBlocked) {
      console.error("FALHA: Acesso direto à execução arquivada deveria ter sido rejeitado!");
      process.exit(1);
    }
  }

  // 4. Testar o ciclo de vida: criar processo de teste -> arquivar -> verificar limpeza
  console.log("=== TESTANDO TRANSIÇÃO COMPLETA DE ARQUIVAMENTO ===");
  const testProcess = await prisma.process.create({
    data: {
      organizationId: org.id,
      name: "Processo Teste Arquivamento",
      description: "Teste temporário de ciclo de vida de arquivamento",
      status: "ACTIVE",
    },
  });

  const testRoutine = await prisma.routine.create({
    data: {
      processId: testProcess.id,
      recurrenceRule: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0",
      startsAt: now,
      status: "ACTIVE",
    },
  });

  const testExecution = await prisma.processExecution.create({
    data: {
      organizationId: org.id,
      processId: testProcess.id,
      routineId: testRoutine.id,
      status: "IN_PROGRESS",
      scheduledAt: now,
      availableAt: now,
      startedAt: now,
    },
  });

  const testTask = await prisma.task.create({
    data: {
      organizationId: org.id,
      processId: testProcess.id,
      executionId: testExecution.id,
      origin: "PROCESS",
      title: "Tarefa de Teste Arquivamento",
      status: "IN_PROGRESS",
      teamId: employeeContext.scope?.teamIds[0] ?? null,
      locationId: employeeContext.scope?.locationIds[0] ?? null,
    },
  });

  // Atribuir ao funcionário para garantir que estaria visível
  await prisma.taskAssignment.create({
    data: {
      taskId: testTask.id,
      memberId: employee.id,
      type: "PRIMARY",
    },
  });

  // Verificar que está visível antes de arquivar
  const beforeArchive = await listTasks(employeeContext, null, "", "all", now);
  const foundBefore = beforeArchive.items.some((t) => t.id === testTask.id);
  console.log(`Tarefa visível antes de arquivar: ${foundBefore}`);
  if (!foundBefore) {
    console.error("FALHA: Tarefa de teste deveria estar visível antes do arquivamento!");
    process.exit(1);
  }

  // Simular toggleProcessStatusAction arquivando o processo
  const adminContext = { ...employeeContext, role: "OWNER" as const };
  // Executar a transação de arquivamento exatamente como na action
  await prisma.$transaction(async (tx) => {
    await tx.process.update({
      where: { id: testProcess.id, organizationId: org.id },
      data: { status: "ARCHIVED" },
    });
    const archiveNow = new Date();
    await tx.routine.updateMany({
      where: {
        processId: testProcess.id,
        process: { organizationId: org.id },
        status: "ACTIVE",
      },
      data: { status: "PAUSED" },
    });
    await tx.processExecution.updateMany({
      where: {
        processId: testProcess.id,
        organizationId: org.id,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: archiveNow,
        cancellationReason: "Processo arquivado pela gestão",
      },
    });
    await tx.task.updateMany({
      where: {
        organizationId: org.id,
        OR: [
          { processId: testProcess.id },
          { execution: { processId: testProcess.id } },
        ],
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        deletedAt: null,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: archiveNow,
        cancellationReason: "Processo arquivado pela gestão",
      },
    });
  });

  // Verificar estados no banco
  const updatedRoutine = await prisma.routine.findUnique({ where: { id: testRoutine.id } });
  const updatedExecution = await prisma.processExecution.findUnique({ where: { id: testExecution.id } });
  const updatedTask = await prisma.task.findUnique({ where: { id: testTask.id } });

  console.log(`Status da rotina após arquivar: ${updatedRoutine?.status} (esperado: PAUSED)`);
  console.log(`Status da execução após arquivar: ${updatedExecution?.status} (esperado: CANCELLED)`);
  console.log(`Status da tarefa após arquivar: ${updatedTask?.status} (esperado: CANCELLED)`);

  if (updatedRoutine?.status !== "PAUSED" || updatedExecution?.status !== "CANCELLED" || updatedTask?.status !== "CANCELLED") {
    console.error("FALHA: Transição de estado de arquivamento incorreta!");
    process.exit(1);
  }

  // Verificar que não aparece mais no listTasks do funcionário
  const afterArchive = await listTasks(employeeContext, null, "", "all", now);
  const foundAfter = afterArchive.items.some((t) => t.id === testTask.id);
  console.log(`Tarefa visível após arquivar: ${foundAfter} (esperado: false)`);

  if (foundAfter) {
    console.error("FALHA: Tarefa ainda visível após o arquivamento do processo!");
    process.exit(1);
  }

  console.log("✔ SUCESSO: Tarefa desapareceu imediatamente do quadro do colaborador!");

  // Limpeza dos dados de teste
  await prisma.taskAssignment.deleteMany({ where: { taskId: testTask.id } });
  await prisma.task.delete({ where: { id: testTask.id } });
  await prisma.processExecution.delete({ where: { id: testExecution.id } });
  await prisma.routine.delete({ where: { id: testRoutine.id } });
  await prisma.process.delete({ where: { id: testProcess.id } });

  console.log("✔ Dados temporários de teste limpos com sucesso.");
  console.log("=== TODOS OS TESTES DE ARQUIVAMENTO PASSARAM COM SUCESSO! ===");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
