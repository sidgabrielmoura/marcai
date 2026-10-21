import "dotenv/config";
import { getAblyRest, publishRealtimeNotification, publishToChannel } from "../src/infrastructure/realtime/ably";
import { GET as getAblyTokenRoute } from "../src/app/api/ably/token/route";
import { GET as getMobileCronRoute } from "../src/app/api/jobs/mobile/route";

async function main() {
  console.log("=== INICIANDO VERIFICAÇÃO DA INTEGRAÇÃO DO ABLY EM TEMPO REAL ===");

  // 1. Verificar configuração do cliente Ably
  console.log("\n[1] Verificando cliente Ably REST...");
  const ablyClient = getAblyRest();
  if (!ablyClient) {
    throw new Error("Ably REST não foi inicializado. Verifique ABLY_API_KEY no .env.");
  }
  console.log("  ✓ Ably.Rest inicializado com sucesso.");

  // 2. Testar emissão de token e proteção de segurança
  console.log("\n[2] Verificando endpoint /api/ably/token...");
  const unauthReq = new Request("http://localhost:3000/api/ably/token");
  const unauthRes = await getAblyTokenRoute(unauthReq);
  if (unauthRes.status !== 401) {
    throw new Error(`Esperado status 401 para requisição sem sessão, recebido: ${unauthRes.status}`);
  }
  console.log("  ✓ /api/ably/token rejeita requisições não autenticadas com 401 Unauthorized.");

  // 3. Testar publicação de notificação em tempo real
  console.log("\n[3] Testando disparo de notificação em tempo real via publishRealtimeNotification...");
  const testPayload = {
    organizationId: "org-test-realtime-123",
    userId: "user-test-realtime-456",
    title: "Tarefa Prioritária Atribuída",
    message: "Você recebeu uma nova tarefa para execução imediata.",
    type: "TASK_ASSIGNED",
    priority: "HIGH",
    data: { taskId: "task-abc-789" },
    clickAction: "/tasks/task-abc-789",
  };

  await publishRealtimeNotification(testPayload);
  console.log("  ✓ Notificação em tempo real enviada aos canais Ably (user:user-test-realtime-456:notifications).");

  // 4. Testar canal arbitrário
  console.log("\n[4] Testando publishToChannel...");
  const published = await publishToChannel(
    "org-test-realtime-123:test",
    "ping",
    { time: Date.now() }
  );
  if (!published) {
    throw new Error("Falha ao publicar evento no canal Ably.");
  }
  console.log("  ✓ Evento publicado com sucesso via publishToChannel.");

  // 5. Verificar rota /api/jobs/mobile (desativada/descontinuada)
  console.log("\n[5] Verificando status da rota de cron de notificações (/api/jobs/mobile)...");
  process.env.CRON_SECRET = process.env.CRON_SECRET || "0905748599229Si2026";
  const mobileRes = await getMobileCronRoute(
    new Request(`http://localhost:3000/api/jobs/mobile?secret=${process.env.CRON_SECRET}`)
  );
  const mobileBody = await mobileRes.json();
  if (mobileBody.status !== "DEPRECATED") {
    throw new Error(`Esperado status DEPRECATED na rota mobile cron, recebido: ${JSON.stringify(mobileBody)}`);
  }
  console.log("  ✓ Rota /api/jobs/mobile desativada com resposta explicativa (status: DEPRECATED).");

  console.log("\n=== TODAS AS VERIFICAÇÕES DO ABLY PASSARAM COM SUCESSO! ===");
}

main().catch((err) => {
  console.error("Erro na verificação:", err);
  process.exit(1);
});
