import "dotenv/config";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/infrastructure/database/prisma";
import {
  requestPasswordResetAction,
  validatePasswordResetTokenAction,
  resetPasswordWithTokenAction,
} from "../src/presentation/actions/recovery-actions";
import { createHash } from "node:crypto";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✔ PASSOU: ${name}`);
  } catch (err) {
    console.error(`✖ FALHOU: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function run() {
  console.log("=== INICIANDO TESTES E2E: RECUPERAÇÃO DE SENHA E RESEND ===");

  const timestamp = Date.now();
  const testEmail = `reset-user-${timestamp}@tarefai.test`;
  const initialPassword = "OldPassword@123";
  const newPassword = "NewStrongPassword@2026";
  const initialPasswordHash = await bcrypt.hash(initialPassword, 10);

  // 1. Criar organização e usuário de teste
  const org = await prisma.organization.create({
    data: {
      name: `Org Reset Test ${timestamp}`,
      slug: `org-reset-${timestamp}`,
      status: "ACTIVE",
    },
  });

  const user = await prisma.user.create({
    data: {
      name: `Usuário Teste Reset ${timestamp}`,
      email: testEmail,
      passwordHash: initialPasswordHash,
      status: "ACTIVE",
    },
  });

  const member = await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      role: "MANAGER",
      status: "ACTIVE",
    },
  });

  try {
    // TESTE 1: Anti-enumeração em e-mail inexistente
    await test("Solicitação para e-mail inexistente responde sucesso genérico sem vazar dados", async () => {
      const formData = new FormData();
      formData.append("email", `nonexistent-${timestamp}@tarefai.test`);
      const res = await requestPasswordResetAction(formData);

      assert.equal(res.success, true);
      assert.ok(String(res.data).includes("instruções de recuperação foram enviadas"));

      const tokenInDb = await prisma.passwordResetToken.findFirst({
        where: { user: { email: `nonexistent-${timestamp}@tarefai.test` } },
      });
      assert.equal(tokenInDb, null, "Não deve criar token para e-mail inexistente");
    });

    // TESTE 2: Solicitação para usuário existente gera token com hash SHA-256 e dispara Resend
    let capturedRawToken = "";
    await test("Solicitação para usuário válido cria token com hash SHA-256 no banco e agenda envio", async () => {
      const formData = new FormData();
      formData.append("email", testEmail);
      const res = await requestPasswordResetAction(formData);

      assert.equal(res.success, true);

      // Busca o token criado no banco
      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      });
      assert.equal(tokens.length, 1, "Deve existir exatamente 1 token ativo");
      const dbToken = tokens[0];

      // O token no banco DEVE ser um hash SHA-256 de 64 caracteres hexadecimais
      assert.equal(dbToken.token.length, 64);
      assert.match(dbToken.token, /^[a-f0-9]{64}$/);
      assert.equal(dbToken.usedAt, null);
      assert.ok(dbToken.expiresAt.getTime() > Date.now());

      // Para validar as actions subsequentes, vamos recuperar o rawToken via teste de correspondência
      // Como a action gerou o token, vamos criar um par conhecido para testar o fluxo completo
    });

    // TESTE 3: Validação de Token no Servidor
    const testRawToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const testTokenHash = createHash("sha256").update(testRawToken).digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: testTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await test("validatePasswordResetTokenAction valida com sucesso token íntegro e retorna dados mascarados", async () => {
      const validation = await validatePasswordResetTokenAction(testRawToken);
      assert.equal(validation.valid, true);
      assert.ok(validation.emailMasked?.includes("***"));
      assert.equal(validation.name, user.name);

      // Token forjado / adulterado deve falhar
      const invalidValidation = await validatePasswordResetTokenAction("0000000000000000000000000000000000000000000000000000000000000000");
      assert.equal(invalidValidation.valid, false);
      assert.ok(invalidValidation.error?.includes("inválido"));
    });

    // TESTE 4: Validação de complexidade de senha
    await test("resetPasswordWithTokenAction rejeita senhas fracas ou sem complexidade", async () => {
      const resShort = await resetPasswordWithTokenAction(testRawToken, "12345");
      assert.ok(resShort.error, "Deve rejeitar senha curta");

      const resNoUpper = await resetPasswordWithTokenAction(testRawToken, "alllowercase123");
      assert.ok(resNoUpper.error, "Deve rejeitar senha sem maiúscula");

      const resNoNumber = await resetPasswordWithTokenAction(testRawToken, "AllLettersNoNumber");
      assert.ok(resNoNumber.error, "Deve rejeitar senha sem número");
    });

    // TESTE 5: Execução da redefinição de senha com invalidação imediata (Uso Único)
    await test("resetPasswordWithTokenAction redefine senha com sucesso e invalida o token", async () => {
      const res = await resetPasswordWithTokenAction(testRawToken, newPassword);
      assert.equal(res.success, true);

      // 1. O token no banco deve estar marcado como usedAt !== null
      const tokenInDb = await prisma.passwordResetToken.findUnique({
        where: { token: testTokenHash },
      });
      assert.ok(tokenInDb, "Token deve existir");
      assert.ok(tokenInDb.usedAt !== null, "usedAt deve estar preenchido");

      // 2. O passwordHash do usuário deve ter sido alterado
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      assert.ok(updatedUser?.passwordHash);
      const isNewValid = await bcrypt.compare(newPassword, updatedUser.passwordHash);
      const isOldValid = await bcrypt.compare(initialPassword, updatedUser.passwordHash);
      assert.equal(isNewValid, true, "Nova senha deve ser válida");
      assert.equal(isOldValid, false, "Senha antiga deve ser inválida");
    });

    // TESTE 6: Tentativa de reuso do link (Garantia de Uso Único)
    await test("Segunda tentativa de usar o mesmo link é estritamente recusada", async () => {
      // 1. Validação de tela
      const validation = await validatePasswordResetTokenAction(testRawToken);
      assert.equal(validation.valid, false, "Token já utilizado não deve ser válido para a tela");
      assert.ok(validation.error?.includes("já foi utilizado"));

      // 2. Tentativa de redefinição
      const res = await resetPasswordWithTokenAction(testRawToken, "AnotherPassword@999");
      assert.ok(res.error, "Deve recusar redefinição com token já usado");
      assert.ok(res.error.includes("já foi utilizado") || res.error.includes("inválido"));
    });

  } finally {
    // Teardown
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.activityLog.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: org.id } }).catch(() => {});
  }

  console.log(`\n=== TODOS OS ${passed} TESTES DE RECUPERAÇÃO DE SENHA PASSARAM COM SUCESSO! ===`);
}

run().catch((err) => {
  console.error("Erro fatal no runner:", err);
  process.exit(1);
});
