# Operacional seletivo do Tarefaí

Implementação de 27/10/2026. Backend canônico: `marcai`. Decisão: manter cron-job.org; nenhum serviço QStash ou Cloudflare foi adicionado. O [plano e inventário](operational-scheduler-plan.md) foi registrado antes do código. A [auditoria dos crons](audits/database-efficiency/crons-2026-10-27.md) descreve a configuração informada e o comportamento anterior.

## Caminho de uma chamada

1. `/api/jobs/operational` autentica a chamada. Sem autorização ou com `OPERATIONAL_JOBS_ENABLED=0`, não consulta o banco.
2. `dueOperationalPhases` executa uma consulta somente à agenda, aos sinais e ao status das organizações. Os índices atendem horário, organização e fase; a seleção limita a 1.000 sinais e 36 pares de organização/fase por chamada.
3. Sem vencimentos/sinais, retorna HTTP 200 com `skipped: true, reason: "NO_WORK"`. Não grava lease, auditoria ou estado do job e não varre tabelas de negócio.
4. Havendo trabalho, disputa a lease global `operational`, respeita o intervalo mínimo e processa somente as organizações/fases selecionadas. Preserva validação de status, regras de negócio, travas de tarefa/execução e deduplicação dos efeitos.
5. Calcula o próximo horário, finaliza por comparação de revisão e confirma somente os sinais capturados antes de processar. Trabalho que não coube permanece agendado. Falhas retornam HTTP 503 e usam backoff; sinais novos podem antecipar uma nova avaliação.

O orçamento compartilhado é de 40 segundos, conferido entre lotes/itens. Não é um cancelamento de uma consulta/transação já iniciada. A lease dura 90 segundos e a rota mantém `maxDuration=60`. O caminho legado mantém seu orçamento anterior de 45 segundos.

## Dados e concorrência

`operational_agenda` contém organização, fase, próxima execução, revisão, falhas e último ciclo completo. Não contém dados privados de tarefas. `operational_signals` contém ID, organização, fase, ID da transação e horário de disponibilidade.

Triggers SQL cobrem organizações, processos, rotinas/exceções, execuções, tarefas, atribuições, dependências, ocorrências de SLA/ausência de responsável, aprovações, relatórios, membros, acessos a unidades, equipes e logs relevantes. Mudança de status de usuário sinaliza seus vínculos. A cobertura ocorre no banco e atende Server Actions, API mobile, gestão e superadmin, sem exigir que cada cliente conheça o agendador. Consultas de leitura do produto não geram sinais. Alteração somente de `updatedAt` é ignorada.

Há no máximo um sinal por organização/fase/transação, embora uma escrita possa afetar várias fases. Isso acrescenta custo às mutações, em troca de evitar varreduras frequentes. Triggers apenas registram metadados: não processam domínio nem chamam rede. Organizações inativas não recebem sinais; ao inativar, os metadados existentes são removidos. A migração inicializa as seis fases das organizações ativas.

**Não substituir sinais por uma linha compartilhada de agenda atualizada em toda mutação.** Uma transação pode segurar uma tarefa e esperar a agenda enquanto outra segura a agenda e espera outra tarefa. Os sinais separados por transação evitam essa nova dependência de travas compartilhadas.

**Não apagar sinais por `id <= max(id)`, timestamp de início ou watermark.** Uma transação com ID menor pode confirmar depois da leitura. A finalização remove apenas IDs explicitamente lidos e somente se a revisão da agenda ainda corresponde à seleção. Sinais confirmados durante o processamento permanecem pendentes. Uma escrita do próprio cron pode deixar um sinal para uma conferência adicional barata no ciclo seguinte; isso é intencional.

Na falha, tanto o horário da agenda quanto os sinais capturados são adiados em um minuto. As retentativas individuais preservam o backoff exponencial já existente; o scanner da fase volta antes para não adiar prazos de outros itens por uma hora devido a uma falha isolada. Uma mutação nova tem outro ID de transação e cria sinal imediato. Ciclos incompletos não avançam `last_completed_at`.

## Próximos horários e regras preservadas

| Fase | O que faz o próximo processamento vencer |
| --- | --- |
| `ROUTINES` | Próxima ocorrência menos antecedência de geração; retentativa; continuação de recuperação |
| `EXECUTIONS` | Menor `availableAt` de execução programada em processo ativo |
| `DEPENDENCIES` | Alteração operacional, continuação de lote ou início futuro de acesso à unidade |
| `TASKS` | Próximo marco SLA, janela de aviso de 30 min, 15 min sem responsável ou retentativa |
| `APPROVALS` | Prazo de etapa pendente ainda não escalonada, respeitando retentativa |
| `REPORTS` | Próximo relatório ativo, respeitando retentativa |

Há reconciliação de segurança a cada uma hora por organização/fase, mesmo sem sinais, limitada pelo próximo disparo do cron. `OPERATIONAL_RECONCILE_INTERVAL_MS` admite de um minuto a 24 horas. Não é um timer no servidor: o cron externo continua sendo necessário.

