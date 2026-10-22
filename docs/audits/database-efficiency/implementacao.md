# Auditoria de custo do banco — Tarefaí

Data: 21–22/10/2026. Projeto local: `marcai`. Projeto Neon: `snowy-sky-67506524`, branch `production` (`br-round-frog-av3fsyp9`).

## Conclusão e limites da análise

O sinal principal é **computação**, não volume armazenado. Nos números fornecidos, desde 30/09:

| Medida | Tarefaí | AtlasFit | Leitura |
| --- | ---: | ---: | --- |
| Computação | 85,53 CU-h | 43,73 CU-h | Tarefaí consome 95,6% a mais; diferença de 41,80 CU-h |
| Armazenamento | 43,19 MB | 71,86 MB | Tarefaí armazena menos |
| Histórico | 1,38 MB | 10,97 MB | Histórico não explica a diferença de computação |
| Transferência | 949,01 MB | 1,8 GB | Tarefaí também transfere menos no acumulado informado |
| Faixa de compute | 0,25–8 CU | 0,25–8 CU | Mesmo teto configurado; não informa o consumo instantâneo |

A tarifa Launch consultada de US$ 0,106/CU-h representa aproximadamente US$ 9,07 e US$ 4,64 **apenas de computação** nesses acumulados, sem incluir outros componentes, créditos ou impostos. Não é uma reconstrução da fatura. Fonte: [Neon Pricing](https://neon.com/pricing).

CU-h combina tamanho do compute e tempo ativo. Poucos dados não impedem consumo elevado se consultas frequentes mantêm o endpoint acordado. O Neon suspende o compute após inatividade conforme a configuração; consultas periódicas podem impedir essa suspensão. Fonte: [Neon Scale to Zero](https://neon.com/docs/introduction/scale-to-zero).

Foram confirmados desperdícios no código, descritos abaixo. Não houve acesso autenticado às curvas de compute, frequência real dos agendadores, logs de produção ou configuração efetiva de autosuspend. Portanto, não é possível atribuir uma porcentagem da fatura a cada causa ou prometer uma economia mensal.

## Investigação da plataforma

Foram examinados schema, índices, autenticação web/mobile, escopos por organização/unidade/equipe, tarefas avulsas e de processos, execuções recorrentes, evidências, correções, aprovações, histórico, pesquisa, notificações, Ably, fallback SSE, login QR, uploads e rotinas de manutenção/retenção.

O projeto usa Next.js 16, Prisma 7 com adaptador `pg`, PostgreSQL, Ably, push e armazenamento de arquivos. A API mobile possui várias operações no mesmo catch-all; contar arquivos de rota não equivale a contar endpoints. O [inventário estático](inventory.json) registra as chamadas encontradas e sua localização. Spreads, helpers e SQL com tagged templates precisam de revisão manual; ausência de `take` não significa automaticamente consulta incorreta.

Os princípios da implementação do AtlasFit foram reaproveitados: projeções menores, consultas em lote, reutilização limitada à mesma leitura, controle de atualizações, coordenação de jobs, tentativas espaçadas, observabilidade e validação isolada. Rotinas financeiras, gateways e importações específicas do AtlasFit não foram transplantadas para a operação de tarefas.

### Diagnóstico de produção somente para leitura

O script `scripts/audit-database-cost.cjs` exige `--read-only`, usa transação somente leitura, timeout por comando e consultas limitadas de metadados/agregados. Não altera parâmetros, instala extensões, limpa dados, reinicia estatísticas ou executa `EXPLAIN ANALYZE` em produção. Credenciais e valores de parâmetros não são exportados.

Na coleta de `2026-10-22T02:03:17Z`:

- PostgreSQL 18.6; tamanho físico retornado por `pg_database_size`: 19.177.472 bytes. Esta métrica tem escopo diferente do armazenamento informado pelo painel Neon.
- Estimativas das estatísticas: 57 tarefas, 19 usuários e 3 organizações; 368 notificações e 132 eventos mobile.
- `temp_files=0`, `temp_bytes=0`, `deadlocks=0`; não há evidência desses problemas nessa coleta. Isso não é uma medição completa de memória ou CPU.
- `tasks.seq_scan=207663`, `xact_commit=820863`. São contadores acumulados com janela desconhecida, não taxas por segundo. Em tabelas de poucas dezenas de linhas, varredura sequencial pode ser a decisão correta do planejador; o problema investigado é também a repetição da consulta.
- O maior objeto era `mobile_upload_chunks`, aproximadamente 5,5 MB. O agregado de uploads mostrou 7 incompletos expirados e 1 finalizado. A manutenção existente não deve remover anexos finais ainda referenciados.
- Foram vistos 31 itens `QUEUED` no outbox. No ambiente local, `MOBILE_OUTBOX_ENABLED` e `MOBILE_MAINTENANCE_ENABLED` estavam desativados e Ably estava configurado. Isso **não comprova os valores das variáveis em produção**. A rota do worker mobile antigo já está descontinuada; reativá-lo sem reconciliar o transporte atual pode duplicar entregas.
- As consultas a `pg_stat_statements` não estavam disponíveis. Não foi instalada a extensão para esta auditoria.

A segunda coleta, `2026-10-22T02:53:39Z`, retornou outra identificação de build do servidor e contadores muito menores (602 commits). Houve reinicialização/reset entre as amostras; **elas não podem ser subtraídas para calcular economia ou frequência**. O script agora também registra `pg_postmaster_start_time()` para ajudar nas próximas comparações.

## Problemas encontrados e implementações

### 1. Leituras de sessão e autorização repetidas

Antes, a validação web fazia consultas separadas para sessão, usuário e vínculo, e a resolução do contexto voltava a carregar dados completos. No mobile, a autenticação carregava o vínculo e depois reconstruía o mesmo contexto por outra busca.

Implementado:

1. Validação web consolidada em um SQL parametrizado com as verificações de sessão, revogação, expiração, usuário, vínculo, papel, organização e versão das credenciais.
2. Projeção explícita dos campos necessários ao contexto e à autenticação, incluindo a verificação de segundo fator.
3. Reutilização do vínculo já validado na autenticação mobile.
4. Reutilização de sessão/contexto no mesmo render do servidor e na mesma execução de busca somente leitura, via React cache e `AsyncLocalStorage`.
5. Escopos descartam acessos futuros, expirados, inativos e vínculos de outra organização.

Não foi introduzido cache de autorização com TTL entre requisições. Mutações e verificações sucessivas do stream continuam lendo autorização atualizada.

Arquivos: `src/infrastructure/security/session.ts`, `src/application/security/auth-context.ts`, `src/application/mobile/security.ts`, `src/infrastructure/database/request-memo.ts`, `src/presentation/actions/search-actions.ts`.

### 2. Atualizações duplicadas das telas e conexões em segundo plano

Antes, a inscrição Ably acontecia dentro de cada reconexão, acumulando listeners; cada evento podia gerar um `router.refresh()`. A aba oculta continuava trabalhando e o fallback SSE podia continuar aberto quando o Ably se recuperava.

Implementado:

6. Uma inscrição por canal em cada cliente Ably, com canais do usuário e da organização autorizados pelo token.
7. Filtro de organização e deduplicação limitada a 500 identificadores de eventos/notificações.
8. Agrupamento de rajadas em atualização após 350 ms, aguardando a atualização em curso.
9. Encerramento de Ably, SSE e timers ao ocultar a aba; atualização e reconexão ao retornar.
10. Encerramento do fallback quando Ably se conecta; novas tentativas limitadas e espaçadas em falhas consecutivas; interrupção em revogação.
11. Preservação de cursor e versão de escopo nas reconexões SSE.

Arquivo: `src/presentation/hooks/use-realtime-events.ts`.

### 3. SSE consultando a cada dois segundos mesmo sem mudança

Antes, as versões web e mobile repetiam autenticação e replay em ciclos fixos de dois segundos. Reconexões sem cursor releriam histórico e provocariam atualização de tela.

Implementado:

12. Implementação compartilhada de stream para web/mobile, usando o contexto inicial já autenticado.
13. Revalidação de identidade, vínculo e organização a cada nova consulta; encerramento por cancelamento/revogação.
14. Intervalos adaptativos: 2 segundos após mudança, 5 e depois 10 segundos durante inatividade; conexão limitada a 25 segundos.
15. Checkpoints sem atualização de tela quando nada mudou. Cursor ausente ou fora da janela pede snapshot diretamente, sem baixar todo o histórico.
16. Replay e autorização de recursos em lote, preservando o cursor baseado em transações concluídas para não perder commits tardios. Excesso de eventos continua exigindo snapshot.
17. Cancelamento remove listeners e timers; falha transitória é distinguida de revogação.

Arquivos: `src/application/mobile/event-stream.ts`, `src/application/mobile/notifications.ts`, `src/app/api/events/route.ts`, `src/app/api/mobile/v1/[...path]/route.ts`.

Este fallback ainda faz consultas enquanto uma tela visível o utiliza. Ele não substitui a necessidade de verificar o funcionamento real do Ably e a frequência de conexões em produção.

### 4. Listagens carregando formulários e evidências completos

Antes, listas, histórico e pesquisa carregavam descrições, instruções, respostas de formulários, conteúdo de evidências e histórico de aprovação que os cartões não exibem. A rodada de correção era buscada por tarefa. O quadro web recalculava totais para cada página interna de 100 tarefas.

Implementado:

18. Projeção de listagem que exclui esses conteúdos, mantendo os fatos usados por permissões, contagens, prazos e relógios. O detalhe mantém seus dados completos.
19. Dependências carregam somente título, estado e aprovação necessários à avaliação.
20. Última rodada de correção resolvida em lote, com `DISTINCT ON` no PostgreSQL e ordenação estável por data/id.
21. Mesma projeção menor nas listas, histórico, tarefas da execução e pesquisa mobile.
22. Totais do quadro reutilizados entre páginas da mesma renderização; todas as páginas continuam sendo percorridas para preservar o quadro completo.
23. Overview e gestão carregam somente os campos consumidos, com nome do usuário em vez do registro completo.

Arquivos: `src/application/mobile/data.ts`, `src/app/(employee)/tasks/page.tsx`, `src/app/(management)/overview/page.tsx`, `src/app/(management)/management/tasks/page.tsx`.

### 5. Notificações e destinos fazendo uma consulta por registro

Implementado:

24. Autorização de destinos de uma página de notificações em lote; recursos fora do acesso continuam mascarados.
25. Projeção em lote nas páginas web e API mobile, com paginação e ordenação por data/id.
26. Resolução de destino entre organizações consulta os vínculos ativos com campos mínimos e procura o recurso de uma vez, usando os escopos de cada organização.
27. Marcar como não lida só atualiza registros que estavam lidos, evitando gravações e eventos desnecessários.
28. Pesquisa de uploads limita tamanho da busca/página e retorna somente metadados consumidos, sem avatar ou conteúdo do arquivo.

Arquivos: `src/application/mobile/notifications.ts`, `src/application/mobile/destinations.ts`, páginas de notificações de colaboradores e gestão, `src/presentation/actions/notification-actions.ts`, `src/app/api/uploads/search/route.ts`.

### 6. Consulta de login QR sem término e com sobreposição

Implementado:

29. Uma consulta parametrizada valida sessão QR, vínculo com o navegador iniciador e expiração.
30. A geração retorna a validade do código; consultas são sequenciais, com espaçamento progressivo de 2 a 10 segundos.
31. Consulta pausa quando a aba fica oculta e termina com expiração, invalidação ou aprovação. Código expirado só é renovado quando a pessoa solicita novo código.

Arquivos: `src/presentation/actions/mobile-auth-actions.ts`, `src/app/(auth)/login/page.tsx`.

### 7. Jobs concorrentes, transações sem trabalho novo e repetição de falhas

Implementado:

32. Tabela de estado operacional com aquisição atômica de lease por job, token de posse, expiração, último início/conclusão/sucesso, resultado e falhas. Uma chamada concorrente retorna `ALREADY_RUNNING`.
33. Leases nas rotas operacional, manutenção mobile e nas três entradas de retenção (completa, histórico e lixeira). Retenção compartilha uma única lease entre todas as entradas; na rota completa, as fases são sequenciais porque podem alcançar os mesmos anexos/templates. Autorização do agendador é validada antes de acessar o banco.
34. Orçamento cooperativo de 45 segundos no tick operacional, lotes limitados e indicação de esgotamento. Não é cancelamento forçado de uma consulta já em execução.
35. Rotinas com execução futura são excluídas; próxima ocorrência, janela de geração e política de execução pendente são verificadas antes de abrir transação. A transação mantém sua própria revalidação.
36. Tentativas após erro ficam registradas por item, com intervalo crescente e variação aleatória; edição da rotina/processo permite tentar novamente sem esperar o erro antigo.
37. Marcos de SLA e alertas já emitidos são carregados em lote antes das transações; trabalho concluído deixa de abrir uma transação por tarefa. As verificações de deduplicação permanecem dentro da transação para trabalho novo.
38. Tarefas sem responsável já alertadas são excluídas na consulta de candidatos.
39. Sincronização de dependências usa cursor persistente, pré-avaliação e uma sincronização por execução no lote, evitando repetir sempre os primeiros 50 registros.
40. Aprovações já escaladas e itens em espera após falha são excluídos **antes** do limite de 100; trava e revalidação protegem cada nova escalação. Substituto deve pertencer à mesma organização e estar ativo.
41. Relatórios em espera após erro são excluídos antes do lote de 50, preservando o agendamento existente.

Arquivos: `src/application/jobs/scheduled-job.ts`, `src/application/processes/operational-tick.ts`, `src/application/processes/generate-execution.ts`, `src/domain/rules/operational-work.ts`, rotas de jobs.

As notificações existentes continuam com seu transporte atual. Esta mudança não promete entrega transacional exatamente uma vez nem altera o agendador externo.

### 8. Limpeza e índices

Implementado:

42. Manutenção ampliada para auxiliares expirados de sessão web, desafios de login/passkey, vínculos QR, sessões QR antigas e estados de tentativas antigos, sempre em lotes limitados e com prazo de segurança. Sessões ativas e registros operacionais não são alvos dessas regras.
43. Mantidas as verificações existentes de referência de anexos/blobs e o piso de retenção do replay. A rotina continua protegida por `MOBILE_MAINTENANCE_ENABLED=1`.
44. Migration aditiva com tabela de estado dos jobs e índices para: última execução da rotina, execução disponível, candidatos de SLA, caixa de notificações, deduplicação de eventos de auditoria, última correção, replay por transação e retenção de eventos. Índice adicional cobre próxima tentativa de job.

Migration: `prisma/migrations/20261021230000_database_efficiency/migration.sql`. Ela contém `lock_timeout=5s` e preserva os índices existentes. Índices convencionais podem esperar/bloquear escrita durante criação; esta migration deve seguir o procedimento de implantação existente. Não foi aplicada ao banco de produção.

### 9. Conexões, medição e prevenção

Implementado:

45. Configuração validada do pool do adaptador Prisma 7, com mínimo zero, máximo explícito, liberação de conexões ociosas, timeout de conexão, identificação da aplicação e UTC.
46. Amostragem opcional de duração e ocupação do pool, desativada por padrão; não grava SQL, parâmetros ou credenciais.
47. Script de diagnóstico somente leitura, inventário estático e execução reprodutível de testes em PostgreSQL 18 descartável.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `DATABASE_POOL_MAX` | `10` | Máximo por instância do servidor; não é limite global do projeto |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `10000` | Liberação de conexões ociosas; mínimo do pool zero |
| `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | `10000` | Limite de espera pela conexão |
| `DATABASE_QUERY_SAMPLE_RATE` | `0` | Fração entre 0 e 1; habilitar temporariamente para medir |

Valores inválidos falham explicitamente. O máximo padrão do `pg` foi mantido para não reduzir capacidade sem medição de concorrência; agora existe ajuste controlado. Não foram reduzidos `work_mem`, buffers ou teto de CU às cegas. Fonte sobre comportamento do pool: [node-postgres Pool](https://node-postgres.com/apis/pool).

## Validação reproduzível

O ambiente de teste usa PostgreSQL 18 em `127.0.0.1:56433`, banco `tarefai_efficiency`. O executor copia os fontes para `tmp/database-efficiency/workspace`, não copia `.env` e só fornece credenciais locais sintéticas. Transportes externos ficam sem credenciais e bloqueados nos testes de integração. Não foi usada cópia dos dados de produção.

Para criar o banco descartável, com Docker disponível (as credenciais abaixo são exclusivas desse teste local):

```powershell
docker run --name tarefai-cost-audit-postgres -e POSTGRES_USER=tarefai_test -e POSTGRES_PASSWORD=tarefai_local_only -e POSTGRES_DB=tarefai_efficiency -p 127.0.0.1:56433:5432 -d postgres:18-alpine
```

Se o container já existir e estiver parado, usar `docker start tarefai-cost-audit-postgres`. Nenhum outro container precisa ser alterado.

```powershell
node scripts/test-database-efficiency.cjs
node scripts/test-database-efficiency.cjs --build
node scripts/inventory-database-access.cjs
node scripts/audit-database-cost.cjs --read-only --output tmp/database-efficiency/production-check.json
```

O último comando consulta o banco configurado no ambiente e deve ser executado pontualmente; não deve virar polling de monitoramento do próprio banco. Os demais usam o banco local. Logs detalhados ficam no diretório ignorado `tmp/database-efficiency`.

### Resultados dos testes

- 48 verificações de regras de domínio passaram.
- 55 verificações operacionais em cada fuso `UTC`, `America/Sao_Paulo` e `Asia/Tokyo` passaram (165 execuções).
- 29 verificações existentes de regressão de fluxos passaram, assim como a suíte de histórico.
- **21 casos específicos de eficiência e integridade passaram**: sessão/revogação, escopos, projeção, isolamento entre organizações, notificações, replay, commit tardio, stream ocioso/revogado, exclusão mútua e recuperação de jobs, todas as entradas de retenção, tentativas, SLA já processado, aprovação após o centésimo item, histórico em lote, paginação completa, índice, manutenção e comportamento dos clientes Ably/QR.
- Prisma Client gerado, TypeScript sem erros, migration aplicada somente no PostgreSQL 18 local e comparação entre schema e banco sem divergência.
- Build de produção completo com Next.js 16.3.6/Turbopack aprovado. O executor permite até 10 minutos para esse build; a primeira tentativa havia atingido seu limite anterior de 4 minutos após compilar e verificar tipos.
- O build concluiu as 49 páginas estáticas e emitiu 18 avisos não bloqueantes do otimizador de CSS sobre seletores gerados. Esses avisos ficam registrados como limitação; arquivos de estilo e o layout do superadmin não foram alterados nesta auditoria.
- Os 338 arquivos de aplicação/schema foram comparados com a cópia validada, sem diferenças; `validation.json` registra a impressão SHA-256 desse conjunto. A verificação de whitespace do diff passou.

| Cenário local | Medição | Limite da conclusão |
| --- | --- | --- |
| Validação de sessão web | 1 comando SQL | Antes eram buscas separadas de sessão, usuário e vínculo; não mede o render inteiro |
| Resultado de consulta de tarefa com conteúdo sintético grande | 329.883 → 2.034 bytes (99,38% menor) | Serialização do resultado da consulta, não tráfego total do app nem dados reais |
| Autorização de 20 notificações sobre a mesma tarefa | 1 consulta; página mobile completa com 3 | Recursos diferentes podem exigir também a consulta em lote de execuções |
| Replay de 100 eventos sobre a mesma tarefa | 3 consultas | Inclui watermark, eventos e autorização em lote; contexto já fornecido |
| Stream ocioso de 25 segundos com cursor e escopo conhecidos | 3 checkpoints, 6 consultas de replay e 2 novas validações | O teste injeta o autenticador; as 6 consultas **não incluem** o custo SQL real da revalidação |
| 40 tarefas com SLA já processado | 24 consultas no tick completo; zero transações por tarefa | Continua existindo custo fixo das consultas de candidatos |
| Segunda página do quadro com 105 tarefas | 29 → 19 consultas, mantendo todos os 105 itens | Totais reaproveitados somente dentro da mesma renderização |
| Última execução entre 4.001 registros | 90 → 3 blocos acessados | `EXPLAIN ANALYZE BUFFERS` somente no banco descartável; comparação retirou o índice dentro de transação revertida |
| Rajada de 20 eventos repetidos | 1 atualização de rota | Cliente simulado; reconexão também não duplicou inscrições |

Resultados estruturados e contexto da validação: [validation.json](validation.json). As medições demonstram os efeitos no cenário controlado, sem representar uma porcentagem já economizada na fatura de produção.

## Publicação e acompanhamento

1. Consolidar estes arquivos com o backend do aplicativo mobile antes de retomar `sync-employee-backend.mjs --apply`. Essa cópia estava sobrescrevendo `schema.prisma`, `mobile/data.ts` e a rota mobile durante a validação; foi pausada pelo usuário. Reaplicar o overlay antigo removeria as correções. Foram preservados os ajustes funcionais concorrentes do mobile.
2. Aplicar a migration aditiva pelo fluxo existente e regenerar Prisma Client; depois publicar o código. Não executar reset ou `db push --accept-data-loss`.
3. Conferir no ambiente publicado as variáveis de manutenção, transporte de notificações e autenticação do cron. Não habilitar o worker descontinuado para tentar esvaziar o outbox.
4. Inventariar o agendador externo: origem, frequência, duração, tentativas e sobreposição. `vercel.json` não contém a programação dos crons; sua frequência real não foi inferida do repositório. Agrupar manutenção de baixa urgência em janelas maiores e alinhar o tick operacional à precisão de prazo exigida pelo produto, evitando chamadas a cada poucos segundos.
5. No Neon, conferir autosuspend e curvas de CU/CPU/memória/conexões. Testar teto menor de autoscaling somente após medir a carga e preservar os tempos de resposta. O teto 8 CU não representa consumo constante de 8 CU.
6. Comparar períodos de pelo menos 24–72 horas com tráfego semelhante: CU-h por hora, tempo ativo, requisições por rota, número de conexões SSE, uso de fallback versus Ably, atualizações por tela e duração/contagem dos jobs. Separar dias de uso/testes intensos do mobile.
7. Comparar contadores PostgreSQL somente se a janela de estatísticas e o início do servidor forem compatíveis. Usar identificadores de rota e duração nos logs, sem informações pessoais ou segredos. Não executar `COUNT(*)`, healthchecks SQL ou diagnóstico pesado em intervalos curtos para medir economia.

O resultado entregue é uma implementação local com validação isolada. Não houve deploy, alteração do plano/compute Neon, mudança de cron externo, limpeza de produção ou economia financeira observada após implantação nesta auditoria.
