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
    "http://localhost:3001";
  console.log("Using baseUrl:", baseUrl);
  const user = await prisma.user.findFirst({
    where: {
      platformRole: "SUPERADMIN",
      status: "ACTIVE",
      twoFactorEnabled: true,
    },
  });
  if (!user) throw new Error("No superadmin found");

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
    viewport: { width: 1440, height: 900 },
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

  console.log("Navigating to users view...");
  await page.goto(`${baseUrl}/superadmin?view=users`, { waitUntil: "networkidle" });
  await page.locator('.sa-operation-boundary[data-platform-ready="true"]').waitFor();

  const userActionTriggers = page.locator('.sa-table .sa-row-actions [data-slot="dropdown-menu-trigger"]');
  const userTriggersCount = await userActionTriggers.count();
  console.log("Found user action triggers:", userTriggersCount);

  if (userTriggersCount > 0) {
    const firstTrigger = userActionTriggers.first();
    console.log("Clicking first user action trigger...");
    await firstTrigger.click();

    const popup = page.locator('[data-slot="dropdown-menu-content"]');
    await popup.waitFor({ state: "visible", timeout: 3000 });
    console.log("Popup successfully opened!");

    const items = popup.locator('[data-slot="dropdown-menu-item"]');
    const itemsCount = await items.count();
    console.log("Popup items count:", itemsCount);
    for (let i = 0; i < itemsCount; i++) {
      console.log(` - Item ${i + 1}:`, (await items.nth(i).textContent())?.trim());
    }

    await page.screenshot({
      path: "tmp/superadmin-review/users-popup-open.png",
      fullPage: false,
    });
    console.log("Saved screenshot to tmp/superadmin-review/users-popup-open.png");
  }

  // Agora testa organizações
  console.log("Navigating to organizations view...");
  await page.goto(`${baseUrl}/superadmin?view=organizations`, { waitUntil: "networkidle" });
  await page.locator('.sa-operation-boundary[data-platform-ready="true"]').waitFor();

  const orgActionTriggers = page.locator('.sa-table .sa-row-actions [data-slot="dropdown-menu-trigger"]');
  const orgTriggersCount = await orgActionTriggers.count();
  console.log("Found org action triggers:", orgTriggersCount);

  if (orgTriggersCount > 0) {
    const firstTrigger = orgActionTriggers.first();
    console.log("Clicking first org action trigger...");
    await firstTrigger.click();

    const popup = page.locator('[data-slot="dropdown-menu-content"]');
    await popup.waitFor({ state: "visible", timeout: 3000 });
    console.log("Org popup successfully opened!");

    await page.screenshot({
      path: "tmp/superadmin-review/orgs-popup-open.png",
      fullPage: false,
    });
    console.log("Saved screenshot to tmp/superadmin-review/orgs-popup-open.png");
  }

  await browser.close();
  console.log("Verification completed successfully!");
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