O escopo da seleção é organização/fase. Quando uma fase vence, ela ainda pode ler candidatos da organização em páginas para aplicar as regras e calcular próximos horários; não se trata de uma fila individual por tarefa. Tarefas selecionam apenas campos/relações necessários. Estatísticas de produto não foram truncadas nem trocadas por totais parciais.

A recuperação automática de rotinas usa o último ciclo completo, limitada às últimas 24 horas, preservando validade, edição do processo/rotina, fuso, exceções e política de pendência. Gera no máximo uma ocorrência por rotina em cada passagem e agenda continuação enquanto houver ocorrência passada. Não cria retroativamente todas as ocorrências anteriores a essa janela. `CREATE_NEW`, `BLOCK_NEW` e `SKIP_IF_PENDING` continuam sendo respeitados; não usar recuperação para contornar pendência bloqueante.

Dependências usam cursor por organização e percorrem mais de uma página de 200 quando há orçamento. Um sinal novo reinicia a avaliação para incluir alterações anteriores ao cursor; sem sinais, continua o lote pendente. A futura elegibilidade por `startsAt` de acesso à unidade é tratada mesmo sem escrita nova.

Alertas de SLA preservam o marco mais recente e o limite de fim de dia existente. Aviso/ausência de responsável/escalonamento só contam e publicam sincronização quando efetivamente persistidos. O alerta de ausência revalida a tarefa e a atribuição sob trava. Relatório avança condicionalmente e grava a auditoria na mesma transação. O envio externo de relatório continua no mecanismo anterior; esta mudança não introduz uma outbox de e-mail nem promete entrega exatamente uma vez.

`MOBILE_OUTBOX_ENABLED` continua controlando o caminho legado de SLA/aviso. Não reativar `/api/jobs/mobile` nem alterar essa configuração como parte desta entrega.

## Migração, publicação e reversão

No backend, após conferir a conexão do ambiente de destino:

```powershell
cd C:\Users\gabriel\development\marcai
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` aplica todas as migrações pendentes desse checkout. A nova migração é `20261027180000_selective_operational`; ela adiciona duas tabelas, índices e triggers, sem apagar dados de negócio. Publicar essa migração antes do código que usa a agenda. Não usar `migrate dev`, `db push` ou reset em produção.

| Configuração | Padrão | Uso |
| --- | --- | --- |
| `OPERATIONAL_JOBS_ENABLED` | habilitado | `0` desliga o operacional antes de SQL, depois da autenticação |
| `OPERATIONAL_SELECTIVE_ENABLED` | habilitado | `0` volta ao dispatcher legado; exige nova publicação/configuração conforme a hospedagem |
| `OPERATIONAL_JOB_MIN_INTERVAL_MS` | `60000` | Intervalo mínimo entre execuções com trabalho |
| `OPERATIONAL_RECONCILE_INTERVAL_MS` | `3600000` | Conferência de segurança por organização/fase |

A reversão por flag mantém as tabelas e triggers; não exige desfazer a migração nem apagar sinais. Enquanto o caminho seletivo estiver desativado, sinais podem se acumular nas mutações; usar esse modo como contingência e acompanhar crescimento antes de mantê-lo por longo período. Voltar ao seletivo drena os sinais em lotes. A flag não modifica cron-job.org.

Na chamada autenticada em homologação, verificar `NO_WORK`, contadores e `phasesProcessed`/`phasesRemaining`. Falhas mantêm os sinais para retentativa. Conferir um fluxo real de rotina, conclusão com dependência, prazo e aprovação antes de ativar o cron em produção. Os quatro agendamentos informados permaneceram desativados durante esta implementação.

## Verificações e limites de custo

O executor `node scripts/test-database-efficiency.cjs` usa somente PostgreSQL 18 descartável em loopback e credenciais sintéticas. `scripts/verify-selective-operational.ts` verifica consumo vazio, autorização, rollback, confirmação tardia, revisão concorrente, backoff, isolamento organizacional, horários, lotes e idempotência. O [inventário de entrega e evidências](audits/database-efficiency/operacional-seletivo-2026-10-27.md) registra os resultados, a suíte móvel e o build.

O aplicativo recebeu o snapshot e fixtures atualizados, além de integração que comprova sinais de mutações web/mobile e ausência de sinais em GET. Não precisa criar timers, chamadas ao cron ou agendamentos locais no celular. Manter a direção de sincronização **backend → snapshot do app**.

**Uma consulta a cada cinco minutos ainda pode impedir Scale to zero de permanecer suspenso.** Essa entrega reduz trabalho SQL, transações e memória de chamadas vazias; não elimina o custo de despertar/manter compute ativo. A reação ocorre no próximo disparo externo, portanto um cron de cinco minutos continua admitindo aproximadamente cinco minutos de atraso, além de fila/retentativas. Não promete economia percentual ou custo zero. Comparar CU-hours e tempo ativo em janelas equivalentes depois de publicar; o total acumulado não diminui.

Referências de implementação: [triggers PostgreSQL 18](https://www.postgresql.org/docs/18/sql-createtrigger.html), [isolamento e visibilidade de transações](https://www.postgresql.org/docs/18/transaction-iso.html), [Scale to zero do Neon](https://neon.com/docs/introduction/scale-to-zero).
