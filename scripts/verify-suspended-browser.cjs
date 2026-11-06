const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert/strict");

async function run() {
  console.log("=== INICIANDO TESTE END-TO-END DE NAVEGADOR (SUSPENDED FLOW) ===");

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // 1. Acesso à tela de login
    console.log("1. Acessando http://localhost:3000/login...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });

    // 2. Login com Senha
    console.log("2. Clicando na aba 'Senha'...");
    await page.getByRole("button", { name: "Senha" }).click();

    console.log("3. Preenchendo e-mail e senha da empresa suspensa...");
    await page.fill('input[name="email"]', "demo-suspensa@tarefai.test");
    await page.fill('input[name="password"]', "Password@123");

    console.log("4. Enviando formulário de login com senha...");
    await Promise.all([
      page.waitForURL("**/suspended", { timeout: 15000 }),
      page.getByRole("button", { name: "Entrar com senha" }).click(),
    ]);

    console.log("✔ Redirecionado com sucesso para:", page.url());
    assert.ok(page.url().includes("/suspended"), "URL deve ser /suspended");

    // 5. Validação dos elementos visuais da página /suspended
    console.log("5. Validando conteúdo e layout da página /suspended...");
    const badgeText = await page.locator("text=Acesso Suspenso").textContent();
    assert.ok(badgeText.includes("Acesso Suspenso"), "Badge deve estar visível");

    const titleText = await page.locator("h1").textContent();
    assert.ok(titleText.includes("Acesso da empresa suspenso"), "Título deve estar correto");

    const orgCard = await page.locator("text=Academia Força Total").isVisible();
    assert.ok(orgCard, "Nome da organização suspensa deve estar visível");

    const waButton = await page.locator('text=Falar com suporte no WhatsApp').isVisible();
    assert.ok(waButton, "Botão do WhatsApp deve estar presente");

    const emailButton = await page.locator('text=Solicitar reabertura por e-mail').isVisible();
    assert.ok(emailButton, "Botão de e-mail deve estar presente");

    // Tira screenshot do layout
    const screenshotPath = path.join(__dirname, "../tmp/suspended-page-desktop.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("✔ Screenshot salvo em:", screenshotPath);

    // 6. Teste de tentativa de bypass: tentar ir para /overview ou /tasks estando suspenso
    console.log("6. Testando tentativa de bypass para /overview com sessão suspensa...");
    await page.goto("http://localhost:3000/overview");
    await page.waitForURL("**/suspended", { timeout: 10000 });
    console.log("✔ Bypass bloqueado! Redirecionado imediatamente de volta para:", page.url());
    assert.ok(page.url().includes("/suspended"));

    console.log("7. Testando tentativa de bypass para /tasks com sessão suspensa...");
    await page.goto("http://localhost:3000/tasks");
    await page.waitForURL("**/suspended", { timeout: 10000 });
    console.log("✔ Bypass bloqueado! Redirecionado imediatamente de volta para:", page.url());
    assert.ok(page.url().includes("/suspended"));

    // 8. Logout da conta
    console.log("8. Testando botão 'Sair da conta'...");
    await Promise.all([
      page.waitForURL("**/login", { timeout: 10000 }),
      page.getByRole("button", { name: "Sair da conta" }).click(),
    ]);
    console.log("✔ Deslogado com sucesso, redirecionado para:", page.url());

    // 9. Login com PIN na organização suspensa
    console.log("9. Testando login via PIN na organização suspensa...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="organizationSlug"]', "academia-forca-total");
    await page.fill('input[name="employeeCode"]', "1001");
    await page.fill('input[name="pin"]', "123456");

    await Promise.all([
      page.waitForURL("**/suspended", { timeout: 15000 }),
      page.getByRole("button", { name: "Entrar no sistema" }).click(),
    ]);

    console.log("✔ Login via PIN redirecionado com sucesso para /suspended:", page.url());
    assert.ok(page.url().includes("/suspended"));

    // 10. Validação Mobile (viewport 390x844)
    console.log("10. Testando layout responsivo no mobile (390x844)...");
    await page.setViewportSize({ width: 390, height: 844 });
    const screenshotMobilePath = path.join(__dirname, "../tmp/suspended-page-mobile.png");
    await page.screenshot({ path: screenshotMobilePath, fullPage: true });
    console.log("✔ Screenshot mobile salvo em:", screenshotMobilePath);

    console.log("\n=== TODOS OS TESTES END-TO-END DE NAVEGADOR PASSARAM COM SUCESSO! ===");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("FALHA NO TESTE E2E:", err);
  process.exit(1);
});
