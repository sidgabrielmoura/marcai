# Entrega do operacional seletivo — 27/10/2026

O Tarefaí mantém cron-job.org. A decisão foi implementar uma agenda no backend compartilhado pelo site e aplicativo, sem adicionar QStash. O [plano](../../operational-scheduler-plan.md) precedeu o código; o [guia de operação](../../operational-scheduler.md) contém os detalhes e comandos de publicação.

## Implementações

1. Migração aditiva `20261027180000_selective_operational`: tabelas `operational_agenda` e `operational_signals`, chaves, índices por vencimento/organização/fase e cobertura de triggers operacionais.
2. Sinais inseridos na mesma transação de negócio, agrupados por organização/fase/transação. Atendem gravações do site, mobile e administração; rollback também desfaz os sinais. Leituras do produto não geram trabalho.
3. Seleção inicial limitada a 1.000 sinais e 36 pares de organização/fase. Ciclo vazio retorna `NO_WORK` com uma consulta e nenhuma escrita, lease ou varredura de negócio. Autenticação recusada e operacional desativado retornam antes de SQL.
4. Dispatcher preserva lease e intervalo mínimo e executa somente as fases selecionadas, com escopo organizacional e orçamento global. Não executa todas as fases de todas as organizações a cada chamada.
5. Agenda calcula horários de geração antecipada, liberação, SLA, aviso de vencimento, ausência de responsável, aprovação e relatório. Conferência de segurança padrão de uma hora; não cria timer no servidor ou celular.
6. Finalização por revisão da agenda e remoção somente de IDs capturados. Preserva transações com confirmação tardia e alterações concorrentes; não utiliza watermark ou exclusão por intervalo de IDs.
7. Falha adia a fase/sinais capturados por um minuto, mantém o checkpoint e preserva os backoffs individuais. Uma falha persistente não adia por uma hora os prazos de outros itens. Sinais novos antecipam reavaliação.
8. Recuperação de rotinas limitada a 24 horas desde o último ciclo completo, preservando edição, validade, fuso, antecedência, ocorrência única e política de pendência. Recuperação incompleta mantém continuação.
9. Dependências percorrem lotes além da primeira página de 200, mantêm cursor por organização, reiniciam ao receber alterações e consideram início futuro do acesso à unidade.
10. Avisos, ausência de responsável, dependências e escalonamentos só contabilizam/publicam mudanças efetivas. A ausência de responsável é revalidada sob trava antes de registrar ocorrência.
11. Relatório avança o agendamento condicionalmente e registra auditoria na mesma transação; relatório sem próxima data não é reagendado por uma retentativa antiga. A infraestrutura anterior de envio de e-mail foi preservada.
12. Revalidação de organização ativa na geração da rotina e no aviso de vencimento; escopo explícito nas buscas/revalidações de aprovações. Organizações inativas não recebem agenda/sinais.
13. Flags de desligamento/reversão e configuração da reconciliação, sem remover tabelas ou dados de negócio. Cliente Prisma em desenvolvimento reconhece os novos modelos após regeneração.
14. App recebe snapshot canônico atualizado, fixtures offline e triggers nos bancos descartáveis dos testes. Novos testes exercitam mutações reais web/mobile, leitura sem sinais, revogação e rollback. Não foi criado cron ou polling no aplicativo.
15. Documentação de arquitetura/custo atualizada para futuras IAs, incluindo invariantes de concorrência, migração, reversão, limites e validação. Credenciais das capturas de tela não foram reproduzidas.

## Evidências

| Verificação local | Resultado |
| --- | --- |
| Operacional seletivo, incluindo falha persistente, concorrência e limites de lote | 15 verificações passaram |
| Controles de eficiência existentes | 22 verificações passaram |
| Regras de domínio, operacional, workflow e histórico | Passaram |
| Migração em PostgreSQL 18 descartável e comparação com schema Prisma | Passaram |
| Suíte completa do aplicativo | 322 passaram; zero falhas |
| Tipos do backend e app; regras compartilhadas e snapshot | Passaram; 204 arquivos no snapshot |
| Build Next.js com webpack | Passou; 19 avisos CSS já existentes |

O registro verificável está em [operacional-seletivo-validation-2026-10-27.json](operacional-seletivo-validation-2026-10-27.json). Ele reúne resultados das suítes, build e hashes dos arquivos principais. Os testes usam PostgreSQL 18/PGlite descartáveis e dados sintéticos, com transporte externo bloqueado; não consultam o banco de produção.

## Publicação e limites

A migração e o código estão preparados no checkout. Não foi executada migração em produção, publicação do backend/app ou ativação dos crons. O guia contém `prisma migrate status`, `prisma migrate deploy` e `prisma generate`; a migração precede o backend novo. `OPERATIONAL_SELECTIVE_ENABLED=0` permite voltar ao dispatcher legado. Essa contingência mantém triggers e pode acumular sinais nas mutações.

Uma consulta a cada cinco minutos ainda pode manter o Neon ativo. A entrega reduz trabalho por chamada, transações e memória; economia real de CU-hours depende da configuração de compute, frequência e tráfego após publicar. Chamadas do cron desativado não foram usadas como explicação do consumo observado. Validação em aparelho e métricas reais de produção continuam dependendo de publicação e observação.
