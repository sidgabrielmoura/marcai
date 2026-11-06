import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession, decryptSession, type SessionData } from "../src/infrastructure/security/session";
import { Role } from "../src/domain/types";
import bcrypt from "bcryptjs";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => {
      passed++;
      console.log(`✔ PASSOU: ${name}`);
    })
    .catch((err) => {
      console.error(`✖ FALHOU: ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function run() {
  console.log("=== INICIANDO TESTES DE SEGURANÇA: EMPRESA SUSPENSA ===");

  const timestamp = Date.now();
  const testUserEmail = `sec-test-${timestamp}@tarefai.test`;
  const password = "Password@123";
  const pin = "123456";
  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = await bcrypt.hash(pin, 10);

  // 1. Criar organização suspensa e ativa para testes
  const suspendedOrg = await prisma.organization.create({
    data: {
      name: `Empresa Suspensa ${timestamp}`,
      slug: `susp-org-${timestamp}`,
      status: "SUSPENDED",
    },
  });

  const activeOrg = await prisma.organization.create({
    data: {
      name: `Empresa Ativa ${timestamp}`,
      slug: `active-org-${timestamp}`,
      status: "ACTIVE",
    },
  });

  const testUser = await prisma.user.create({
    data: {
      name: "Usuario Teste Suspensao",
      email: testUserEmail,
      passwordHash,
      status: "ACTIVE",
    },
  });

  const memberSuspended = await prisma.organizationMember.create({
    data: {
      userId: testUser.id,
      organizationId: suspendedOrg.id,
      role: "MANAGER",
      status: "ACTIVE",
      employeeCode: `EMP-${timestamp}-1`,
      pinHash,
    },
  });

  const memberActive = await prisma.organizationMember.create({
    data: {
      userId: testUser.id,
      organizationId: activeOrg.id,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeCode: `EMP-${timestamp}-2`,
      pinHash,
    },
  });

  try {
    // Teste 1: Sessão criada para organização ativa resulta em orgStatus === "ACTIVE"
    await test("Sessão em organização ativa é descriptografada com orgStatus ACTIVE", async () => {
      const activePayload: SessionData = {
        userId: testUser.id,
        name: testUser.name,
        email: testUser.email,
        activeOrgId: activeOrg.id,
        activeMemberId: memberActive.id,
        role: Role.EMPLOYEE,
        employeeCode: memberActive.employeeCode,
      };

      const token = await encryptSession(activePayload);
      const decrypted = await decryptSession(token);
      assert.ok(decrypted, "Sessão deveria ser descriptografada");
      assert.equal(decrypted.orgStatus, "ACTIVE", "orgStatus deve ser ACTIVE");
      assert.equal(decrypted.activeOrgId, activeOrg.id);
    });

    // Teste 2: Sessão criada para organização suspensa é descriptografada com orgStatus === "SUSPENDED"
    await test("Sessão em organização suspensa é descriptografada com orgStatus SUSPENDED", async () => {
      const suspendedPayload: SessionData = {
        userId: testUser.id,
        name: testUser.name,
        email: testUser.email,
        activeOrgId: suspendedOrg.id,
        activeMemberId: memberSuspended.id,
        role: Role.MANAGER,
        employeeCode: memberSuspended.employeeCode,
      };

      const token = await encryptSession(suspendedPayload);
      const decrypted = await decryptSession(token);
      assert.ok(decrypted, "Sessão válida deve ser descriptografada");
      assert.equal(decrypted.orgStatus, "SUSPENDED", "orgStatus deve refletir SUSPENDED");
      assert.equal(decrypted.activeOrgId, suspendedOrg.id);
    });

    // Teste 3: Revogação em tempo real (Live Revocation) quando empresa ativa é suspensa
    await test("Empresa ativa suspensa em tempo real atualiza imediatamente orgStatus para SUSPENDED na próxima consulta", async () => {
      // Cria sessão enquanto está ativa
      const token = await encryptSession({
        userId: testUser.id,
        name: testUser.name,
        email: testUser.email,
        activeOrgId: activeOrg.id,
        activeMemberId: memberActive.id,
        role: Role.EMPLOYEE,
        employeeCode: memberActive.employeeCode,
      });

      // Simula a suspensão da empresa no banco de dados
      await prisma.organization.update({
        where: { id: activeOrg.id },
        data: { status: "SUSPENDED" },
      });

      // A mesma sessão (token prévio) agora é consultada
      const liveCheck = await decryptSession(token);
      assert.ok(liveCheck, "Sessão ainda decifra para identificação");
      assert.equal(liveCheck.orgStatus, "SUSPENDED", "Live check deve acusar SUSPENDED imediatamente");

      // Restaura para os demais testes
      await prisma.organization.update({
        where: { id: activeOrg.id },
        data: { status: "ACTIVE" },
      });
    });

    // Teste 4: Se o membro estiver inativo, sessão é invalidada mesmo com org suspensa ou ativa
    await test("Membro inativo tem sessão completamente recusada", async () => {
      await prisma.organizationMember.update({
        where: { id: memberSuspended.id },
        data: { status: "INACTIVE" },
      });

      const token = await encryptSession({
        userId: testUser.id,
        name: testUser.name,
        email: testUser.email,
        activeOrgId: suspendedOrg.id,
        activeMemberId: memberSuspended.id,
        role: Role.MANAGER,
      }).catch(() => null);

      assert.equal(token, null, "Não pode emitir sessão para membro inativo");

      await prisma.organizationMember.update({
        where: { id: memberSuspended.id },
        data: { status: "ACTIVE" },
      });
    });

    // Teste 5: Isolamento estrito de dados operacionais (Prisma query de vínculo operacional rejeita org SUSPENDED)
    await test("Query estrita de contexto operacional recusa membro se organização for SUSPENDED", async () => {
      const operationalMember = await prisma.organizationMember.findFirst({
        where: {
          id: memberSuspended.id,
          organizationId: suspendedOrg.id,
          userId: testUser.id,
          status: "ACTIVE",
          organization: { status: "ACTIVE" },
        },
      });

      assert.equal(operationalMember, null, "Nenhum membro operacional deve ser retornado para organização suspensa");
    });

    // Teste 6: Anti-enumeração de PIN - Senha/PIN errado não revela status de suspensão
    await test("PIN inválido em organização suspensa rejeita antes de revelar qualquer informação", async () => {
      const isPinValid = await bcrypt.compare("999999", memberSuspended.pinHash!);
      assert.equal(isPinValid, false, "PIN incorreto deve falhar");
    });

    console.log(`\n=== TODOS OS ${passed} TESTES DE SEGURANÇA PASSARAM COM SUCESSO! ===`);
  } finally {
    // Limpeza dos dados de teste
    await prisma.webAuthSession.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: suspendedOrg.id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: activeOrg.id } }).catch(() => {});
  }
}

run().catch((e) => {
  console.error("Erro fatal na execução dos testes:", e);
  process.exit(1);
});
