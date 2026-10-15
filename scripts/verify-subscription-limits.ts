import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma";
import {
  createDefaultTrialSubscription,
  isSubscriptionExpired,
  assertCanCreateLocation,
  assertCanAddMember,
} from "../src/domain/rules/subscription-limits";
import { readManualSubscription } from "../src/application/superadmin/manual-subscription";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  } else {
    console.log(`✔ PASSOU: ${message}`);
  }
}

async function run() {
  console.log("=== INICIANDO TESTE END-TO-END DE LIMITES DE PLANOS E PILOTO GRATUITO ===");

  const testSlug = `test-trial-org-${Date.now()}`;
  const trialSub = createDefaultTrialSubscription();

  // 1. Criar organização com Piloto Gratuito (30 dias)
  const org = await prisma.organization.create({
    data: {
      name: "Empresa Piloto Teste",
      slug: testSlug,
      status: "ACTIVE",
      settings: {
        platformSubscription: trialSub,
      },
    },
  });

  try {
    const sub = readManualSubscription(org.settings);
    assert(sub !== null, "Assinatura do piloto foi lida corretamente dos settings");
    assert(sub?.planName === "Piloto Gratuito (30 dias)", "Nome do plano é Piloto Gratuito");
    assert(sub?.memberLimit === 5, "Limite de membros é 5");
    assert(sub?.locationLimit === 1, "Limite de unidades é 1");
    assert(isSubscriptionExpired(sub) === false, "Plano de 30 dias NÃO está expirado no momento da criação");

    // 2. Testar bloqueio de Unidades
    // Primeira unidade: deve passar
    await prisma.$transaction(async (tx) => {
      await assertCanCreateLocation(tx, org.id);
      await tx.location.create({
        data: {
          organizationId: org.id,
          name: "Unidade Piloto 1",
          status: "ACTIVE",
        },
      });
    });
    console.log("✔ PASSOU: Primeira unidade criada com sucesso dentro do limite de 1");

    // Segunda unidade: deve ser BLOQUEADA
    let locationBlocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        await assertCanCreateLocation(tx, org.id);
        await tx.location.create({
          data: {
            organizationId: org.id,
            name: "Unidade 2 (Excedente)",
            status: "ACTIVE",
          },
        });
      });
    } catch (err: any) {
      locationBlocked = true;
      assert(err.message.includes("Limite de unidades"), `Erro contém mensagem esperada: "${err.message}"`);
    }
    assert(locationBlocked, "Segunda unidade foi devidamente bloqueada pelo limite do plano");

    // 3. Testar bloqueio de Pessoas / Colaboradores (limite = 5)
    for (let i = 1; i <= 5; i++) {
      await prisma.$transaction(async (tx) => {
        await assertCanAddMember(tx, org.id);
        const user = await tx.user.create({
          data: {
            name: `Colaborador ${i}`,
            email: `colab${i}-${Date.now()}@teste.com`,
            status: "ACTIVE",
          },
        });
        await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: "EMPLOYEE",
            status: "ACTIVE",
          },
        });
      });
    }
    console.log("✔ PASSOU: 5 colaboradores adicionados com sucesso dentro da cota do Piloto");

    // 6º colaborador: deve ser BLOQUEADO
    let memberBlocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        await assertCanAddMember(tx, org.id);
      });
    } catch (err: any) {
      memberBlocked = true;
      assert(err.message.includes("Limite de colaboradores"), `Erro contém mensagem esperada: "${err.message}"`);
    }
    assert(memberBlocked, "Sexto colaborador foi devidamente bloqueado pelo limite do plano");

    // 4. Testar vencimento dos 30 dias (Plano Expirado)
    const expiredSub = {
      ...trialSub,
      startsOn: "2026-08-01",
      endsOn: "2026-08-31", // Data no passado (30 dias após início)
    };
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          platformSubscription: expiredSub,
        },
      },
    });

    assert(isSubscriptionExpired(expiredSub) === true, "Plano com data passada é considerado expirado");

    // Tentativa de adicionar unidade com plano expirado: deve ser BLOQUEADA
    let expiredLocBlocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        await assertCanCreateLocation(tx, org.id);
      });
    } catch (err: any) {
      expiredLocBlocked = true;
      assert(err.message.includes("expirou"), `Bloqueio por expiração de unidade: "${err.message}"`);
    }
    assert(expiredLocBlocked, "Criação de unidade bloqueada quando vigência está encerrada");

    // Tentativa de adicionar colaborador com plano expirado: deve ser BLOQUEADA
    let expiredMemberBlocked = false;
    try {
      await prisma.$transaction(async (tx) => {
        await assertCanAddMember(tx, org.id);
      });
    } catch (err: any) {
      expiredMemberBlocked = true;
      assert(err.message.includes("expirou"), `Bloqueio por expiração de colaborador: "${err.message}"`);
    }
    assert(expiredMemberBlocked, "Adição de colaborador bloqueada quando vigência está encerrada");

    console.log("=== TODOS OS TESTES DE LIMITES E PILOTO FORAM CONCLUÍDOS COM 100% DE SUCESSO! ===");
  } finally {
    // Limpeza da organização e dados de teste
    await prisma.organization.delete({
      where: { id: org.id },
    });
    console.log("✔ Fixtures de teste limpas com sucesso.");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro inesperado no teste:", err);
    process.exit(1);
  });
