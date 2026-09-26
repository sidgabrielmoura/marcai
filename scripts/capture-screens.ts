import "dotenv/config";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { encryptSession } from "../src/infrastructure/security/session";
import { prisma } from "../src/infrastructure/database/prisma";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9223;
const TEMP_PROFILE = path.join(process.env.TEMP || "C:\\Temp", "edge_marcia_profile_" + Date.now());
const ARTIFACT_DIR = "C:\\Users\\gabriel\\.gemini\\antigravity-ide\\brain\\c1e6fc10-47f2-4196-958c-0eb8a53a5fcb";

class CDPClient {
  private ws!: WebSocket;
  private messageId = 1;
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  async connect(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id)!;
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.messageId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Iniciando Edge Headless...");
  const edgeProcess = spawn(
    EDGE_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${TEMP_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
    ],
    { stdio: "ignore" }
  );

  let connected = false;

  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        console.log("Edge CDP online:", data.Browser);
        connected = true;
        break;
      }
    } catch {}
  }

  if (!connected) {
    console.error("Não foi possível conectar ao Edge");
    edgeProcess.kill();
    process.exit(1);
  }

  try {
    // Obter membro OWNER (Carlos Silva)
    const member = await prisma.organizationMember.findFirst({
      where: { role: "OWNER" },
      include: { user: true, organization: true },
    });
    if (!member) throw new Error("Membro OWNER não encontrado no banco de dados");

    console.log(`Autenticando como: ${member.user.name} (${member.role}) na org: ${member.organization.name}`);

    const sessionToken = await encryptSession({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      activeOrgId: member.organizationId,
      activeMemberId: member.id,
      role: member.role,
      employeeCode: member.employeeCode,
    });

    // Criar nova aba
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/overview`, {
      method: "PUT",
    });
    const tabData = await newTabRes.json();
    const cdp = new CDPClient();
    await cdp.connect(tabData.webSocketDebuggerUrl);

    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await cdp.send("Network.enable");

    // Injetar Cookie de Autenticação
    await cdp.send("Network.setCookie", {
      name: "gestao_session",
      value: sessionToken,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });

    // Viewports solicitadas no prompt
    const viewports = [
      { name: "mobile_360", width: 360, height: 800, isMobile: true },
      { name: "mobile_390", width: 390, height: 844, isMobile: true },
      { name: "mobile_430", width: 430, height: 932, isMobile: true },
      { name: "tablet_768", width: 768, height: 1024, isMobile: false },
      { name: "desktop_1440", width: 1440, height: 900, isMobile: false },
    ];

    console.log("=== CAPTURANDO VISÃO GERAL (/overview) NAS VIEWPORTS SOLICITADAS ===");
    for (const vp of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile,
      });

      await cdp.send("Page.navigate", { url: "http://127.0.0.1:3000/overview" });
      await sleep(1200);

      // Inspecionar métricas e conformidade
      const evalResult = await cdp.send("Runtime.evaluate", {
        expression: `({
          title: document.title,
          h1Text: document.querySelector('h1')?.textContent?.trim(),
          greeting: document.querySelector('main span')?.textContent?.trim() || document.querySelector('span')?.textContent?.trim(),
          fontFamilyH1: window.getComputedStyle(document.querySelector('h1')).fontFamily,
          fontSizeH1: window.getComputedStyle(document.querySelector('h1')).fontSize,
          noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          firstFoldCheck: {
            heroCardBottom: document.querySelector('div[class*="bg-[var(--brand-900)]"]')?.getBoundingClientRect()?.bottom,
            secondaryCardsBottom: document.querySelector('div[class*="grid grid-cols-2"]')?.getBoundingClientRect()?.bottom,
          }
        })`,
        returnByValue: true,
      });

      console.log(`[OVERVIEW ${vp.name}] Layout Inspection:`, evalResult.result.value);

      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      const filename = `overview_${vp.name}.png`;
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), Buffer.from(shot.data, "base64"));
      console.log(`Salvo: ${filename}`);
    }

    // Testar abertura do Bottom Sheet de Filtros em 390x844
    console.log("=== TESTANDO BOTTOM SHEET DE FILTROS (390x844) ===");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await cdp.send("Page.navigate", { url: "http://127.0.0.1:3000/overview" });
    await sleep(1000);

    // Clicar no botão de filtros
    await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('button[aria-label="Abrir filtros avançados"]')?.click()`,
    });
    await sleep(600);

    const shotSheet = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "overview_mobile_390_filter_sheet.png"), Buffer.from(shotSheet.data, "base64"));
    console.log("Salvo: overview_mobile_390_filter_sheet.png");

    // Testar expansão "Ver mais indicadores"
    await cdp.send("Page.navigate", { url: "http://127.0.0.1:3000/overview" });
    await sleep(1000);
    await cdp.send("Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Ver mais indicadores'))?.click()`,
    });
    await sleep(600);

    const shotExpanded = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARTIFACT_DIR, "overview_mobile_390_expanded.png"), Buffer.from(shotExpanded.data, "base64"));
    console.log("Salvo: overview_mobile_390_expanded.png");

    cdp.close();
  } catch (err) {
    console.error("Erro durante execução:", err);
  } finally {
    await prisma.$disconnect();
    edgeProcess.kill();
    try {
      fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
    } catch {}
    process.exit(0);
  }
}

main();
