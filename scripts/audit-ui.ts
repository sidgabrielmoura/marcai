import "dotenv/config";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/infrastructure/database/prisma";
import { encryptSession } from "../src/infrastructure/security/session";

async function main() {
  await mkdir("tmp/ui-audit", { recursive: true });
  const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const results: unknown[] = [];
  try {
    for (const role of ["OWNER", "EMPLOYEE", "SUPERADMIN"] as const) {
      const member = role !== "SUPERADMIN" ? await prisma.organizationMember.findFirst({ where: { role, status: "ACTIVE", organization: { status: "ACTIVE" } }, include: { user: true, organization: true } }) : null;
      const user = member?.user ?? await prisma.user.findFirst({ where: { platformRole: "SUPERADMIN", status: "ACTIVE" } });
      if (!user) { results.push({ role, missing: true }); continue; }
      const token = await encryptSession({ userId: user.id, name: user.name, email: user.email, role, activeMemberId: member?.id ?? "", activeOrgId: member?.organizationId ?? "" });
      const task = member ? await prisma.task.findFirst({ where: { organizationId: member.organizationId, deletedAt: null, ...(role === "EMPLOYEE" ? { assignments: { some: { memberId: member.id, removedAt: null } } } : {}) } }) : null;
      const routes = role === "OWNER" ? ["/overview", "/management/tasks", "/management/tasks/new", "/management/tasks/trash", "/management/processes", "/management/processes/new", "/management/people", "/management/teams", "/management/locations", "/management/reports", "/management/settings", "/management/more", "/notifications", ...(task ? [`/management/tasks/${task.id}`] : [])] : role === "EMPLOYEE" ? ["/tasks", "/history", "/notifications", "/account", ...(task ? [`/tasks/${task.id}`] : [])] : ["/superadmin", "/superadmin?view=organizations", "/superadmin?view=audit", "/superadmin?view=users"];
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
        await context.addCookies([{ name: "gestao_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage();
        for (const route of routes) {
          const errors: string[] = []; const onError = (e: Error) => errors.push(e.message); page.on("pageerror", onError);
          try {
            const response = await page.goto(`http://localhost:3000${route}`, { waitUntil: "networkidle", timeout: 60000 });
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
            const heading = await page.locator("h1").first().textContent().catch(() => "");
            const name = `${role}-${width}-${route.replace(/[^a-z0-9]/gi, "-")}`;
            await page.screenshot({ path: `tmp/ui-audit/${name}.png`, fullPage: true });
            const result = { role, width, route, status: response?.status(), url: page.url(), overflow, heading, errors }; results.push(result); console.log(JSON.stringify(result));
          } catch (error) { results.push({ role, width, route, error: String(error) }); console.log(role, width, route, String(error)); }
          page.off("pageerror", onError);
        }
        await context.close();
      }
    }
  } finally { await writeFile("tmp/ui-audit/results.json", JSON.stringify(results, null, 2)); await browser.close(); await prisma.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
