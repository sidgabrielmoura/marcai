# Contrato de acesso a dados e tempo real — Tarefaí

Atualizado em 28/10/2026. Este documento orienta pessoas e IAs que alterem o site `marcai` ou o aplicativo `marcai-emp-app`. Leia também [database-cost-controls.md](database-cost-controls.md) e as auditorias em `docs/audits/database-efficiency/`.

## Objetivo e limites

Consultar o PostgreSQL quando houver necessidade de leitura ou gravação, preservando autorização, escopos, regras operacionais, contagens completas e recuperação após falhas. Quantidade de dados armazenados não determina CU-hours: tempo com o compute ativo e sua capacidade também contam. As mudanças no código precisam ser publicadas para afetar produção. Não há percentual de economia comprovado antes de medir a operação publicada.

O backend canônico é este repositório. O aplicativo mantém `backend-overlay/` como snapshot de teste; ele não é outra fonte do backend. Após mudar código compartilhado, executar no app:

```powershell
node scripts/sync-employee-backend.mjs --refresh-from-source
npm run workflow:check
```

Não aplicar o snapshot na direção app → site. Não usar credenciais ou dados de produção nos testes.

## Fluxo de leitura

1. O servidor autentica a requisição e verifica organização, vínculo, papel e interseção de escopos. Cache de interface nunca substitui esse passo.
2. A primeira leitura monta o recurso visível e sua chave de contexto.
3. Uma mutação valida as regras novamente, grava e retorna o DTO autorizado atualizado quando disponível.
4. O cliente aplica esse DTO ao detalhe. Listas, dependências e totais que não podem ser deduzidos desse DTO são reconciliados pelo seu leitor específico.
5. Ably/FCM carregam indicações de alteração. O cliente agrupa essas indicações e atualiza apenas as famílias afetadas. Uma tela inativa fica desatualizada sem fazer leitura imediatamente.
6. Replay recupera reconexão, retomada e lacuna de entrega; não acompanha cada mensagem de uma conexão saudável no protocolo 2.

Não calcular permissões no cliente a partir de mensagens do Ably. Não enviar DTOs de tarefas, tokens, títulos ou dados pessoais no canal de sincronização da organização ou no BroadcastChannel.

## Contrato dos eventos

| Categoria | Leitores afetados |
| --- | --- |
| `NOTIFICATIONS_CHANGED` | Central de avisos e contador de não lidos |
| `TASK_CHANGED` | Lista/detalhe de tarefas, execuções dependentes, histórico e busca |
| `EXECUTION_CHANGED` | Execuções e tarefas relacionadas, histórico e busca |
| `ALL` | Recuperação completa do contexto ou mudança estrutural/permissões |

Notificações com destino em tarefa/execução incluem também a categoria correspondente. Ably e FCM usam o mesmo `changeId` para a mesma notificação. O identificador de notificação continua preservado para destino e confirmação de recebimento. Categorias podem ser agrupadas; uma mensagem não equivale a uma query.

Mutações mobile retornam o recibo em `X-Change-Id`; `src/core/api.ts` o incorpora ao envelope. Server Actions otimizadas retornam `changeId`. O recibo da própria ação é lembrado e removido da fila pendente, evitando repetir a leitura por seu eco no Ably. IDs recebidos ficam limitados a 500 por contexto; os mapas também têm limites de tamanho. Os IDs são deduplicadores, não uma ordenação global de dados.

`POST tasks/:id/view` continua gravando a auditoria idempotente de visualização, mas não publica alteração operacional dos quadros. Essa auditoria é consultada ao abrir/atualizar os detalhes da gestão. Registro/ACK de aparelho e partes de upload também não devem recarregar os quadros.

O DTO retornado pela ação é autoritativo para aquele recurso. Não inventar um status otimista definitivo antes da confirmação. Preservar idempotência, locks, rodada de correção e validação de anexos.

## Autorização do Ably e compatibilidade

Endpoints: `/api/ably/token` para web e `/api/mobile/v1/realtime/token` para app. A API key fica somente no servidor, que usa `Ably.Rest` singleton. Os tokens duram dez minutos e permitem somente `subscribe` nos três canais autorizados.

Clientes novos solicitam `?protocol=2` e recebem:

```ts
{ protocol: 2, tokenRequest, scopeVersion, contextKey }
```

Somente `tokenRequest` é entregue ao SDK. `scopeVersion` resume papel e escopos ordenados; `contextKey` inclui usuário, vínculo, organização e essa versão. Os hashes são derivados do contexto autenticado da própria requisição, sem uma consulta adicional só para produzi-los. Mudança de versão/contexto interrompe o transporte e força reautorização dos dados. Não cachear a autenticação entre requisições.

Sem o parâmetro, o servidor mantém o TokenRequest antigo. O app mantém recuperação legada quando conversa com um backend anterior. Publicar o backend antes do app. Não mudar silenciosamente esse formato para clientes já instalados.

No protocolo 2, renovar token com o mesmo escopo não chama `/events`. Uma mensagem saudável também não chama `/events`: ela invalida a família diretamente. Conexão inicial/retomada/reconexão e attach sem continuidade fazem recuperação. Falhas usam backoff; estado oculto/segundo plano fecha a conexão e cancela requisições pendentes. HTTP 401/403 não entra em repetição automática de uma sessão inválida.

SSE é fallback, com cursor e checkpoint completos compatíveis com versões antigas. Seus eventos web incluem categorias do replay; snapshot/lacuna/mudança de escopo usa `ALL`. Backoff não deve ser reiniciado só porque o HTTP abriu.

## Site

`src/presentation/realtime/resource-events.ts` centraliza categorias, deduplicação e relação entre rotas e recursos. `use-realtime-events.ts` agrupa mensagens por 350 ms e encaminha ao dono do recurso visível.

As páginas `/tasks`, `/management/tasks` e `/overview` recebem dados iniciais do servidor e usam `Live*Board` + `useLiveResource`. Seus leitores são Server Actions em `live-board-actions.ts`, com autenticação em cada chamada. Alterações de tarefas não refazem a página e o shell inteiros. Não há timer consultando os quadros. Leituras simultâneas do mesmo quadro são agrupadas; alterações durante uma leitura provocam uma reconciliação posterior, sem sobreposição. Uma falha aguarda o próximo evento/retomada ou atualização manual.

Catálogos de filtros da gestão/visão geral são reutilizados por até dez minutos na interface. `ALL` renova esses catálogos imediatamente. O cache não dá acesso a registros: o leitor continua aplicando o escopo vigente. Se o hash autenticado do leitor mudar, a página é recarregada para reconstruir o contexto.

`task-resource.ts` mantém detalhes por até 60 segundos, limita o cache a 30 itens, agrupa leituras concorrentes e protege o DTO da mutação contra uma leitura anterior atrasada. Eventos de tarefa invalidam inclusive detalhes fechados. Conclusão, início e assumir tarefa como colaborador retornam o detalhe atualizado. Drawer/detalhe e botões rápidos consomem a resposta; listas e totais reconciliam separadamente.

As demais telas mantêm fallback de atualização da rota quando a categoria realmente a afeta. Um aviso não recarrega `/tasks`, `/overview` ou configurações. Não afirmar que toda Server Action legada deixou de usar `revalidatePath`/`router.refresh`: essas rotas continuam existindo para preservar consistência de fluxos não convertidos.

O shell atualiza contadores separadamente. Alteração apenas de aviso busca somente o contador de não lidos; alterações operacionais reconciliam também os totais necessários. Marcar aviso lido não invalida mais todos os quadros.

### Compartilhamento entre abas

`tab-transport.ts` usa Web Locks e BroadcastChannel. Cada aba visível autentica seu contexto antes de participar. Uma aba por hash mantém o transporte; as demais recebem somente categorias e `changeId`. Usuários, vínculos, organizações ou escopos diferentes usam grupos diferentes. A seleção é por contexto verificado no servidor, nunca por nome de exibição.

A aba líder libera a lease quando fica oculta ou é encerrada. A próxima assume, renova uma autorização antiga antes de conectar e reconcilia o intervalo quando necessário. Nenhum token é compartilhado. Navegadores sem as duas APIs mantêm um transporte por aba visível, com o mesmo isolamento e limpeza. Compartilhar transporte não elimina a leitura autorizada de recursos que estão efetivamente visíveis em duas abas.

## Aplicativo

### Instâncias WhatsApp (28/10/2026)

O contrato das rotas, segurança, ciclo de sessão e operação está em [whatsapp-instances-backend.md](whatsapp-instances-backend.md). WAHA segue [waha-instancias.md](../waha-instancias.md); a implementação não introduz um backend paralelo.

Instâncias e até cinco destinatários por organização são exclusivos de OWNER, autorizado a cada action/rota. A unidade deve pertencer à organização e estar ativa. Criação local começa em PENDING; nomes remotos novos são INSTANCE- mais 96 bits aleatórios. Uma unidade tem uma instância. O client WAHA é único, somente no servidor, com X-Api-Key, timeout, limite de resposta e erro sanitizado. Configuração completa (NOWEB store, metadata, webhooks assinados) é aplicada com PUT quando muda. Logout precede DELETE para excluir uma sessão.

Webhooks em /api/whatsapp/webhooks/[session] verificam HMAC-SHA512 do corpo original antes de processar JSON. Recibos persistentes por ID tornam o processamento idempotente; timestamp/revisão evitam regressão de status e me:null preserva a última identidade. Admissão e estado são gravados na mesma transação; Ably é publicado depois da resposta com after. Pendências são reconciliadas na próxima oportunidade da instância, sem cron de polling novo. A manutenção existente remove somente recibos publicados com mais de sete dias, até 500 por execução.

O canal whatsapp:{organizationId}:{locationId}:{instanceId} é assinado somente pelo proprietário, com token de dois minutos e capability subscribe no canal exato. Carrega somente status, revisão e indicação de QR disponível; nunca imagem, telefone ou mensagens privadas. A conexão do modal fecha ao ocultar/sair. Somente enquanto SCAN_QR_CODE e com modal e página visíveis, a imagem PNG é renovada por action autenticada ao atingir qrExpiresAt (estimativa de 18 segundos, sem antecipar um segundo). O provedor troca QR a cada aproximadamente 20 segundos; esse prazo não é configurável pelo contrato documentado. Essa é a exceção restrita, sem polling de status, listas ou quadros. QR não é persistido.

O modal mantém até 20 imagens em memória da própria tela, isoladas por instância/revisão, com expiração original preservada ao fechar/reabrir. Após a inscrição Ably, reabrir uma instância já inicializada reconcilia o snapshot local autorizado, sem WAHA/lease/escritas de operação; a imagem válida é reaproveitada. Uma nova revisão/status, desconexão, erro de autorização, vencimento ou desmontagem remove o cache; mudança de organização remonta a tela. Leituras de QR concorrentes compartilham a requisição. Página/modal inativos não renovam a imagem. Testes de custo desse fluxo: scripts/verify-whatsapp-ui.cjs, com transportes sintéticos e relógio controlado.

As operações usam lease por instância e limites persistentes reaproveitando mobile_rate_limits, sem rede dentro de transações. Consultas de status idêntico e renovação de QR não materializam novos eventos de status. GET do snapshot não chama WAHA nem publica invalidação. Envio usa a sessão da unidade da tarefa/execução e contatos da própria organização; check-exists resolve o chatId antes do envio. Nenhuma sessão global serve como fallback entre unidades.

A migração 20261029020000_whatsapp_webhooks deve preceder o backend atualizado. BASE_URL (ou NEXT_PUBLIC_APP_URL) é a origem pública deste próprio backend; WAHA_BASE_URL e WAHA_KEY configuram o provedor. Segredos nunca chegam ao navegador. Testes de ciclo, autorização, deduplicação, custo e canais: scripts/verify-whatsapp.ts, incluído no executor descartável com --whatsapp-only e na suíte geral.

### Entrega de push e sessões (28/10/2026)

As transações que criam notificações usam `notificationTransaction`. O wrapper captura os IDs retornados por `create`/`createManyAndReturn` e agenda a entrega com `after` somente depois do commit; fora do Next, aguarda o processamento. Rollback não dispara. Não adicionar um disparo separado ao lado de `tx.notification.create` nem transformar avisos em queries periódicas. Novos pontos de escrita precisam usar o wrapper, inclusive quando chamam `notifyManagers`, `materializeProcessTasks` ou `synchronizeExecution` indiretamente.

O disparo reclama apenas esses IDs na outbox existente. A atualização condicional impede dois processadores de entregarem o mesmo aviso; não varre a fila histórica, não reativa `/api/jobs/mobile` e não adiciona cron/retry periódico. `processPushBatch` é uma entrada descontinuada sem processamento. A aceitação pelo provedor vira `PROVIDER_ACCEPTED`, falhas parciais e erros têm estados próprios, e ausência de aparelho vira `SKIPPED_NO_DEVICES` com zero tentativas de transporte. Recebimento/abertura nativos continuam dependentes de ACK. Falha no transporte não transforma uma mutação já confirmada em erro da ação.

Tokens web ficam vinculados a `web_auth_sessions` por `user_device_tokens.session_id`. Registro e logout disputam a mesma linha de sessão; logout remove somente as inscrições dessa sessão. Troca de conta substitui e revoga a sessão anterior; registro exige que a sessão esperada pelo cliente coincida com a autenticada. O envio filtra organização, sessão vigente, status e versão de credenciais. Tokens legados sem sessão não são elegíveis até a próxima inscrição ao reabrir o site.

O registrador pertence aos layouts autenticados e muda com `sessionId`. Permissão não equivale a inscrição: o estado ativo exige token gravado. O consentimento é solicitado pelo clique do usuário; permissão previamente concedida permite sincronização automática no login. Não há consulta extra por foco/reconexão nem polling de inscrição.

No web, FCM envia indicação com IDs e texto genérico. Primeiro plano e background usam o mesmo Service Worker, que busca o conteúdo em `/api/push/notification` antes de exibir e novamente antes de navegar. O endpoint exige a mesma sessão e projeta o aviso conforme a autorização atual, com `private, no-store`. Essa leitura acontece por entrega/clique, não refaz quadros. Avisos pendentes de sessão encerrada são descartados; a saída do layout fecha os alertas exibidos da própria sessão. Tokens e textos privados não são publicados em canais compartilhados de abas.

A migração `20261028190000_push_session_binding` deve preceder o código novo. `NEXT_PUBLIC_FIREBASE_VAPID_KEY` precisa estar no ambiente de build; a credencial Admin fica somente no servidor. A cobertura está em `scripts/verify-push-notifications.cjs` (fontes reais com transportes simulados) e `scripts/verify-push-database.ts` (PostgreSQL 18 descartável, incluindo concorrência de logout/registro). O teste de banco integra o executor de eficiência. Validar a entrega real e as credenciais da hospedagem depois da publicação.

`src/core/query.ts` centraliza validade e invalidação. Chaves começam por `[userId, organizationId, family, ...]`. O provedor de sessão limpa queries e filas na troca de contexto. As telas desabilitam queries quando fora de foco. Não reinstalar refetch automático por foco/rede em cada tela: a reconciliação central já trata a retomada.

| Família | Validade de interface |
| --- | --- |
| Tarefas, detalhes, execuções e avisos | 60 segundos |
| Busca | 30 segundos |
| Histórico | 5 minutos |
| Equipes, unidades e configurações, quando usadas | 10 minutos |

Esses tempos indicam até quando uma leitura existente é considerada fresca. Não são intervalos de polling. Eventos relevantes tornam o recurso desatualizado imediatamente. A coleta de cache ocorre após 15 minutos sem uso.

`applyTaskResponse` grava o detalhe devolvido pela ação e atualiza registros presentes nas páginas carregadas. Mantém reconciliação da lista ativa porque contagens, ordenação, dependências e tarefas de processo podem mudar. Não substituí-la por remoção ingênua de um cartão ou por totais parciais. Nunca invalidar organizações/sessão/avisos indiscriminadamente após uma operação de tarefa.

FCM e Ably alimentam a mesma fila, com agrupamento de 350 ms. A confirmação de recebimento do push continua independente: deduplicar leitura não significa perder o ACK. Abrir um aviso usa o detalhe já autorizado para a navegação, sem baixar o mesmo detalhe de novo. Marcar lido afeta somente avisos.

`installation-sync.ts` registra o aparelho ao mudar usuário/organização/instalação, token, permissão, ambiente, plataforma ou versão; estado idêntico não causa novo POST/DELETE a cada retorno ao app. Há reconciliação após 24 horas quando houver nova oportunidade de sincronização. Não há timer de 24 horas. A sincronização manual continua forçando uma conferência. Rotação durante uma requisição fica pendente e é processada em seguida. O registro do contexto novo aguarda a requisição do antigo terminar para preservar a ordem das gravações. Respostas de contexto antigo não atualizam o estado novo. Tokens de push permanecem apenas em memória nesse controle.

## Regras obrigatórias para futuras alterações

O operacional usa [agenda e sinais transacionais](operational-scheduler.md), com [plano registrado](operational-scheduler-plan.md). Antes de alterar mutações ou agendamentos, conferir a cobertura de triggers da migração `20261027180000_selective_operational`. Preservar o ciclo vazio com uma consulta/zero escritas, a revisão da agenda, o ACK apenas de IDs confirmados e a recuperação de horários. Não substituir sinais por watermark nem criar polling/cron no app. O backend permanece canônico.

- Manter autorização atual no servidor, filtros multi-tenant e interseção de escopos. Não usar cache global para permissões.
- Informar a família alterada e reutilizar o DTO da mutação. Usar `ALL` quando a abrangência não puder ser determinada com segurança.
- Server Actions legadas continuam usando o wrapper `@/infrastructure/realtime/revalidate` após o commit; o alvo de superadmin deve ser autorizado explicitamente. Os caminhos otimizados de início/conclusão usam resposta DTO + indicação de sincronização; o marcador interno evita repetir revalidações de página da aplicação compartilhada.
- Não adicionar polling periódico, replay por mensagem/renovação saudável ou GET duplicado depois de uma mutação que já retornou o DTO.
- Não publicar payload privado em canais de organização nem no compartilhamento entre abas; não guardar credenciais em cache de consultas, documentos ou logs.
- Selecionar só as colunas necessárias, paginar listas e agrupar leituras de relações. Estatísticas devem continuar completas; `take` arbitrário não é otimização válida de um total.
- Cancelar trabalho ao sair de foco/contexto e descartar respostas atrasadas. Não reativar cron, worker antigo ou loops de retry para mascarar um erro.
- Atualizar este contrato, os testes e o snapshot quando a arquitetura mudar.

## Validação e medição

No app: `npm run typecheck`, `npm test`, `npm run workflow:check`. Os testes de custo estão em `tests/database-cost-architecture.test.mjs`, `tests/database-cost-clients.test.mjs` e `tests/realtime*.test.mjs`; usam dados sintéticos e incluem QueryClient real, deduplicação, cache, perda de escopo, instalação e eleição entre abas.

No site: `node scripts/test-database-efficiency.cjs` e `node scripts/test-database-efficiency.cjs --build --webpack`. O executor usa PostgreSQL 18 descartável em `127.0.0.1:56433`, sem carregar `.env` e sem credenciais externas. Caso o banco de testes seja antigo, `--reset` recria seu schema a partir do baseline atual; esse comando apaga somente as fixtures desse banco local fixo. Não alterar isso para apontar a uma URL de produção.

Após publicar, comparar janelas de mesma duração e tráfego: CU-hours por hora/dia, tempo ativo do compute, chamadas de token/events/tarefas/avisos, latências e falhas. Com a plataforma sem uso, confirmar que não existem crons/abas/apps/clientes SQL despertando o banco e que Scale to zero foi salvo no Neon. Uma conexão visível com renovação a cada dez minutos ainda pode acordá-lo. O gasto acumulado exibido no painel não diminui quando uma correção é aplicada.

Validação nativa em Android/iOS e os gráficos de produção precisam de uma publicação e observação reais; testes locais não comprovam esses resultados.

Referências: [autenticação Ably](https://ably.com/docs/auth/token), [continuidade e recuperação](https://ably.com/docs/connect/states), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) e [gerenciamento de compute/Scale to zero no Neon](https://neon.com/docs/manage/endpoints/). Para Next.js, consultar os guias da versão instalada em `node_modules/next/dist/docs/`.
