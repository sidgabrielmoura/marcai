# Instâncias WhatsApp: contrato do backend

## Fonte e limites

O comportamento WAHA segue integralmente [waha-instancias.md](../waha-instancias.md): engine NOWEB, store ativo sem full sync, consulta antes da criação, start/restart/stop, QR PNG, PUT de config e logout antes de DELETE. Por autorização do proprietário do projeto, a única lacuna consultada fora desse documento foi o formato HMAC: SHA512 sobre os bytes originais, resultado hexadecimal, cabeçalhos `X-Webhook-Hmac` e `X-Webhook-Hmac-Algorithm: sha512`. Referência: [documentação técnica oficial](https://github.com/devlikeapro/waha-docs/blob/main/content/docs/how-to/events/index.md).

Esta integração administra conexões e encaminha alertas. Eventos `message` e `message.any` são autenticados e deduplicados, mas não iniciam respostas de IA. Os recibos de `message.ack` preservam o ACK informado; não são confundidos com a aceitação de um envio pela API. Não existe painel de conversas nem confirmação de entrega real sem o webhook correspondente.

## Configuração

- `WAHA_BASE_URL` e `WAHA_KEY`: acesso ao WAHA, exclusivamente no servidor.
- `BASE_URL`: origem pública deste próprio backend. Se ausente, usa `NEXT_PUBLIC_APP_URL`. O caminho `/api/whatsapp/webhooks/{session}` é acrescentado automaticamente. A origem configurada deve ser alcançável pelo WAHA; localhost não é alcançável remotamente. Em produção exige HTTPS.
- `ABLY_API_KEY`: o `Ably.Rest` singleton já existente emite tokens e publica indicações.
- `AUTH_SECRET`: derivação de uma chave de webhook por sessão, com separação de finalidade. A chave da API WAHA não é reutilizada como segredo de webhook. Ao trocar a origem ou o segredo, conectar/atualizar a instância aplica a configuração completa com PUT.

Nunca usar o endereço do WAHA como origem dos webhooks. A configuração pública não é inferida do cabeçalho Host recebido. Valores de segredos, corpos do provedor e URLs privadas não são registrados nos logs de falha deste módulo.

## Ações e rotas

As quatro actions existentes continuam compatíveis. A leitura `getWhatsAppSettingsAction` retorna diretamente o DTO já esperado pelo componente; as mutações retornam `{data}` ou `{error}`. `manageWhatsAppInstanceAction` preserva `connect`, `refresh`, `disconnect` e aceita também `start`, `restart`, `stop`, `delete`. `getWhatsAppQrAction` retorna a imagem e sua expiração aproximada sem consultar periodicamente o status remoto.

| Rota | Contrato |
| --- | --- |
| `POST /api/whatsapp/webhooks/[session]` | Corpo original assinado; aceita `session.status`, `message`, `message.any`, `message.ack`. Responde 202 depois da gravação mínima; publicação Ably acontece com `after`. |
| `GET /api/whatsapp/instances/[id]/token` | OWNER autenticado da organização/unidade. Retorna `{data:{channel,tokenRequest}}`; token de dois minutos, somente subscribe no canal exato. |
| `GET /api/whatsapp/instances/[id]` | Snapshot autorizado de status/revisão/última identidade; não chama o WAHA nem publica invalidação. |
| `POST /api/whatsapp/instances/[id]` | OWNER, Origin igual ao backend; JSON `{operation}` com uma operação permitida. |
| `DELETE /api/whatsapp/instances/[id]` | OWNER e Origin autorizado; logout, DELETE remoto, remoção local auditada. |

Uma instância por unidade ativa; destinatários compartilhados pela conta, no máximo cinco números válidos e distintos. Somente o proprietário pode administrar. Novas sessões usam `INSTANCE-` seguido por 96 bits aleatórios; nomes legados imprevisíveis continuam utilizáveis, evitando sessões órfãs.

## Tempo real e QR

O canal aprovado é `whatsapp:{organizationId}:{locationId}:{instanceId}`. Não há wildcard, permissão de publicação pelo cliente ou acesso de administradores. Eventos `session.status` e `qr.available` carregam apenas ID local, status e revisão. Telefone, nome, corpo de mensagens e imagem do QR não transitam nesse canal nem pelo compartilhamento de abas. O componente reage ao status de espera de QR e o obtém pela action autenticada.

A conexão Ably existe apenas enquanto o modal está aberto e a página visível; inscrição precede a conexão WAHA. O SDK renova tokens mediante nova autorização. Falha de tempo real mantém atualização manual. Somente enquanto `SCAN_QR_CODE`, com modal aberto e página visível, a imagem é renovada ao atingir `qrExpiresAt`, usando os 18 segundos completos da estimativa atual, sem a antecipação anterior de um segundo. O WAHA troca o código a cada aproximadamente 20 segundos; o documento não define configuração para prolongar a validade no provedor.

Fechar o modal preserva a imagem em memória da própria tela, por instância e revisão, até o vencimento original. Reabrir não estende esse prazo nem busca outra imagem válida. Após assinar o Ably, uma leitura autenticada do snapshot local recupera mudanças ocorridas enquanto fechado, sem consultar o WAHA nem adquirir lease de operação. A primeira abertura ainda configura/conecta a sessão; Conectar e Atualizar manuais continuam disponíveis. QR vencido é removido mesmo se outra operação estiver pendente; a renovação aguarda o modal visível. Leituras simultâneas da mesma imagem compartilham uma requisição. Cache limitado a 20 imagens, sem storage persistente ou compartilhamento entre abas, descartado ao vencer, mudar revisão/status, desconectar, falhar a autorização ou desmontar a tela. A tela é remontada ao mudar organização. Não há polling de listas ou status; revisões e contexto descartam respostas antigas.

Se a leitura pelo celular concluir durante uma busca de QR, a imagem pode desaparecer ou a chamada pode ser recusada porque a sessão já está `WORKING`. Nessa exceção, o serviço confere primeiro o estado persistido e, se necessário, consulta a sessão uma única vez. Uma conexão confirmada retorna sucesso com QR nulo e publica a revisão atual; uma falha real enquanto continua `SCAN_QR_CODE` permanece um erro controlado. A interface também descarta falhas de transporte atrasadas após receber `WORKING` com revisão mais recente, sem ocultar erros de autorização. O caminho normal de renovação não ganha uma consulta remota de status.

## Persistência e concorrência

A migração `20261029020000_whatsapp_webhooks` adiciona à instância `connectedPhone`, `connectedName`, `statusEventAt`, `revision`, `operationToken`, `operationUntil`, `configHash`, e cria `whatsapp_webhook_events` com ID único, instância, tipo, horário, dados mínimos e confirmação de publicação. Nenhum QR ou segredo HMAC é persistido. Identificadores de mensagens são resumidos por SHA256; os textos recebidos não são guardados.

Um lease condicional de 90 segundos serializa operações WAHA por instância em todos os workers; rede tem timeout de oito segundos por chamada, sem manter transação aberta na rede. Gravações condicionais por revisão evitam que uma resposta antiga sobrescreva um webhook. Eventos de status são ordenados por timestamp; `me:null` não apaga identidade conhecida. Consultas de status idêntico e renovação de QR não criam novos eventos de status.

O receptor valida HMAC em tempo constante antes do JSON e rejeita eventos fora da janela de cinco minutos, sessão divergente, payload inválido ou corpo acima de 256 KiB. ID único evita reprocessar entregas repetidas. A admissão persiste o status e o recibo na mesma transação; `after` publica mensagens com IDs determinísticos. Falhas ficam pendentes e são reenviadas na próxima oportunidade da instância (webhook repetido/novo ou operação). O snapshot autorizado recupera o estado ao reabrir mesmo se uma indicação for perdida. Não se promete uma fila externa nem retry autônomo durante indisponibilidade contínua.

Recibos publicados são removidos após sete dias, em lotes de até 500, pela manutenção existente; pendências não são apagadas. O rate limit persistente reutiliza `mobile_rate_limits`, com limites por usuário/organização/instância para operações, QR e tokens, e por sessão nos webhooks válidos. Há uma barreira leve em memória antes da autenticação; somente IP encaminhado pela Vercel é tratado como confiável. Essa barreira pré-auth é local ao worker; o limite autenticado é compartilhado no PostgreSQL. Respostas 429 incluem Retry-After nas rotas.

## Validação e publicação

`node scripts/test-database-efficiency.cjs --whatsapp-only` usa PostgreSQL 18 descartável em loopback e fontes reais com autenticação/provedores simulados. Cobre proprietário/tenant/unidade, limites/validação, config, PNG, ciclo, leases, HMAC, repetição/ordem, preservação de identidade, tokens/canais, falhas e exclusão. A suíte geral também executa essa verificação. Fixtures não usam o banco do `.env` nem criam sessões reais.

`npm run test:whatsapp:ui` executa componente e hook reais em Chrome headless, com actions e Ably simulados. Confere custos de reabertura, vencimento original, renovação sem antecipação, isolamento de instâncias, requisições simultâneas, recuperação do snapshot, corrida com WORKING, negação de acesso e limpeza ao desmontar, em desktop e mobile. Não lê `.env` nem acessa banco ou provedores reais.

Aplicar a migração antes do código. Depois da publicação, abrir a instância como proprietário aplica a URL pública e o HMAC à sessão existente com PUT. Pareamento real e recebimento do webhook precisam ser verificados com o celular e o backend alcançável; testes simulados não comprovam isso.
