import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession } from "../src/infrastructure/security/session";
import { secondFactorProof } from "../src/infrastructure/security/totp";

async function main() {
  const baseUrl =
    process.env.TAREFAI_UI_BASE_URL ??
    process.env.MARCAI_UI_BASE_URL ??
    "http://localhost:3000";
  const user = await prisma.user.findFirst({
    where: {
      platformRole: "SUPERADMIN",
      status: "ACTIVE",
      twoFactorEnabled: true,
    },
  });
  if (!user)
    throw new Error("Configure a superadmin before running this verification.");
  const token = await encryptSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: "SUPERADMIN",
    activeMemberId: "",
    activeOrgId: "",
    secondFactorProof: secondFactorProof(user.twoFactorSecret),
  });
  const browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "gestao_session",
      value: token,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  await mkdir("tmp/superadmin-review", { recursive: true });
  try {
    await page.goto(`${baseUrl}/superadmin?view=organizations`, {
      waitUntil: "networkidle",
    });
    await page
      .getByRole("button", { name: "Nova organização", exact: true })
      .click();
    await page.locator("#org-name").fill("Validação de bloqueio sem cadastro");
    await page.locator("#org-owner-email").fill("valida.owner@teste.com");
    const submit = page.getByRole("button", {
      name: "Criar organização",
      exact: true,
    });
    let mutationRequests = 0;
    let finishMutation!: () => void;
    const mutationGate = new Promise<void>((resolve) => {
      finishMutation = resolve;
    });
    await page.route("**/superadmin*", async (route) => {
      if (
        route.request().method() !== "POST" ||
        !route.request().headers()["next-action"]
      )
        return route.continue();
      mutationRequests++;
      await mutationGate;
      // Intentionally fail locally; no write request ever reaches the server.
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Local verification failure",
      });
    });
    await page.locator(".superadmin-dialog form").evaluate((element) => {
      const form = element as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      )!;
      form.requestSubmit(button);
      form.requestSubmit(button);
      form.requestSubmit(button);
    });
    await expect.poll(() => mutationRequests).toBe(1);
    await expect(submit).toBeDisabled();
    await expect(submit.locator('[data-slot="spinner"]')).toBeVisible();
    await expect(submit.locator('[data-slot="spinner"] svg')).toBeVisible();
    await expect(page.locator("#org-name")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: "tmp/superadmin-review/save-pending.png" });
    finishMutation();
    await expect(submit).toBeEnabled();
    await expect(page.locator("#org-name")).toHaveValue(
      "Validação de bloqueio sem cadastro",
    );
    await expect(submit.locator('[data-slot="spinner"]')).toHaveCount(0);
    await submit.click();
    await expect.poll(() => mutationRequests).toBe(2);
    await expect(submit).toBeEnabled();
    await page.unroute("**/superadmin*");
    await page.keyboard.press("Escape");

    let filterRequests = 0;
    let finishFilter!: () => void;
    const filterGate = new Promise<void>((resolve) => {
      finishFilter = resolve;
    });
    await page.route("**/superadmin*", async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("q") !==
        "layout-async-check"
      )
        return route.continue();
      filterRequests++;
      await filterGate;
      await route.continue();
    });
    await page.locator("#platform-search").fill("layout-async-check");
    await page
      .locator('form[aria-label="Filtrar registros"]')
      .evaluate((element) => {
        const form = element as HTMLFormElement;
        const button = form.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        )!;
        form.requestSubmit(button);
        form.requestSubmit(button);
      });
    await expect.poll(() => filterRequests).toBe(1);
    const filter = page.getByRole("button", { name: "Filtrar", exact: true });
    await expect(filter).toBeDisabled();
    await expect(filter.locator('[data-slot="spinner"]')).toBeVisible();
    await page.screenshot({ path: "tmp/superadmin-review/filter-pending.png" });
    finishFilter();
    await expect(filter).toBeEnabled();
    await expect(page.locator('[data-slot="pagination"]')).toBeVisible();
    await page.unroute("**/superadmin*");

    await page.goto(`${baseUrl}/superadmin?view=audit`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".sa-table tbody tr")).toHaveCount(10);
    await expect(
      page.locator('[aria-label="Página anterior"]'),
    ).toHaveAttribute("aria-disabled", "true");
    let paginationRequests = 0;
    let finishPagination!: () => void;
    const paginationGate = new Promise<void>((resolve) => {
      finishPagination = resolve;
    });
    await page.route("**/superadmin*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("page") !== "2")
        return route.continue();
      paginationRequests++;
      await paginationGate;
      await route.continue();
    });
    await page.locator('[aria-label="Próxima página"]').evaluate((element) => {
      (element as HTMLElement).click();
      (element as HTMLElement).click();
    });
    await expect.poll(() => paginationRequests).toBe(1);
    await expect(
      page.locator('[aria-label="Próxima página"] [data-slot="spinner"]'),
    ).toBeVisible();
    await page.screenshot({
      path: "tmp/superadmin-review/pagination-pending.png",
    });
    finishPagination();
    await page.waitForURL((url) => url.searchParams.get("page") === "2");
    await expect(
      page.locator('.sa-pagination [aria-current="page"]'),
    ).toHaveText("2");
    await expect(page.locator(".sa-table tbody tr")).toHaveCount(10);
    await page.unroute("**/superadmin*");

    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({
      path: "tmp/superadmin-review/pagination-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    let logoutRequests = 0;
    let finishLogout!: () => void;
    const logoutGate = new Promise<void>((resolve) => {
      finishLogout = resolve;
    });
    await page.route("**/superadmin*", async (route) => {
      if (
        route.request().method() !== "POST" ||
        !route.request().headers()["next-action"]
      )
        return route.continue();
      logoutRequests++;
      await logoutGate;
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Local logout verification failure",
      });
    });
    await page.locator(".app-sidebar form").evaluate((element) => {
      const form = element as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      )!;
      form.requestSubmit(button);
      form.requestSubmit(button);
    });
    const logout = page
      .locator(".app-sidebar")
      .getByRole("button", { name: "Sair da conta", exact: true });
    await expect.poll(() => logoutRequests).toBe(1);
    await expect(logout).toBeDisabled();
    await expect(logout.locator('[data-slot="spinner"]')).toBeVisible();
    finishLogout();
    await expect(logout).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe("/superadmin");
    await page.unroute("**/superadmin*");
    console.log(
      "Verified immediate duplicate-submit guards, loaders, error recovery, filters and 10-row pagination. No database writes.",
    );
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exitCode = 1;
});
