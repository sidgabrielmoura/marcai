# Plano de implementação — operacional seletivo

27/10/2026. Plano registrado antes de alterações de código. Escopo autorizado: manter cron-job.org e reduzir leituras/gravações de ciclos sem trabalho. Não ativar cron, contratar serviços nem executar jobs/migrações em produção.

## Inventário e decisões

O operacional reúne seis fases: rotinas, liberação de execuções, dependências, tarefas/alertas, aprovações e relatórios. As gravações vêm de `save-process`, `generate-execution`, `materialize-tasks`, `execution-lifecycle`, `synchronize-execution`, `mobile/operations`, `mobile/task-submission`, `mobile/execution-operations`, ações de gestão, aprovações, relatórios, retenção e purge administrativo. Registrar a agenda somente em componentes/clientes deixaria caminhos sem cobertura.

1. Criar agenda por organização/fase, com horário e revisão, e sinais transacionais de invalidação. Triggers observam somente tabelas operacionais relevantes, sem enviar rede nem executar regras de domínio.
2. Sinais são inseridos por organização/fase/transação, sem regravar uma linha compartilhada de agenda em cada mutação. Essa separação evita introduzir uma trava global por organização no meio das transações de tarefas/dependências.
3. A primeira consulta do cron busca agenda vencida e sinais já confirmados, em índices e lotes limitados. Sem trabalho, retorna `NO_WORK` sem disputar lease de escrita ou abrir transações de negócio.
4. Com trabalho, preservar a lease operacional existente e executar somente organizações/fases selecionadas. As consultas e mutações mantêm organização, status e regras vigentes.
5. Atualizar a agenda com comparação de revisão. Remover somente sinais explicitamente lidos/confirmados, nunca avançar um watermark por `max(id)`: transações antigas podem confirmar depois. Sinais recebidos durante o processamento devem permanecer pendentes.
6. Calcular o próximo processamento por liberação, marcos de SLA, aviso de vencimento, tarefa sem responsável, aprovação e relatório. Dependências também consideram início futuro de acesso à unidade. Uma conferência eventual limita o efeito de inconsistências; registros sem trabalho não viram varreduras a cada cinco minutos.
7. Preservar retentativas/backoff e não avançar trabalho incompleto ou com falha. Manter lotes, orçamento global e tratamento de concorrência. Contadores de mudança e publicação devem representar efeitos reais.
8. Revisar recuperação de ocorrências: o piso atual de um minuto não pode fazer o próximo ciclo seletivo perder uma ocorrência que não foi gerada antecipadamente. Preservar validade, edições, política de pendência e geração única, com recuperação limitada e testada.
9. Manter `OPERATIONAL_JOBS_ENABLED=0` antes do banco e permitir desativar o caminho seletivo por configuração para voltar ao caminho anterior. A migração deve vir antes do backend novo.

## Critérios de validação

- Cron desabilitado/sem credencial: zero SQL; ciclo sem pendências: uma consulta, zero escritas.
- Rotina/execução/tarefa/aprovação/relatório alterados criam sinal na mesma transação; rollback não deixa sinal.
- Sinal de transação com confirmação tardia não se perde. Mudança concorrente durante o processamento não pode ser apagada pela finalização.
- Contextos organizacionais separados; organização inativa não recebe processamento.
- Marcos e avisos não duplicam; falhas respeitam backoff; retomada não perde lotes.
- Fusos, horários futuros, acesso com `startsAt`, geração antecipada e políticas de pendência preservados.
- Testes reais em PostgreSQL 18 descartável, regras existentes e integração do app com schema/snapshot atualizado. Nenhum teste aponta para produção ou envia notificações reais.
- Documentar resultados, migração, configuração, rollback e limites. Uma consulta a cada cinco minutos ainda pode manter o compute ativo; não prometer economia percentual sem medir produção.

## Etapas

1. Migração aditiva e cobertura de sinais.
2. Refatoração das fases com escopo e cálculo de próximos horários.
3. Dispatcher seletivo, finalização concorrente e integração na rota.
4. Testes de migração, concorrência, relógio e consumo vazio.
5. Atualização canônica do snapshot/fixtures do app, regressões e documentação de entrega.

Implementação no checkout: [guia operacional](operational-scheduler.md) e [inventário de entrega/evidências](audits/database-efficiency/operacional-seletivo-2026-10-27.md). A aplicação em produção e a ativação do cron permanecem etapas externas a esta implementação local.
