import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import {
  TaskStatus,
  Priority,
  Criticality,
  TaskOrigin,
  EvidenceType,
  AssignmentType,
  ValidationStatus,
} from "@prisma/client";

async function seed() {
  console.log("=== INICIANDO CRIAÇÃO DE DADOS MOCKADOS DINÂMICOS PARA O KANBAN ===");

  // 1. Localizar a organização do funcionário
  const org = await prisma.organization.findFirst({
    where: { slug: "alpha-varejo" },
    include: {
      locations: true,
      teams: true,
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!org) {
    console.error("Organização alpha-varejo não encontrada.");
    process.exit(1);
  }

  const location = org.locations.find((l) => l.name.includes("Centro")) || org.locations[0];
  const team = org.teams.find((t) => t.name.includes("Manhã")) || org.teams[0];
  const lucasMember = org.members.find((m) => m.user.email === "lucas@alphavarejo.com") ||
    org.members.find((m) => m.role === "EMPLOYEE");

  if (!lucasMember || !location || !team) {
    console.error("Dados base não encontrados:", { lucasMember: !!lucasMember, location: !!location, team: !!team });
    process.exit(1);
  }

  console.log(`Organização: ${org.name}`);
  console.log(`Colaborador Alvo: ${lucasMember.user.name} (${lucasMember.id})`);
  console.log(`Unidade: ${location.name} (${location.id})`);
  console.log(`Equipe: ${team.name} (${team.id})`);

  // 2. Criar ou obter processos realistas para vincular às tarefas
  const processNames = [
    {
      name: "Rotina de Abertura e Checagem Matinal",
      description: "Procedimentos obrigatórios para abertura operacional e conferência de segurança da loja.",
      criticality: Criticality.HIGH,
    },
    {
      name: "Controle de Qualidade e Perecíveis",
      description: "Monitoramento de temperaturas, validade de alimentos e sanitização de áreas críticas.",
      criticality: Criticality.CRITICAL,
    },
    {
      name: "Reposição de Gôndolas e Estoque",
      description: "Abastecimento contínuo de prateleiras, etiquetagem e organização da área de vendas.",
      criticality: Criticality.MEDIUM,
    },
    {
      name: "Recebimento de Mercadorias e Logística",
      description: "Conferência de carga, triagem e lançamento de pedidos recebidos de fornecedores.",
      criticality: Criticality.HIGH,
    },
  ];

  const processMap = new Map<string, string>();
  for (const p of processNames) {
    let proc = await prisma.process.findFirst({
      where: { organizationId: org.id, name: p.name },
    });
    if (!proc) {
      proc = await prisma.process.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          name: p.name,
          description: p.description,
          status: "ACTIVE",
          criticality: p.criticality,
        },
      });
    }
    processMap.set(p.name, proc.id);
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Helpers relativos ao momento atual (garante compatibilidade sempre independente do dia/hora)
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000);
  const hoursAhead = (h: number) => new Date(now.getTime() + h * 3600000);
  const daysAhead = (d: number, hourOfDay = 10) => {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, hourOfDay, 0, 0, 0);
    return target;
  };

  // 3. Deletar tarefas mockadas antigas com prefixo identificável para permitir reexecução limpa
  await prisma.task.deleteMany({
    where: {
      organizationId: org.id,
      title: { startsWith: "[Demo] " },
    },
  });

  console.log("Tarefas mockadas anteriores limpas.");

  // 4. Estrutura completa de Mock Tasks
  interface MockTaskDef {
    title: string;
    description: string;
    instructions: string;
    processName: string;
    priority: Priority;
    criticality: Criticality;
    status: TaskStatus;
    scheduledDate: Date;
    deadlineAt: Date;
    slaDueAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    isUnassigned?: boolean;
    evidence?: {
      type: EvidenceType;
      label: string;
      submitted?: boolean;
      submissionValue?: string;
    };
    hasActivePause?: boolean;
    pauseNote?: string;
  }

  const mockTasks: MockTaskDef[] = [
    // ----------------------------------------------------
    // COLUNA 1: A Fazer (Hoje)
    // ----------------------------------------------------
    {
      title: "[Demo] Conferência de Estoque e Reposição dos Corredores 1 e 2",
      description: "Realizar reposição dos itens de alta rotatividade na mercearia e bebidas, garantindo alinhamento e etiquetas de preço visíveis.",
      instructions: "1. Pegar o carrinho no depósito.\n2. Conferir itens em falta na prateleira.\n3. Repor seguindo regra PEPS (Primeiro que Expira, Primeiro que Sai).\n4. Tirar foto do corredor abastecido.",
      processName: "Reposição de Gôndolas e Estoque",
      priority: Priority.HIGH,
      criticality: Criticality.MEDIUM,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(1),
      deadlineAt: hoursAhead(4),
      slaDueAt: hoursAhead(4),
      evidence: {
        type: EvidenceType.PHOTO,
        label: "Foto panorâmica do corredor abastecido e alinhado",
      },
    },
    {
      title: "[Demo] Checagem de Validade dos Perecíveis (Laticínios e Frios)",
      description: "Inspecionar lotes com vencimento nos próximos 3 dias no setor de laticínios para aplicação de etiqueta de desconto preventivo.",
      instructions: "Conferir cada lote da geladeira 02 e registrar no sistema a quantidade de itens a vencer.",
      processName: "Controle de Qualidade e Perecíveis",
      priority: Priority.CRITICAL,
      criticality: Criticality.HIGH,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(2),
      deadlineAt: hoursAhead(5),
      slaDueAt: hoursAhead(5),
      evidence: {
        type: EvidenceType.NUMBER,
        label: "Quantidade total de itens etiquetados com desconto preventivo",
      },
    },
    {
      title: "[Demo] Higienização dos Terminais de Autoatendimento (Totens)",
      description: "Limpeza das telas touchscreen dos totens com álcool isopropílico e papel toalha.",
      instructions: "Higienizar todos os 4 totens de autoatendimento na entrada da loja.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.MEDIUM,
      criticality: Criticality.LOW,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(1),
      deadlineAt: hoursAhead(6),
      slaDueAt: hoursAhead(6),
    },

    // ----------------------------------------------------
    // COLUNA 2: Em Andamento
    // ----------------------------------------------------
    {
      title: "[Demo] Inspeção Matinal dos Freezers e Câmaras Frias",
      description: "Verificação diária dos termômetros das câmaras de congelados e resfriados.",
      instructions: "Anotar as temperaturas dos displays digitais das câmaras 1, 2 e 3 e anexar comprovante.",
      processName: "Controle de Qualidade e Perecíveis",
      priority: Priority.HIGH,
      criticality: Criticality.CRITICAL,
      status: TaskStatus.IN_PROGRESS,
      scheduledDate: hoursAgo(2),
      deadlineAt: hoursAhead(3),
      slaDueAt: hoursAhead(3),
      startedAt: minutesAgo(25), // iniciada há 25 minutos
      evidence: {
        type: EvidenceType.NUMBER,
        label: "Temperatura média registrada em °C",
      },
    },
    {
      title: "[Demo] Auditoria de Preços e Etiquetas nos Caixas Rápidos",
      description: "Testar bipe de 10 produtos aleatórios nos caixas 1 a 4 para garantir convergência de preço do PDV com a prateleira.",
      instructions: "Caso haja divergência, pausar a tarefa e acionar o suporte de cadastro.",
      processName: "Controle de Qualidade e Perecíveis",
      priority: Priority.MEDIUM,
      criticality: Criticality.MEDIUM,
      status: TaskStatus.PAUSED,
      scheduledDate: hoursAgo(3),
      deadlineAt: hoursAhead(2),
      slaDueAt: hoursAhead(2),
      startedAt: minutesAgo(50), // iniciada há 50 min
      hasActivePause: true,
      pauseNote: "Aguardando ajuste de cadastro no sistema pelo supervisor de frente de caixa.",
    },

    // ----------------------------------------------------
    // COLUNA 3: Atrasadas
    // ----------------------------------------------------
    {
      title: "[Demo] Emissão e Envio do Relatório de Quebras do Turno Anterior",
      description: "Relatório de perdas, avarias e itens violados no recebimento do dia anterior.",
      instructions: "Preencher a planilha de descarte e enviar para a gerência de operações.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.CRITICAL,
      criticality: Criticality.HIGH,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(5),
      deadlineAt: minutesAgo(45), // Estourou há 45 minutos!
      slaDueAt: minutesAgo(45),
      evidence: {
        type: EvidenceType.TEXT,
        label: "Resumo das ocorrências e justificativa de quebras",
      },
    },
    {
      title: "[Demo] Conferência do Lacre dos Malotes do Fechamento Noturno",
      description: "Checagem do número dos lacres dos 3 malotes recebidos do turno da noite antes do envio ao cofre.",
      instructions: "Validar números de série dos lacres plásticos com a folha de remessa.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.HIGH,
      criticality: Criticality.CRITICAL,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(6),
      deadlineAt: hoursAgo(1), // Estourou há 1 hora!
      slaDueAt: hoursAgo(1),
    },

    // ----------------------------------------------------
    // COLUNA 4: Para Assumir (Unassigned)
    // ----------------------------------------------------
    {
      title: "[Demo] Recebimento e Descarregamento do Caminhão da Distribuidora",
      description: "Caminhão com 4 pallets de bebidas encostado na doca 2. Necessário conferir nota fiscal e guiar descarregamento.",
      instructions: "1. Conferir se a carga corresponde à Danfe.\n2. Inspecionar avarias de latas/garrafas.\n3. Assinar canhoto e fotografar.",
      processName: "Recebimento de Mercadorias e Logística",
      priority: Priority.HIGH,
      criticality: Criticality.HIGH,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(1),
      deadlineAt: hoursAhead(5),
      slaDueAt: hoursAhead(5),
      isUnassigned: true,
      evidence: {
        type: EvidenceType.PHOTO,
        label: "Foto do canhoto da NF assinado e carimbado",
      },
    },
    {
      title: "[Demo] Organização e Descarte Seletivo de Papelão na Área de Descarte",
      description: "Prensagem de caixas de papelão acumuladas na doca e liberação de espaço do corredor de carga.",
      instructions: "Operar a prensa hidráulica com EPIs obrigatórios (óculos e luvas).",
      processName: "Reposição de Gôndolas e Estoque",
      priority: Priority.LOW,
      criticality: Criticality.LOW,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(1),
      deadlineAt: hoursAhead(6),
      slaDueAt: hoursAhead(6),
      isUnassigned: true,
    },
    {
      title: "[Demo] Reforço no Empacotamento dos Caixas 5 e 6 no Horário de Pico",
      description: "Apoio aos operadores de caixa para agilizar atendimento das filas no final da tarde.",
      instructions: "Posicionar-se nos caixas de maior fluxo e auxiliar os clientes com sacolas ecológicas.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.MEDIUM,
      criticality: Criticality.MEDIUM,
      status: TaskStatus.AVAILABLE,
      scheduledDate: hoursAgo(2),
      deadlineAt: hoursAhead(4),
      slaDueAt: hoursAhead(4),
      isUnassigned: true,
    },

    // ----------------------------------------------------
    // COLUNA 5: Concluídas Hoje (completedAt >= startOfToday)
    // ----------------------------------------------------
    {
      title: "[Demo] Desarmar Alarme e Ligar Iluminação Geral da Loja",
      description: "Entrada na unidade, desativação da central de segurança Verisure e acionamento dos disjuntores da área de vendas.",
      instructions: "Desativar central no teclado mestre e verificar se não houve disparo falso.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.CRITICAL,
      criticality: Criticality.CRITICAL,
      status: TaskStatus.COMPLETED,
      scheduledDate: hoursAgo(4),
      deadlineAt: hoursAgo(3),
      slaDueAt: hoursAgo(3),
      startedAt: hoursAgo(3.5),
      completedAt: hoursAgo(3.2), // Concluída hoje no prazo!
      evidence: {
        type: EvidenceType.PHOTO,
        label: "Foto do painel de segurança desativado",
        submitted: true,
        submissionValue: "painel-desarmado-ok.jpg",
      },
    },
    {
      title: "[Demo] Abertura dos Terminais de PDV e Fundo de Troco",
      description: "Conferência das gavetas de dinheiro dos caixas 1 a 4 com cédulas e moedas iniciais.",
      instructions: "Contar o troco inicial de R$ 350,00 por terminal e liberar login do operador.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.HIGH,
      criticality: Criticality.HIGH,
      status: TaskStatus.COMPLETED,
      scheduledDate: hoursAgo(3),
      deadlineAt: hoursAgo(2),
      slaDueAt: hoursAgo(2),
      startedAt: hoursAgo(2.8),
      completedAt: hoursAgo(2.3), // Concluída hoje no prazo!
      evidence: {
        type: EvidenceType.NUMBER,
        label: "Valor conferido do fundo de troco",
        submitted: true,
        submissionValue: "350",
      },
    },
    {
      title: "[Demo] Verificação dos Extintores e Saídas de Emergência",
      description: "Inspeção visual dos manômetros dos extintores de água e pó químico, e desobstrução das portas corta-fogo.",
      instructions: "Garantir que nenhuma caixa ou pallet esteja bloqueando os extintores.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.MEDIUM,
      criticality: Criticality.MEDIUM,
      status: TaskStatus.COMPLETED,
      scheduledDate: hoursAgo(2),
      deadlineAt: hoursAgo(1),
      slaDueAt: hoursAgo(1),
      startedAt: hoursAgo(1.8),
      completedAt: hoursAgo(1.3), // Concluída hoje no prazo!
    },

    // ----------------------------------------------------
    // COLUNA 6: Próximos Dias (scheduledDate / deadlineAt > todayEnd)
    // ----------------------------------------------------
    {
      title: "[Demo] Inventário Semanal de Bebidas de Alto Valor e Destilados",
      description: "Contagem cega de garrafas trancadas na adega e armários de segurança.",
      instructions: "Anotar o número de série e lacre das bebidas importadas.",
      processName: "Reposição de Gôndolas e Estoque",
      priority: Priority.HIGH,
      criticality: Criticality.HIGH,
      status: TaskStatus.AVAILABLE,
      scheduledDate: daysAhead(1, 8),
      deadlineAt: daysAhead(1, 12),
      slaDueAt: daysAhead(1, 12),
    },
    {
      title: "[Demo] Manutenção Preventiva dos Filtros de Ar-Condicionado",
      description: "Aspiração e lavagem dos filtros laváveis dos aparelhos de climatização do salão de vendas.",
      instructions: "Remover a tela frontal, lavar com sabão neutro e secar antes do religamento.",
      processName: "Rotina de Abertura e Checagem Matinal",
      priority: Priority.MEDIUM,
      criticality: Criticality.MEDIUM,
      status: TaskStatus.AVAILABLE,
      scheduledDate: daysAhead(2, 9),
      deadlineAt: daysAhead(2, 14),
      slaDueAt: daysAhead(2, 14),
    },
    {
      title: "[Demo] Troca Geral de Cartazes e Banners Promocionais da Próxima Semana",
      description: "Substituir os móbiles de ofertas do teto e faixas de gôndola para o encarte de ofertas da semana.",
      instructions: "Instalar os móbiles nas ilhas centrais com gancho telescópico.",
      processName: "Reposição de Gôndolas e Estoque",
      priority: Priority.LOW,
      criticality: Criticality.LOW,
      status: TaskStatus.AVAILABLE,
      scheduledDate: daysAhead(3, 8),
      deadlineAt: daysAhead(3, 13),
      slaDueAt: daysAhead(3, 13),
    },
  ];

  console.log(`Inserindo ${mockTasks.length} tarefas mockadas...`);

  for (const t of mockTasks) {
    const processId = processMap.get(t.processName) || undefined;

    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        teamId: team.id,
        processId,
        origin: TaskOrigin.PROCESS,
        title: t.title,
        description: t.description,
        instructions: t.instructions,
        status: t.status,
        priority: t.priority,
        criticality: t.criticality,
        required: true,
        scheduledDate: t.scheduledDate,
        deadlineAt: t.deadlineAt,
        slaDueAt: t.slaDueAt,
        slaStartEvent: "ON_AVAILABLE",
        slaDurationMinutes: 120,
        estimatedDuration: 30,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        actualDuration: t.completedAt && t.startedAt ? Math.round((t.completedAt.getTime() - t.startedAt.getTime()) / 60000) : undefined,
      },
    });

    // Atribuição de responsável (se não for unassigned)
    if (!t.isUnassigned) {
      await prisma.taskAssignment.create({
        data: {
          taskId: task.id,
          memberId: lucasMember.id,
          type: AssignmentType.PRIMARY,
        },
      });
    }

    // Sessão de trabalho (se iniciada ou concluída)
    if (t.startedAt) {
      const session = await prisma.taskExecutionSession.create({
        data: {
          taskId: task.id,
          memberId: lucasMember.id,
          startedAt: t.startedAt,
          endedAt: t.completedAt,
        },
      });

      // Pausa ativa se especificado
      if (t.hasActivePause) {
        await prisma.taskPause.create({
          data: {
            sessionId: session.id,
            note: t.pauseNote || "Pausa operacional",
            startedAt: minutesAgo(15),
          },
        });
      }
    }

    // Requisito de evidência
    if (t.evidence) {
      const req = await prisma.taskEvidenceRequirement.create({
        data: {
          taskId: task.id,
          type: t.evidence.type,
          required: true,
          minQuantity: 1,
          maxQuantity: 1,
          validationConfig: { label: t.evidence.label },
        },
      });

      if (t.evidence.submitted) {
        await prisma.evidenceSubmission.create({
          data: {
            requirementId: req.id,
            submittedBy: lucasMember.id,
            value: t.evidence.submissionValue || "OK",
            validationStatus: ValidationStatus.VALID,
          },
        });
      }
    }
  }

  console.log(`\n🎉 SUCESSO! ${mockTasks.length} tarefas mockadas criadas dinamicamente com sucesso.`);
  console.log("Todas as 6 colunas do Kanban agora possuem cards realistas e interativos!");
}

seed()
  .catch((err) => {
    console.error("Erro ao gerar dados mockados:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
