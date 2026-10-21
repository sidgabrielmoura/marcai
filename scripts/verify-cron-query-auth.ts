import { validateCronRequest } from "../src/infrastructure/security/cron-auth";
import { GET as getMobileRoute } from "../src/app/api/jobs/mobile/route";
import { GET as getMaintenanceRoute } from "../src/app/api/jobs/mobile-maintenance/route";
import { GET as getOperationalRoute } from "../src/app/api/jobs/operational/route";
import { GET as getRetentionRoute } from "../src/app/api/jobs/retention/route";
import { GET as getTrashRoute } from "../src/app/api/jobs/retention/trash/route";
import { GET as getHistoryRoute } from "../src/app/api/jobs/retention/history/route";

async function runTests() {
  console.log("=== VERIFICANDO SUPORTE A QUERY PARAMS E AUTENTICAÇÃO DE CRONS ===");

  const TEST_SECRET = "super-secret-cron-token-with-sufficient-length-32";
  process.env.CRON_SECRET = TEST_SECRET;

  // 1. Testes de validateCronRequest
  console.log("\n[1] Testando variações de parâmetros em validateCronRequest...");

  const variations = [
    { name: "query ?secret=", url: `http://localhost/api/jobs/mobile?secret=${TEST_SECRET}` },
    { name: "query ?cron_secret=", url: `http://localhost/api/jobs/mobile?cron_secret=${TEST_SECRET}` },
    { name: "query ?CRON_SECRET=", url: `http://localhost/api/jobs/mobile?CRON_SECRET=${TEST_SECRET}` },
    { name: "query ?key=", url: `http://localhost/api/jobs/mobile?key=${TEST_SECRET}` },
    { name: "query ?token=", url: `http://localhost/api/jobs/mobile?token=${TEST_SECRET}` },
    { name: "query ?secret=Bearer...", url: `http://localhost/api/jobs/mobile?secret=Bearer%20${TEST_SECRET}` },
    { name: "header Authorization: Bearer", url: `http://localhost/api/jobs/mobile`, headers: { Authorization: `Bearer ${TEST_SECRET}` } },
    { name: "header x-cron-secret", url: `http://localhost/api/jobs/mobile`, headers: { "x-cron-secret": TEST_SECRET } },
  ];

  for (const v of variations) {
    const req = new Request(v.url, { headers: v.headers });
    const auth = validateCronRequest(req);
    if (!auth.authorized) {
      throw new Error(`Falha no teste: ${v.name}. Retornou não autorizado.`);
    }
    console.log(`  ✓ ${v.name}: autorizado com sucesso`);
  }

  // Testes de rejeição
  const noAuth = validateCronRequest(new Request("http://localhost/api/jobs/mobile"));
  if (noAuth.authorized || noAuth.status !== 401) {
    throw new Error("Deveria rejeitar requisição sem credencial com 401");
  }
  console.log("  ✓ Sem credencial: 401 Unauthorized");

  const badAuth = validateCronRequest(new Request("http://localhost/api/jobs/mobile?secret=wrong-token-invalid-12345"));
  if (badAuth.authorized || badAuth.status !== 401) {
    throw new Error("Deveria rejeitar token incorreto com 401");
  }
  console.log("  ✓ Token incorreto: 401 Unauthorized");

  // 2. Testar handlers de rotas diretamente
  console.log("\n[2] Testando todas as rotas com query params e rejeição...");

  // Desativar execução de lógica interna ou simular para checar autenticação
  process.env.MOBILE_OUTBOX_ENABLED = "0"; // fará retornar 503 se passar da auth, mas se auth falhar retorna 401
  process.env.MOBILE_MAINTENANCE_ENABLED = "0"; // fará retornar 503 se passar da auth

  // Mobile
  const mobileUnauth = await getMobileRoute(new Request("http://localhost/api/jobs/mobile"));
  if (mobileUnauth.status !== 401) throw new Error(`/api/jobs/mobile deveria retornar 401 sem secret, retornou ${mobileUnauth.status}`);
  const mobileWithQuery = await getMobileRoute(new Request(`http://localhost/api/jobs/mobile?secret=${TEST_SECRET}`));
  if (mobileWithQuery.status === 401) throw new Error(`/api/jobs/mobile rejeitou secret via query param!`);
  console.log("  ✓ /api/jobs/mobile: aceita secret via query param (status:", mobileWithQuery.status, ")");

  // Mobile Maintenance
  const maintUnauth = await getMaintenanceRoute(new Request("http://localhost/api/jobs/mobile-maintenance"));
  if (maintUnauth.status !== 401) throw new Error(`/api/jobs/mobile-maintenance deveria retornar 401 sem secret, retornou ${maintUnauth.status}`);
  const maintWithQuery = await getMaintenanceRoute(new Request(`http://localhost/api/jobs/mobile-maintenance?cron_secret=${TEST_SECRET}`));
  if (maintWithQuery.status === 401) throw new Error(`/api/jobs/mobile-maintenance rejeitou secret via query param!`);
  console.log("  ✓ /api/jobs/mobile-maintenance: aceita secret via query param (status:", maintWithQuery.status, ")");

  // Operational
  const opUnauth = await getOperationalRoute(new Request("http://localhost/api/jobs/operational"));
  if (opUnauth.status !== 401) throw new Error(`/api/jobs/operational deveria retornar 401 sem secret, retornou ${opUnauth.status}`);
  console.log("  ✓ /api/jobs/operational: rejeita sem credencial");

  // Retention Full
  const retUnauth = await getRetentionRoute(new Request("http://localhost/api/jobs/retention"));
  if (retUnauth.status !== 401) throw new Error(`/api/jobs/retention deveria retornar 401 sem secret, retornou ${retUnauth.status}`);
  console.log("  ✓ /api/jobs/retention: rejeita sem credencial");

  // Retention Trash
  const trashUnauth = await getTrashRoute(new Request("http://localhost/api/jobs/retention/trash"));
  if (trashUnauth.status !== 401) throw new Error(`/api/jobs/retention/trash deveria retornar 401 sem secret, retornou ${trashUnauth.status}`);
  console.log("  ✓ /api/jobs/retention/trash: rejeita sem credencial");

  // Retention History
  const histUnauth = await getHistoryRoute(new Request("http://localhost/api/jobs/retention/history"));
  if (histUnauth.status !== 401) throw new Error(`/api/jobs/retention/history deveria retornar 401 sem secret, retornou ${histUnauth.status}`);
  console.log("  ✓ /api/jobs/retention/history: rejeita sem credencial");

  console.log("\n=== TODOS OS TESTES DE QUERY PARAMS E ROTAS DE CRON PASSARAM COM SUCESSO! ===");
}

runTests().catch((err) => {
  console.error("Erro nos testes:", err);
  process.exit(1);
});
