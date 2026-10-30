# Reutilização do QR e redução de chamadas — 29/10/2026

## Alteração

O modal preserva em memória o QR válido por instância/revisão, mantendo o vencimento original ao fechar/reabrir. A imagem é removida no vencimento e não é renovada com modal fechado ou página oculta. A renovação usa os 18 segundos completos de `qrExpiresAt`, em vez de antecipar um segundo. O documento `waha-instancias.md` informa troca de QR a cada aproximadamente 20 segundos e não prevê configuração para ampliar a validade real; esse comportamento do provedor não foi alterado.

Após assinar o Ably, reabrir uma instância inicializada recupera o snapshot local autorizado. Isso substitui a repetição de `manage(connect/refresh)` e suas chamadas WAHA. A primeira abertura e as ações manuais continuam operando a sessão. Uma indicação saudável não provoca snapshot extra; perda de continuidade reconcilia uma vez. O snapshot continua sujeito à autorização e ao rate limit existentes.

| Cenário | Custo confirmado na fixture |
| --- | --- |
| Reabrir com QR válido | Zero actions de operação e zero buscas de imagem; uma leitura de snapshot local, além da autorização Ably |
| Modal fechado ou página oculta | Zero renovações de QR |
| QR vencido ao reabrir | Uma renovação após recuperar o snapshot, sem reconectar a sessão |
| Fechar/reabrir durante busca pendente | Reutiliza a busca em andamento da mesma instância |
| Indicação duplicada / attach com continuidade | Sem operação, snapshot ou QR adicional |

Cache limitado a 20 imagens da tela montada, sem localStorage/sessionStorage ou compartilhamento entre abas. Vencimento, revisão/status diferentes, desconexão, erro de autorização e desmontagem descartam a imagem. A organização identifica a montagem da tela. Respostas atrasadas não atravessam a seleção vigente.

## Validação

- `npm.cmd run typecheck`: passou.
- `node scripts/verify-whatsapp-ui.cjs`: passou em 1200 px e 390 px, executando componente/hook reais, relógio controlado e actions/Ably sintéticos.
- Cobertura: vencimento original e ausência de antecipação, reabertura válida/vencida, isolamento de instâncias, deduplicação de requisições pendentes, recuperação de WORKING enquanto fechado, revisão antiga/erro de QR após WORKING, negação de acesso, desmontagem e página oculta.
- `git diff --check` nos arquivos alterados: passou.

Não foi necessário alterar schema, banco ou contratos de API. Os testes não carregam `.env`, não consultam o banco e não criam sessões WAHA reais. A validade e o pareamento reais dependem do provedor e não são comprovados pelas fixtures.
