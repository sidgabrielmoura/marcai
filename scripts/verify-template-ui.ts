import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import { prisma } from "../src/infrastructure/database/prisma";


async function main() {
  await mkdir("tmp", { recursive: true });
  const key = randomUUID(); let orgId = ""; let userId = ""; const errors: string[] = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const org = await prisma.organization.create({ data: { name: "Operação de teste", slug: "template-ui-" + key } }); orgId = org.id;
    const user = await prisma.user.create({ data: { name: "Admin de teste" } }); userId = user.id;
    const member = await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    const location = await prisma.location.create({ data: { organizationId: org.id, name: "Unidade Centro" } });
    const team = await prisma.team.create({ data: { organizationId: org.id, name: "Equipe da loja" } });
    const token = await new SignJWT({ userId: user.id, name: user.name, email: null, activeOrgId: org.id, activeMemberId: member.id, role: "OWNER" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
    await context.addCookies([{ name: "gestao_session", value: token, domain: "localhost", path: "/" }]);
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    page.setDefaultTimeout(45000);
    await page.goto("http://localhost:3000/management/templates", { timeout: 180000 });
    await page.getByRole("heading", { name: "Templates", exact: true }).waitFor();
    assert.equal(await page.locator("article").count(), 15);
    console.log("OK: biblioteca apresenta 15 templates");
    await page.goto("http://localhost:3000/management/processes");
    await page.getByRole("button", { name: "Usar template", exact: true }).click();
    await page.getByText("15 templates disponíveis", { exact: true }).waitFor();
    const modal = page.locator('[data-slot="dialog-content"]');
    await modal.getByRole("button", { name: "Varejo", exact: true }).click();
    await modal.getByRole("button", { name: /Abertura de loja/ }).click();
    await page.screenshot({ path: "tmp/template-modal-desktop.png" });
    assert.equal(await prisma.process.count({ where: { organizationId: org.id } }), 0);
    await page.getByRole("button", { name: "Usar este template", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare seu processo", exact: true }).waitFor();
    await page.getByLabel(/^Equipe:/).selectOption(team.id);
    if (await page.getByLabel(/^Aprovador:/).count()) await page.getByLabel(/^Aprovador:/).selectOption(member.id);
    await page.getByRole("button", { name: "Personalizar processo", exact: true }).click();
    await page.getByLabel("Nome do processo").fill("Processo criado por template");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Duplicar tarefa 1", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: /^Duplicar tarefa/ }).count(), 6);
    await page.getByRole("button", { name: "Remover tarefa 2", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("checkbox", { name: "Programar repetição automática agora (Rotina)", exact: true }).uncheck();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    assert.equal(await prisma.process.count({ where: { organizationId: org.id } }), 0);
    await page.getByRole("button", { name: "Salvar processo", exact: true }).click();
    await page.waitForURL("**/management/processes", { timeout: 45000 });
    assert.equal(await prisma.process.count({ where: { organizationId: org.id } }), 1);
    console.log("OK: seleção + personalização + criação manual sem efeitos na prévia");
    await page.getByRole("button", { name: "Salvar como template", exact: true }).click();
    await page.getByRole("button", { name: "Criar rascunho", exact: true }).click();
    await page.waitForURL("**/management/templates/*/edit");
    await page.getByLabel("Nome do processo").fill("Abertura da minha operação");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByText("Conferir recursos de atendimento", { exact: true }).click();
    await page.getByLabel("Tipo de resposta").first().selectOption("MULTIPLE_CHOICE");
    await page.getByLabel("Alternativa 1 da pergunta 1", { exact: true }).fill("Funcionando");
    await page.getByLabel("Alternativa 2 da pergunta 1", { exact: true }).fill("Precisa de ajuste");
    await page.getByRole("button", { name: "Duplicar pergunta 1", exact: true }).click();
    await page.getByRole("button", { name: "Remover pergunta 2", exact: true }).click();
    await page.locator('main a[href="/management/templates"]').first().click();
    await page.getByText("Descartar alterações?", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Continuar editando", exact: true }).click();
    assert.equal(await page.getByLabel("Alternativa 1 da pergunta 1", { exact: true }).inputValue(), "Funcionando");
    await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await page.getByText("Rascunho salvo", { exact: true }).waitFor();
    const draftRow = await prisma.reusableProcessTemplate.findFirstOrThrow({ where: { organizationId: org.id } });
    const draftContent = draftRow.draftDefinition as { tasks: { formFields: { type: string; options: string[] }[] }[] };
    assert.deepEqual(draftContent.tasks[2].formFields[0].options, ["Funcionando", "Precisa de ajuste"]);
    // All steps loaded from the process are valid and can be published after review.
    for (const stage of ["Dependências", "Rotina", "Aprovações", "Revisão"]) {
      await page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.locator('[aria-current="step"]').filter({ hasText: stage }).waitFor();
    }
    await page.getByRole("button", { name: "Publicar template", exact: true }).click();
    try { await page.getByText("Template publicado", { exact: true }).waitFor(); }
    catch (error) { await page.screenshot({ path: "tmp/template-publication-failure.png" }); console.log("Feedback:", await page.locator('[data-slot*="toast"]').allTextContents()); throw error; }
    assert.equal(await prisma.reusableProcessTemplate.count({ where: { organizationId: org.id, status: "PUBLISHED" } }), 1);
    const published = await prisma.reusableProcessTemplate.findFirstOrThrow({ where: { organizationId: org.id, status: "PUBLISHED" }, include: { publishedVersion: true } });
    const publishedDefinition = published.publishedVersion!.definition as { tasks: { formFields: { type: string; options: string[] }[] }[] };
    assert.deepEqual(publishedDefinition.tasks[2].formFields[0].options, ["Funcionando", "Precisa de ajuste"]);
    console.log("OK: admin salva processo como template, edita e publica");
    await page.goto("http://localhost:3000/management/processes");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole("button", { name: "Usar template", exact: true }).click();
      await page.getByText("16 templates disponíveis", { exact: true }).waitFor();
      const drawer = page.locator('[data-slot="drawer-popup"]');
      await drawer.getByRole("button", { name: "Varejo", exact: true }).click();
      await drawer.getByRole("button", { name: /Abertura de loja/ }).click();
      await page.screenshot({ path: "tmp/template-modal-" + width + ".png" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) console.log("Overflow nodes", await page.evaluate(() => [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent?.slice(0, 60), width: e.getBoundingClientRect().width })))); assert.equal(overflow, false);
      await drawer.getByRole("button", { name: "Fechar templates", exact: true }).click();
      console.log("OK: modal móvel e scroll em " + width + "px");
    }
    console.log("Browser errors:", JSON.stringify(errors)); assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });



