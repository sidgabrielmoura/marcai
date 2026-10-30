# Investigação de notificações push — 28/10/2026

## Escopo e método

Inspeção do código atual e do PostgreSQL indicado pelo `DATABASE_URL` efetivo, carregando o ambiente como o Next.js com `@next/env`. A conexão é remota, no Neon. As consultas foram executadas dentro de uma transação `READ ONLY`, encerrada com `ROLLBACK`. Não foram enviados pushes, alterados registros, executados jobs ou expostos tokens, credenciais, nomes de usuários e conteúdo de avisos.

O `ECONNREFUSED` da investigação anterior não demonstrava banco vazio nem comprovava que o banco utilizado pelo site estava offline. A consulta atual teve sucesso. Não há evidência suficiente para determinar qual conexão produziu aquele erro anterior.

## Resultado observado no banco

| Indicador | Resultado |
| --- | --- |
| Tokens web (`user_device_tokens`) | 5 |
| Usuários com tokens web | 2 |
| Tokens web com uso nos últimos 45 dias | 5 |
| Notificações persistidas | 22 |
| Notificações criadas nos últimos 7 dias | 22 |
| Avisos cujo destinatário tem token web atualmente | 14 |
| Registros em `notification_deliveries` nos últimos 7 dias | 0 |
| Instalações nativas | 1 |
| Instalações nativas não revogadas, com permissão e sincronização recente | 1 |
| Itens em `mobile_push_outbox` | 22, todos `QUEUED` |
| Registros em `mobile_push_deliveries` | 0 |

Tipos persistidos: `TASK_ASSIGNED` (11), `TASK_COMPLETED` (6), `OPERATIONAL_ALERT` (2), `TASK_OVERDUE` (2) e `TASK_CANCELLED` (1).

Ter um token registrado não comprova que ele ainda seja válido no Firebase. A associação dos 14 avisos é a observada na consulta atual; não comprova que os tokens existiam no momento de criação desses avisos. A elegibilidade da instalação acima não inclui validação da sessão nativa.

## Falhas e lacunas confirmadas no código

### Persistência sem um caminho ativo de envio em alguns fluxos

`synchronize-execution.ts` grava avisos de desbloqueio de tarefa e conclusão de execução, mas não chama o envio de push. `execution-lifecycle.ts` faz o mesmo para cancelamento/reabertura de execução; a ação que o chama apenas revalida as telas depois da transação. O endpoint mobile `POST installations/test` grava o aviso e retorna `QUEUED`, sem chamar o envio imediato.

A trigger `mobile_notification_event`, introduzida em `20261013190000_mobile_employee`, insere os avisos na fila antiga. Entretanto, `processPushBatch` não tem pontos de chamada no código atual e `/api/jobs/mobile` retorna `DEPRECATED`. Não reativar esse cron para mascarar a cobertura incompleta do disparo imediato.

Referências: [sincronização](../../src/application/tasks/synchronize-execution.ts), [ciclo da execução](../../src/application/processes/execution-lifecycle.ts), [ação de execução](../../src/presentation/actions/process-actions.ts), [API mobile](../../src/app/api/mobile/v1/[...path]/route.ts), [job desativado](../../src/app/api/jobs/mobile/route.ts).

### Fluxo imediato sem rastreabilidade suficiente

Os pontos que chamam `dispatchNotificationAsync` normalmente descartam sua Promise com `void`; parte deles chama o disparo ainda dentro da transação de negócio. Sem `await` ou trabalho acompanhado pelo ciclo da requisição, o término da resposta pode interromper tarefas em hospedagem serverless. O disparo dentro da transação também pode preceder seu commit ou ocorrer apesar de um rollback. São riscos identificados no código, não a comprovação do motivo de cada falha em produção.

`dispatchNotificationAsync` não cria registros de entrega. Ele recebe `successCount`, `failureCount` e `errors` de `sendWebPushNotification`, mas só processa a lista de tokens inválidos. Uma rejeição individual por configuração/payload pode ser descartada sem log ou persistência. Assim, a ausência de registros de entrega no banco não demonstra que nunca houve tentativa de envio.

O serviço `sendNotification` tem outro comportamento, com registros de entrega, mas não possui pontos de chamada encontrados em `src`. Não usar a existência desse serviço para concluir que as ações atuais registram resultados do provedor.

Referência: [serviço de notificações](../../src/infrastructure/notifications/notification-service.ts).

### Vínculo com a conta e logout

`saveDeviceTokenAction` usa o token como chave única e transfere seu `userId` para a sessão autenticada quando executado. Isso evita dois donos simultâneos para o mesmo token, mas não garante o ciclo completo de login/logout.

`removeDeviceTokenAction` existe, porém não tem chamadas em `src`. O logout chama `clearSession`, que apaga o cookie e revoga a sessão sem remover o token. As consultas de tokens do disparo imediato filtram por usuário, sem conferir a sessão web que originou o registro. Portanto, o encerramento da sessão não impede a seleção desse token para novos avisos da conta anterior.

O registrador fica no layout raiz, limita a inscrição automática por uma referência da montagem e não acompanha a identidade da conta. Uma navegação de logout/login que preserve a montagem pode não transferir o token para a nova conta. O hook ainda define `isSubscribed` pela permissão do navegador antes de confirmar a gravação do token.

A correção deve preservar outros aparelhos do usuário e considerar registro em andamento, troca de conta entre abas e mensagens já em trânsito. Remover todos os tokens do usuário ou depender apenas do `upsert` não atende a esse isolamento.

Referências: [ações de token](../../src/presentation/actions/push-notification-actions.ts), [logout](../../src/presentation/actions/auth-actions.ts), [sessão](../../src/infrastructure/security/session.ts), [registrador](../../src/presentation/components/shared/push-notification-registrar.tsx), [hook](../../src/hooks/use-push-notifications.ts).

## Configuração Firebase: o que foi e não foi validado

- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` está ausente no ambiente local efetivo. Não foi comprovada sua ausência no build publicado. O SDK admite chave padrão, mas alguns serviços de push exigem chave própria; sua ausência não comprova falha universal, especialmente com cinco tokens persistidos. [Referência oficial de `GetTokenOptions`](https://firebase.google.com/docs/reference/js/messaging_sw.gettokenoptions).
- A credencial local é obtida de arquivo JSON. O SDK Admin consegue interpretá-la e a chave privada é sintaticamente válida. Projeto do Admin, ambiente público e Service Worker coincidem; o sender ID do Service Worker também coincide com o ambiente público. Isso é validação offline, não comprovação de que a credencial não foi revogada ou de que possui permissão de envio.
- O ambiente local não define a credencial em `FIREBASE_SERVICE_ACCOUNT_KEY` nem o par completo `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`. O arquivo JSON está ignorado no Git. Não inferir que ele estará presente na hospedagem nem concluir que produção está sem credenciais: o ambiente publicado ainda precisa ser inspecionado.
- `firebase-admin.ts` envia destinos relativos, como `/notifications`, em `webpush.fcmOptions.link`. A referência oficial exige URL HTTPS. É uma incompatibilidade que precisa ser corrigida e validada; não foi capturada resposta real do provedor que a confirme como causa da falha observada. O validador local instalado não verifica esse campo. [Referência oficial de `WebpushFcmOptions`](https://firebase.google.com/docs/reference/admin/node/firebase-admin.messaging.webpushfcmoptions).
- O Service Worker já tinha uma alteração local de SDK `10.13.0` para `12.19.0` antes desta investigação. Ela foi preservada. A diferença de versões, isoladamente, não foi demonstrada como causa.

## Estado ao fim do diagnóstico inicial

A hipótese de ausência total de tokens/notificações foi descartada para o banco configurado. Existem falhas demonstráveis de cobertura de envio e isolamento de conta. A rejeição concreta de FCM nos fluxos que já chamam o disparo imediato ainda não foi observada.

Próxima validação necessária: inspecionar credenciais/VAPID do ambiente publicado e capturar um resultado FCM de uma ação elegível, distinguindo falha de credencial, permissão, token e payload. A configuração da conta Firebase, o recebimento no navegador e o isolamento de notificações em trânsito ainda não foram validados. Nenhuma correção de runtime foi aplicada nesta etapa.

## Correções implementadas após o diagnóstico

- A VAPID pública fornecida pelo usuário foi gravada no `.env`, validada como chave P-256 e conferida no carregamento do Next. O arquivo segue fora do Git. Os dois imports do Service Worker e a dependência instalada usam Firebase 12.19.0.
- `notificationTransaction` acompanha as criações de aviso dos fluxos web, mobile, processos e agendador. O envio ocorre após o commit, usando `after` no Next. A criação em lote retorna os IDs reais; rollback não dispara. Foram removidas as chamadas paralelas de envio que podiam ocorrer antes do commit e duplicar notificações.
- O disparo processa somente os IDs recém-confirmados, com uma disputa condicional na outbox; não drena avisos antigos e não usa polling. `processPushBatch` permanece descontinuado. Falhas de envio não invalidam uma mutação de negócio já concluída.
- O serviço registra estados e códigos de erro seguros, sem tokens nem conteúdo de credenciais nos logs. Diferencia aceitação pelo Firebase, falha, falha parcial, política, perda de acesso e ausência de aparelhos. O SDK envia em lotes de até 500 e preserva sucessos de lotes anteriores se um lote posterior falhar. Links são absolutos HTTPS ou omitidos no desenvolvimento HTTP.
- `TASK_COMPLETED` passou a integrar a política de push; desbloqueio, conclusão/cancelamento/reabertura de execução e teste mobile agora possuem caminho de envio ativo.
- A migração `20261028190000_push_session_binding` adiciona o vínculo opcional à sessão e seu índice/FK. Token sem sessão não é elegível. O logout remove somente os tokens da sessão encerrada. O registro toma o mesmo lock, verifica sessão vigente e rejeita o contexto anterior. Rotação remove somente o token anterior da própria sessão.
- O registrador foi movido para os layouts autenticados e acompanha a sessão. A interface só confirma ativação depois da inscrição persistida e permite repetir a tentativa em caso de erro. A permissão é solicitada pelo clique do usuário.
- O push web contém indicação sem título/corpo privados. Foreground e background passam pelo mesmo Service Worker, com deduplicação. O endpoint de conteúdo verifica sessão, usuário, organização e acesso atual; o clique valida novamente. Encerramento da sessão bloqueia mensagens ainda em apresentação e fecha seus alertas locais.

### Validação

`node scripts/verify-push-notifications.cjs`: testes com as fontes reais e dependências simuladas, incluindo lotes, falha parcial, transação/rollback, registro/logout, autorização do endpoint e mensagens em trânsito no Service Worker.

`node scripts/test-database-efficiency.cjs`: PostgreSQL 18 descartável em `127.0.0.1:56433`, sem `.env`, credenciais externas ou dados reais. Inclui teste real de lock concorrente entre registro/logout, preservação de outro dispositivo, exclusão de inscrições legadas/revogadas/expiradas, idempotência de entrega, criação em lote, rollback e rastreabilidade de erros. Inclui também tipos, domínio, operacional, regressões, histórico, eficiência, agendador seletivo e comparação de schema.

Resultados finais: suíte completa do site e comparação de schema aprovadas; testes específicos de push repetidos após a revisão final, aprovados; build com `--webpack` aprovado. No app, snapshot de 207 arquivos sincronizado e verificado, `workflow:check` e tipos aprovados, **322 testes aprovados, zero falhas**. A fixture SQL do app foi regenerada offline e os dois inicializadores sintéticos passaram a aplicar a nova migração. O guard do snapshot inicialmente identificou 52 diferenças de LF/CRLF; todas foram comparadas com os hashes originais antes da normalização, sem sobrescrever conteúdo divergente. Evidência resumida em [push-validation-2026-10-28.json](push-validation-2026-10-28.json).

O Service Worker também bloqueia mensagens legadas com payload `notification` antes da apresentação automática do Firebase. Fechar uma aba não encerra a inscrição de outra aba: a notificação de saída é conferida contra o cookie de sessão em `/api/push/session`. Tanto esse endpoint quanto o de conteúdo usam `private, no-store`. Esses cenários foram incluídos nos testes de apresentação.

### Publicação e limites

Aplicar a migração antes do backend novo, configurar VAPID no build publicado e a credencial Admin na hospedagem, então publicar o backend. Inscrições web antigas precisam ser renovadas ao reabrir o site; isso evita manter aparelhos sem vínculo com sessão. O snapshot do app deve ser sincronizado na direção site → app. Testes locais simulam FCM; não demonstram entrega em navegador/aparelho real nem comprovam permissões da conta Firebase na hospedagem. Os 22 avisos antigos não são reenviados automaticamente.
