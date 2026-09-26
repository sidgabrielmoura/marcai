import "dotenv/config";
import { Role, Priority, Criticality, EvidenceType, TaskStatus, ProcessStatus, PendingPreviousPolicy, ExecutionStatus, DependencyType, DependencyLogic } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  console.log("Iniciando seed completo do banco de dados...");

  // Limpeza prévia para garantir dados idempotentes
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.taskOccurrence.deleteMany();
  await prisma.approvalDecision.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalWorkflow.deleteMany();
  await prisma.evidenceSubmission.deleteMany();
  await prisma.taskEvidenceRequirement.deleteMany();
  await prisma.taskPause.deleteMany();
  await prisma.taskExecutionSession.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.processExecution.deleteMany();
  await prisma.routineException.deleteMany();
  await prisma.routine.deleteMany();
  await prisma.process.deleteMany();
  await prisma.processTemplateVersion.deleteMany();
  await prisma.processTemplate.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.memberLocationAccess.deleteMany();
  await prisma.location.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const defaultPasswordHash = await bcrypt.hash("senha123", 10);
  const defaultPinHash = await bcrypt.hash("123456", 10);

  // 0. Usuário SUPERADMIN da Plataforma (Item 58)
  const userSuperadmin = await prisma.user.create({
    data: {
      name: "Administrador Global",
      email: "superadmin@marcai.io",
      passwordHash: defaultPasswordHash,
      platformRole: "SUPERADMIN",
      twoFactorEnabled: false, // First password login requires actual authenticator enrollment.
      status: "ACTIVE",
    },
  });

  // 1. Organização A (Alpha Varejo)
  const orgAlpha = await prisma.organization.create({
    data: {
      name: "Alpha Varejo & Operações",
      slug: "alpha-varejo",
      status: "ACTIVE",
      settings: {
        delayMilestones: [15, 30, 60, 120],
        operationalRetentionMonths: 12,
        delayRetentionDays: 90,
        earlyExecutionPolicy: "ALLOW_AND_LOG",
      },
    },
  });

  // 2. Organização B (Beta Serviços - Isolamento comprovado)
  const orgBeta = await prisma.organization.create({
    data: {
      name: "Beta Serviços Integrados",
      slug: "beta-servicos",
      status: "ACTIVE",
      settings: {
        delayMilestones: [15, 30, 60],
        operationalRetentionMonths: 12,
        delayRetentionDays: 90,
        earlyExecutionPolicy: "BLOCK",
      },
    },
  });

  // 3. Usuários Operacionais
  const userOwnerAlpha = await prisma.user.create({
    data: {
      name: "Carlos Mendes (Proprietário)",
      email: "carlos@alphavarejo.com",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
    },
  });

  const userManagerAlpha = await prisma.user.create({
    data: {
      name: "Marina Silva (Gerente Operacional)",
      email: "marina@alphavarejo.com",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
    },
  });

  const userEmployeeAlpha = await prisma.user.create({
    data: {
      name: "Lucas Ferreira (Operador)",
      email: "lucas@alphavarejo.com",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
    },
  });

  const userEmployeeAlpha2 = await prisma.user.create({
    data: {
      name: "Beatriz Ramos (Operadora)",
      email: "beatriz@alphavarejo.com",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
    },
  });

  const userOwnerBeta = await prisma.user.create({
    data: {
      name: "Bruno Souza (Proprietário Beta)",
      email: "bruno@betaservicos.com",
      passwordHash: defaultPasswordHash,
      status: "ACTIVE",
    },
  });

  // 4. Vínculos de Membros
  const memberOwnerAlpha = await prisma.organizationMember.create({
    data: {
      organizationId: orgAlpha.id,
      userId: userOwnerAlpha.id,
      role: Role.OWNER,
      status: "ACTIVE",
    },
  });

  const memberManagerAlpha = await prisma.organizationMember.create({
    data: {
      organizationId: orgAlpha.id,
      userId: userManagerAlpha.id,
      role: Role.MANAGER,
      status: "ACTIVE",
      employeeCode: "MGR-001",
      pinHash: defaultPinHash,
    },
  });

  const memberEmployeeAlpha = await prisma.organizationMember.create({
    data: {
      organizationId: orgAlpha.id,
      userId: userEmployeeAlpha.id,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      employeeCode: "EMP-001",
      pinHash: defaultPinHash,
    },
  });

  const memberEmployeeAlpha2 = await prisma.organizationMember.create({
    data: {
      organizationId: orgAlpha.id,
      userId: userEmployeeAlpha2.id,
      role: Role.EMPLOYEE,
      status: "ACTIVE",
      employeeCode: "EMP-002",
      pinHash: defaultPinHash,
    },
  });

  // Membro da Organização B (Isolamento)
  await prisma.organizationMember.create({
    data: {
      organizationId: orgBeta.id,
      userId: userOwnerBeta.id,
      role: Role.OWNER,
      status: "ACTIVE",
    },
  });

  // 5. Unidades (Locations) da Alpha Varejo
  const locCentro = await prisma.location.create({
    data: {
      organizationId: orgAlpha.id,
      name: "Loja 01 - Centro",
      address: "Av. Paulista, 1000 - São Paulo/SP",
      timezone: "America/Sao_Paulo",
      openingTime: "07:00",
      closingTime: "22:00",
      operatingDays: "MON,TUE,WED,THU,FRI,SAT",
      status: "ACTIVE",
    },
  });

  const locShopping = await prisma.location.create({
    data: {
      organizationId: orgAlpha.id,
      name: "Loja 02 - Shopping Iguatemi",
      address: "Av. Faria Lima, 2232 - São Paulo/SP",
      timezone: "America/Sao_Paulo",
      openingTime: "10:00",
      closingTime: "22:00",
      operatingDays: "MON,TUE,WED,THU,FRI,SAT,SUN",
      status: "ACTIVE",
    },
  });

  // Acesso às unidades
  await prisma.memberLocationAccess.createMany({
    data: [
      { memberId: memberOwnerAlpha.id, locationId: locCentro.id, type: "PRIMARY" },
      { memberId: memberOwnerAlpha.id, locationId: locShopping.id, type: "SECONDARY" },
      { memberId: memberManagerAlpha.id, locationId: locCentro.id, type: "PRIMARY" },
      { memberId: memberEmployeeAlpha.id, locationId: locCentro.id, type: "PRIMARY" },
      { memberId: memberEmployeeAlpha2.id, locationId: locCentro.id, type: "PRIMARY" },
    ],
  });

  // 6. Equipes
  const teamOperacao = await prisma.team.create({
    data: {
      organizationId: orgAlpha.id,
      name: "Operação Manhã",
      description: "Equipe de abertura, checagem e atendimento matinal",
      managerMemberId: memberManagerAlpha.id,
      status: "ACTIVE",
    },
  });

  const teamFechamento = await prisma.team.create({
    data: {
      organizationId: orgAlpha.id,
      name: "Operação Fechamento",
      description: "Equipe de sangria, conferência e fechamento físico",
      managerMemberId: memberManagerAlpha.id,
      status: "ACTIVE",
    },
  });

  // Membros das equipes
  await prisma.teamMember.createMany({
    data: [
      { teamId: teamOperacao.id, organizationMemberId: memberManagerAlpha.id, isPrimary: true },
      { teamId: teamOperacao.id, organizationMemberId: memberEmployeeAlpha.id, isPrimary: true },
      { teamId: teamOperacao.id, organizationMemberId: memberEmployeeAlpha2.id, isPrimary: true },
      { teamId: teamFechamento.id, organizationMemberId: memberManagerAlpha.id, isPrimary: false },
    ],
  });

  // 7. Processos e Rotinas Operacionais
  const processAbertura = await prisma.process.create({
    data: {
      organizationId: orgAlpha.id,
      locationId: locCentro.id,
      name: "Processo de Abertura de Loja",
      description: "Sequência obrigatória de abertura das portas, checagem elétrica e liberação de PDVs.",
      status: ProcessStatus.ACTIVE,
      criticality: Criticality.CRITICAL,
      createdBy: memberOwnerAlpha.id,
    },
  });

  const routineAbertura = await prisma.routine.create({
    data: {
      processId: processAbertura.id,
      recurrenceRule: "FREQ=DAILY;BYHOUR=7;BYMINUTE=0",
      timezone: "America/Sao_Paulo",
      generationLeadTime: 1440,
      startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      pendingPreviousPolicy: PendingPreviousPolicy.CREATE_NEW,
      status: "ACTIVE",
    },
  });

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
  const twoHoursAhead = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Execução de Hoje da Abertura
  const execAberturaHoje = await prisma.processExecution.create({
    data: {
      organizationId: orgAlpha.id,
      processId: processAbertura.id,
      routineId: routineAbertura.id,
      locationId: locCentro.id,
      status: ExecutionStatus.IN_PROGRESS,
      scheduledAt: twoHoursAgo,
      availableAt: twoHoursAgo,
      startedAt: twoHoursAgo,
    },
  });

  // Tarefa 1 do Processo: Abrir portas e disjuntores (COMPLETED)
  const taskDisjuntores = await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      executionId: execAberturaHoje.id,
      processId: processAbertura.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "PROCESS",
      title: "Desarmar Alarme e Ligar Disjuntores Gerais",
      description: "Entrada pela porta de serviço, desarme do painel e acionamento da iluminação principal.",
      instructions: "1. Digitar código no teclado de acesso\n2. Subir chave geral no quadro de força 01",
      status: TaskStatus.COMPLETED,
      priority: Priority.CRITICAL,
      criticality: Criticality.CRITICAL,
      required: true,
      startedAt: twoHoursAgo,
      completedAt: oneHourAgo,
      actualDuration: 1800,
      assignments: {
        create: { memberId: memberEmployeeAlpha.id, type: "PRIMARY" },
      },
    },
  });

  // Tarefa 2 do Processo: Abertura de Caixa e Checagem de Fita (AVAILABLE, depende de Tarefa 1)
  const taskAberturaCaixa = await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      executionId: execAberturaHoje.id,
      processId: processAbertura.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "PROCESS",
      title: "Abertura de Caixa e Checagem de Fita",
      description: "Conferir o fundo de troco do PDV 01 e validar fita de auditoria fiscal.",
      instructions: "1. Ligar o terminal fiscal\n2. Conferir R$ 200,00 de troco em cédulas e moedas\n3. Fotografar o painel inicial do caixa emitindo a fita de abertura",
      status: TaskStatus.AVAILABLE,
      priority: Priority.HIGH,
      criticality: Criticality.CRITICAL,
      required: true,
      deadlineAt: twoHoursAhead,
      slaDurationMinutes: 60,
      slaDueAt: twoHoursAhead,
      estimatedDuration: 15,
      assignments: {
        create: { memberId: memberEmployeeAlpha.id, type: "PRIMARY" },
      },
      evidenceRequirements: {
        create: {
          type: EvidenceType.PHOTO,
          required: true,
          minQuantity: 1,
          maxQuantity: 1,
          executionStage: "COMPLETION",
        },
      },
    },
  });

  // Dependência: Abertura de Caixa depende de Disjuntores (Resolvida pois Disjuntores está COMPLETED)
  await prisma.taskDependency.create({
    data: {
      taskId: taskAberturaCaixa.id,
      dependsOnId: taskDisjuntores.id,
      type: DependencyType.BLOCKING,
      logic: DependencyLogic.AND,
    },
  });

  // Tarefa 3 do Processo: Liberar Entrada de Clientes (BLOCKED por Abertura de Caixa)
  const taskLiberarEntrada = await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      executionId: execAberturaHoje.id,
      processId: processAbertura.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "PROCESS",
      title: "Abrir Portas Frontais e Liberar Atendimento ao Público",
      description: "Destravar portas de vidro e colocar tapete de recepção.",
      status: TaskStatus.BLOCKED,
      priority: Priority.HIGH,
      criticality: Criticality.HIGH,
      required: true,
      deadlineAt: twoHoursAhead,
      assignments: {
        create: { memberId: memberEmployeeAlpha2.id, type: "PRIMARY" },
      },
    },
  });

  // Dependência bloqueante:
  await prisma.taskDependency.create({
    data: {
      taskId: taskLiberarEntrada.id,
      dependsOnId: taskAberturaCaixa.id,
      type: DependencyType.BLOCKING,
      logic: DependencyLogic.AND,
    },
  });

  // Tarefa 4 Avulsa: Pausada
  const taskPausada = await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "AD_HOC",
      title: "Limpeza e Sanitização do Balcão de Atendimento",
      description: "Higienização com álcool 70% e reposição de sacolas",
      status: TaskStatus.PAUSED,
      priority: Priority.LOW,
      criticality: Criticality.LOW,
      required: true,
      startedAt: twoHoursAgo,
      assignments: {
        create: { memberId: memberEmployeeAlpha.id, type: "PRIMARY" },
      },
    },
  });

  const sessionPausada = await prisma.taskExecutionSession.create({
    data: {
      taskId: taskPausada.id,
      memberId: memberEmployeeAlpha.id,
      startedAt: twoHoursAgo,
    },
  });

  await prisma.taskPause.create({
    data: {
      sessionId: sessionPausada.id,
      reasonCategoryId: "SUPRIMENTOS",
      note: "Pausa para recebimento de fornecedor de embalagens",
      startedAt: oneHourAgo,
    },
  });

  // Tarefa 5 Avulsa: Atrasada com SLA excedido
  await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "AD_HOC",
      title: "Inspeção de Temperatura dos Freezers de Bebidas",
      description: "Medição com termômetro digital e registro de conformidade",
      status: TaskStatus.AVAILABLE,
      priority: Priority.CRITICAL,
      criticality: Criticality.CRITICAL,
      required: true,
      deadlineAt: oneHourAgo,
      slaDueAt: oneHourAgo,
      slaExceededAt: oneHourAgo,
      assignments: {
        create: { memberId: memberEmployeeAlpha.id, type: "PRIMARY" },
      },
    },
  });

  // Tarefa 6 Avulsa: Impedimento Operacional registrado ("Não foi possível realizar" - Item 26)
  const taskImpedimento = await prisma.task.create({
    data: {
      organizationId: orgAlpha.id,
      locationId: locCentro.id,
      teamId: teamOperacao.id,
      origin: "AD_HOC",
      title: "Troca do Filtro de Exaustão da Cozinha",
      description: "Substituição periódica do filtro de carvão ativado",
      status: TaskStatus.NOT_COMPLETED,
      priority: Priority.MEDIUM,
      criticality: Criticality.MEDIUM,
      required: false,
    },
  });

  await prisma.taskOccurrence.create({
    data: {
      taskId: taskImpedimento.id,
      type: "IMPEDIMENT",
      category: "EQUIPAMENTO_QUEBRADO",
      reason: "Escada de acesso danificada, sem condições seguras de alcance",
      severity: "HIGH",
      createdBy: memberEmployeeAlpha.id,
    },
  });

  // Notificações e Auditoria
  await prisma.notification.createMany({
    data: [
      {
        organizationId: orgAlpha.id,
        userId: userManagerAlpha.id,
        type: "SLA_BREACH",
        priority: Priority.CRITICAL,
        title: "SLA Excedido em Tarefa Crítica",
        message: "A tarefa 'Inspeção de Temperatura dos Freezers de Bebidas' excedeu o limite máximo estipulado.",
      },
      {
        organizationId: orgAlpha.id,
        userId: userManagerAlpha.id,
        type: "IMPEDIMENT_ALERT",
        priority: Priority.HIGH,
        title: "Impedimento Operacional Registrado",
        message: "A tarefa 'Troca do Filtro de Exaustão da Cozinha' foi reportada com impedimento.",
      },
    ],
  });

  await prisma.activityLog.create({
    data: {
      organizationId: orgAlpha.id,
      actorId: memberOwnerAlpha.id,
      action: "ORGANIZATION_INITIALIZED",
      entityType: "ORGANIZATION",
      entityId: orgAlpha.id,
      metadata: { note: "Carga completa de demonstração operacional MVP v1" },
    },
  });

  console.log("Seed completo executado com sucesso!");
  console.log("-----------------------------------------------------------------");
  console.log("Credenciais para teste:");
  console.log("1. Superadmin Plataforma: superadmin@marcai.io  | Senha: senha123");
  console.log("2. Proprietário Alpha:   carlos@alphavarejo.com | Senha: senha123");
  console.log("3. Gerente Alpha:        marina@alphavarejo.com | Senha: senha123");
  console.log("4. Funcionário 1 Alpha:  lucas@alphavarejo.com  | Senha: senha123");
  console.log("   PIN de Funcionário:   Org: alpha-varejo | Matrícula: EMP-001 | PIN: 123456");
  console.log("5. Funcionário 2 Alpha:  beatriz@alphavarejo.com | Senha: senha123");
  console.log("   PIN de Funcionário:   Org: alpha-varejo | Matrícula: EMP-002 | PIN: 123456");
  console.log("6. Proprietário Beta:    bruno@betaservicos.com | Senha: senha123 (Isolamento)");
  console.log("-----------------------------------------------------------------");
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
