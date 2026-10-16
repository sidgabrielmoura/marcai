import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
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
    throw new Error(
      "No configured superadmin available for local verification.",
    );
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const reports: unknown[] = [];
  await mkdir("tmp/superadmin-review", { recursive: true });
  const auditOnly = process.argv.includes("--audit-only");
  try {
    for (const width of auditOnly ? [1440, 390] : [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of auditOnly ? ["audit"] : [
        "overview",
        "organizations",
        "users",
        "subscriptions",
        "usage",
        "support",
        "audit",
      ]) {
        const response = await page.goto(
          `${baseUrl}/superadmin?view=${view}`,
          { waitUntil: "networkidle" },
        );
        try { await page.locator('.sa-operation-boundary[data-platform-ready="true"]').waitFor(); }
        catch {
          await page.screenshot({ caret: "initial", path: "tmp/superadmin-review/verification-error.png", fullPage: true });
          throw new Error(`${view} at ${width}: HTTP ${response?.status()}, path ${new URL(page.url()).pathname}. See verification-error.png.`);
        }
        await expect(page.locator("h1")).toHaveCount(1);
        if (width < 1024) {
          await expect.poll(async () => page
            .locator('.mobile-navigation [aria-current="page"]')
            .evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= 0 && bounds.right <= innerWidth;
            }), { message: `${view} at ${width}: active mobile navigation is visible` }).toBe(true);
        }
        await page.screenshot({ caret: "initial",
          path: `tmp/superadmin-review/${view}-${width}.png`,
          fullPage: true,
        });
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          title: document.querySelector("h1")?.textContent,
          panels: document.querySelectorAll(".sa-panel").length,
        }));
        if (layout.overflow || response?.status() !== 200)
          throw new Error(
            `Layout failed: ${view} at ${width}: ${JSON.stringify(layout)}`,
          );
        reports.push({ view, width, status: response?.status(), ...layout });
      }
    }
    if (auditOnly) {
      if (errors.length) throw new Error(JSON.stringify(errors));
      await writeFile("tmp/superadmin-review/audit-report.json", JSON.stringify(reports, null, 2));
      console.log("Verified final audit layout on desktop and mobile; no browser errors.");
      return;
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `${baseUrl}/superadmin?view=organizations&q=nonexistent-layout-check&status=SUSPENDED`,
      { waitUntil: "networkidle" },
    );
    await page
      .getByRole("link", { name: "Limpar filtros", exact: true })
      .click();
    await page.waitForURL(
      (url) => !url.searchParams.has("q") && !url.searchParams.has("status"),
    );
    for (const [view, button] of [
      ["organizations", "Nova organização"],
      ["users", "Novo usuário"],
    ]) {
      await page.goto(`${baseUrl}/superadmin?view=${view}`, {
        waitUntil: "networkidle",
      });
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("dialog").evaluate(async (dialog) => {
        await Promise.all(
          dialog.getAnimations().map((animation) => animation.finished),
        );
      });
      await page.screenshot({ caret: "initial",
        path: `tmp/superadmin-review/modal-${view}.png`,
      });
      reports.push({
        view,
        modal: await page
          .getByRole("dialog")
          .getByRole("heading")
          .textContent(),
      });
      await page.keyboard.press("Escape");
    }
    await page.goto(`${baseUrl}/superadmin?view=subscriptions`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("tab", { name: /Catálogo de planos/ }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expect(page.locator(".sa-toolbar")).toHaveCount(0);
    await expect(page.locator(".sa-pagination")).toHaveCount(0);
    if (await page.locator(".sa-plan").count()) {
      await page
        .locator(".sa-plan")
        .first()
        .getByRole("button", { name: "Aplicar a uma organização" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.screenshot({ caret: "initial",
      path: "tmp/superadmin-review/catalog-1440.png",
      fullPage: true,
    });
    reports.push({ catalog: await page.locator(".sa-plan").count() });
    await page.getByRole("tab", { name: "Assinaturas", exact: true }).click();
    await expect(page.locator(".sa-toolbar")).toBeVisible();
    if (await page.locator(".sa-table tbody tr").count()) {
      await page
        .locator(".sa-table tbody tr")
        .first()
        .getByRole("button")
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.goto(`${baseUrl}/superadmin?view=usage`, {
      waitUntil: "networkidle",
    });
    const rowsWithPlan = page.locator(".sa-table tbody tr").filter({ hasNotText: "Sem plano registrado" });
    if (await rowsWithPlan.count()) {
      const row = rowsWithPlan.last();
      const name = await row.locator(".sa-identity strong").textContent();
      await row.getByRole("button", { name: "Ajustar limites" }).click();
      await expect(page.getByRole("dialog")).toContainText(name ?? "");
      const existingPlanName = await page
        .getByRole("dialog")
        .locator('input[name="planName"]')
        .inputValue();
      expect(existingPlanName.length).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      reports.push({ quotaForm: "existing conditions populated" });
    }
    await page.goto(`${baseUrl}/superadmin?view=organizations`, {
      waitUntil: "networkidle",
    });
    if (await page.locator(".sa-table tbody tr").count()) {
      await page
        .locator(".sa-table tbody tr")
        .first()
        .getByRole("button", { name: /^Ações de/ })
        .click();
      await page
        .getByRole("menuitem", { name: "Editar organização", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await page
        .locator(".sa-table tbody tr")
        .first()
        .locator("summary")
        .click();
      await expect(
        page.locator(".sa-table tbody tr").first().locator("details"),
      ).toHaveAttribute("open", "");
      reports.push({
        organizationDetails: "expanded",
        organizationMenu: "edit opened",
      });
    }
    await page.goto(`${baseUrl}/superadmin?view=users`, {
      waitUntil: "networkidle",
    });
    if (await page.locator(".sa-table tbody tr").count()) {
      await page
        .locator(".sa-table tbody tr")
        .first()
        .getByRole("button", { name: "Vínculos", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      reports.push({ membershipForm: "opened" });
    }
    const protectedRow = page
      .locator(".sa-table tbody tr")
      .filter({ hasText: user.email ?? user.name });
    if (await protectedRow.count()) {
      await protectedRow
        .first()
        .getByRole("button", { name: /^Ações de/ })
        .click();
      await expect(
        page.getByRole("menuitem", { name: "Suspender acesso", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", { name: "Excluir usuário", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      reports.push({ protectedAccount: "destructive actions absent" });
    }
    await page.goto(`${baseUrl}/superadmin?view=support`, {
      waitUntil: "networkidle",
    });
    const registerSupport = page.getByRole("button", {
      name: "Registrar atendimento",
      exact: true,
    });
    if (await registerSupport.isEnabled()) {
      await registerSupport.click();
      await page.getByRole("menuitem").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      reports.push({ supportForm: "opened without prior organization filter" });
    }
    if (errors.length) throw new Error(JSON.stringify(errors));
    await writeFile(
      "tmp/superadmin-review/report.json",
      JSON.stringify(reports, null, 2),
    );
    console.log(
      `Verified ${reports.length} screens and interactions; no overflow or browser errors.`,
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
