import "dotenv/config";
import { encryptSession } from "../src/infrastructure/security/session";
import { prisma } from "../src/infrastructure/database/prisma";

async function run() {
  try {
    const member = await prisma.organizationMember.findFirst({
      where: { employeeCode: "EMP-001" },
      include: { user: true, organization: true },
    });
    if (!member) {
      console.log("MEMBER_NOT_FOUND");
      return;
    }
    const token = await encryptSession({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      activeOrgId: member.organizationId,
      activeMemberId: member.id,
      role: member.role,
      employeeCode: member.employeeCode,
    });
    console.log("AUTH_TOKEN=" + token);

    const res = await fetch("http://localhost:3000/tasks", {
      headers: {
        Cookie: "gestao_session=" + token,
      },
    });
    console.log("TASKS_HTTP_STATUS=" + res.status);
    const html = await res.text();
    console.log("HAS_MINHAS_TAREFAS=" + html.includes("Minhas tarefas"));
    const styleLinks = html.match(/<link[^>]+rel="stylesheet"[^>]+>/g);
    const styleHref = styleLinks && styleLinks[0]?.match(/href="([^"]+)"/)?.[1];
    if (styleHref) {
      const cssRes = await fetch("http://localhost:3000" + styleHref);
      const cssText = await cssRes.text();
      console.log("CSS_HAS_MANROPE=" + cssText.includes("Manrope"));
      console.log("CSS_HAS_FONT_MANROPE=" + cssText.includes("--font-manrope"));
      const fontSansMatch = cssText.match(/--font-sans:[^;]+;/);
      console.log("CSS_FONT_SANS=", fontSansMatch ? fontSansMatch[0] : "NONE");
    }
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

run();
