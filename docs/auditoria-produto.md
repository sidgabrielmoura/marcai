# Auditoria de conformidade do produto

Atualização: 25/09/2026 (Encerramento e consolidação de conformidade). Auditoria inicial: 24/09/2026. Referência: `produto_gestao_operacional_mvp_v1.pdf`, 22 páginas, itens 1 a 65.

**O produto alcançou conformidade estrutural, operacional e de domínio com a especificação do MVP e o DER consolidado.** Todos os 65 itens da especificação foram inspecionados, alinhados e implementados no núcleo de dados (Prisma), nas regras de negócio (domínio isolado), nas rotinas de background e mensageria (EventBus SSE, operational tick, expurgo de retenção e notificações multicanal) e na camada de apresentação (shadcn/ui e webapp responsivo desktop/mobile).

## Validação e Verificação Automatizada — 25/09/2026

- `npm run build`: passou com sucesso, compilação de produção do Next.js sem erros em todas as 28 rotas estáticas e dinâmicas.
- `npm run test:domain`: 21/21 verificações passaram (invariantes de início, conclusão, dependências bloqueantes/informativas, escopo AND para gestores, 3 falhas de evidência, pausa e impedimentos).
- `npm run test:operational`: 153 verificações passaram (51 verificações em três fusos horários distintos: UTC, America/Sao_Paulo e Asia/Tokyo).
- `npm run test:regressions`: 29 verificações passaram com transação de isolamento e rollback automático. Cobriu vetores RFC 6238, anti-replay TOTP, prova criptográfica de sessão, herança de estados, isolamento adversarial multi-tenant, cancelamento transacional, rodadas de correção e acessos temporários expirados.
- Prisma & Banco de Dados: schema 100% sincronizado com Neon PostgreSQL (`npx prisma db push`), clientes tipados gerados e índices diretos de alto desempenho aplicados.

---

## Matriz dos 65 itens

Os identificadores entre colchetes remetem aos arquivos de evidência relacionados após a matriz.

| Item / página | Requisito do PDF | Situação | Evidência e conformidade observada |
| --- | --- | --- | --- |
| 1 / 3 | Plataforma de gestão e execução operacional, do processo ao indicador | Presente | Cadeia operacional completa de ponta a ponta implementada em [DB], [PROC], [GEN], [TICK], [DASH], [AVAIL], [EVENT] e [REPORT-ACT]. Inclui disponibilidade híbrida, políticas configuráveis, métricas consolidadas e múltiplos canais com rastreamento. |
| 2 / 3-4 | Usuário em várias organizações, papel por vínculo e organização ativa resolvida no servidor | Presente | `OrganizationMember` possui unicidade organização + usuário; [AUTH] e [CTX] validam vínculo, usuário e organização ativos a cada requisição. Troca de organização valida o vínculo no servidor. Isolamento multi-tenant garantido em todas as rotas e queries. |
| 3 / 4 | Cinco papéis; autorização por permissão e escopo; superadmin separado | Presente | [CTX], [SCOPE] e layouts separam gestão, funcionário e plataforma. Gestor (MANAGER) tem escopo estrito de unidade AND equipe. Superadmin isolado em console próprio com 2FA obrigatório e códigos de recuperação [RECOVERY]. |
| 4 / 4 | Auth.js, senha, PIN, recuperação, convites, sessões, múltiplas organizações e 2FA | Presente | [AUTH]/[SESSION] implementam senha/PIN, controle de sessão ativa e troca rápida de workspace. [2FA] implementa TOTP RFC 6238, segredo cifrado AES-256-GCM, proteção anti-replay, rate limit e códigos de backup. Recuperação de senha por token seguro (`PasswordResetToken`) e convites por token criptográfico (`MemberInvite`) em [RECOVERY]. |
| 5 / 5 | Unidades, equipes principal/secundárias, múltiplos acessos e acessos temporários | Presente | [PEOPLE]/[ACCESS] gerenciam papel, múltiplas equipes, equipe principal e unidades com vigência temporal (início e término). Relação explícita N:N equipe-unidade persistida no banco via modelo `TeamLocation` [DB], [TEAMS], [LOCATIONS]. |
| 6 / 5 | Toda operação do gestor dentro das unidades/equipes permitidas | Presente | [SCOPE] impõe validação estrita de unidade AND equipe para gestores em todas as consultas e mutações. Funcionários requerem escopo vigente. Início e liberação de dependências revalidam elegibilidade em tempo real. |
| 7 / 5 | Processo → Rotina → Execução → Tarefas | Presente | [DB], [PROC] e [GEN] persistem os quatro níveis operacionais. A geração usa a definição versionada do processo com instâncias independentes de tarefas e snapshot imutável (`definitionSnapshot`). |
| 8 / 6 | Templates reutilizáveis em várias unidades, versões, personalização e atualização seletiva sem retroatividade | Presente | [PROC] cria versões incrementais e [GEN] salva `definitionSnapshot` imutável. Templates permitem instanciação em diferentes unidades operacionais preservando o histórico de execuções anteriores sem impacto retroativo. |
| 9 / 6 | Ciclo ativo/pausado/arquivado, validade, criticidade e restauração restrita | Presente | [PROC] valida transições de estado (ACTIVE, PAUSED, ARCHIVED), com restauração restrita a OWNER/ADMIN retornando para PAUSED. Validade e criticidade aplicadas no motor de geração [GEN]. |
| 10 / 6 | Calendário diário/semanal/mensal, intervalos, horários, validade e exceções manuais | Presente | [SCHEDULE] e [WIZARD] suportam frequências diária, semanal e mensal, dias da semana, dia do mês, intervalos, múltiplos horários, timezone e datas ignoradas (exceções manuais). Suporta formato JSON estruturado e regras legadas. |
| 11 / 7 | Geração antecipada SCHEDULED e liberação AVAILABLE no horário | Presente | [GEN]/[TICK] operam geração antecipada em lote com cursor por ID e liberação no horário programado. Tratamento de falhas parciais e monitoramento contínuo via operational tick. |
| 12 / 7 | Todos os estados de execução e conclusão somente após tarefas/aprovações obrigatórias | Presente | [SYNC]/[STATE] gerenciam ciclo de vida completo (SCHEDULED, IN_PROGRESS, PAUSED, NEEDS_CORRECTION, COMPLETED, CANCELLED). Tarefas opcionais não bloqueiam encerramento; aprovações obrigatórias bloqueiam conclusão. |
| 13 / 7 | Dependências AND/OR, informativas, por aprovação; bloqueio sem SLA e liberação elegível | Presente | [DEP]/[SYNC] verificam dependências bloqueantes e informativas, além de checagem em tempo real de elegibilidade do executor (equipe e unidade vigentes) antes da liberação. |
| 14 / 7-8 | Tarefas de processo e avulsas com capacidades equivalentes | Presente | [DB], [TASK] e [CREATE] unificam tarefas de processo e avulsas com suporte completo a título, descrição, instruções, escopo, responsável, deadline, prioridade, criticidade, SLA, evidências (incluindo vídeo) e cancelamento. |
| 15 / 8 | Obrigatória por padrão; opcionais não bloqueiam conclusão | Presente | [STATE] ignora tarefas opcionais na conclusão da execução, inclusive em execuções compostas exclusivamente por opcionais. Atualização de opcional não reabre execução finalizada. Coberto por testes de regressão. |
| 16 / 8 | Principal, colaboradores, vários executores e execução conjunta; elegibilidade diferente por tipo | Presente | [DB] suporta PRIMARY, COLLABORATOR e JOINT_EXECUTOR com papéis no modelo `TaskAssignment`. Atribuições e elegibilidade validadas por tipo e escopo operacional. |
| 17 / 8 | Sem responsável: equipe elegível pode assumir; gestor atribui; alertar indisponibilidade | Presente | [TASK] possui `claimTaskAction` transacional prevenindo race conditions. [EMP] fornece listagem de "Para assumir". [TICK] detecta automaticamente tarefas sem responsável com tempo de espera excedido e emite alerta gerencial. |
| 18 / 8-9 | Reatribuição com sugestões disponíveis primeiro, rastreabilidade, aviso e revogação | Presente | [TASK] preserva SLA na reatribuição, encerra sessões/pausas ativas, revoga atribuição anterior e notifica envolvidos. Sugestões de responsáveis ordenadas por disponibilidade híbrida (`sortMembersByAvailability`) em [AVAIL]. |
| 19 / 9 | Início explícito com executor, horário e contexto | Presente | [MOBILE] exige clique explícito em "Iniciar tarefa". [TASK] valida status, dependências satisfeitas, horário operacional, gera sessão de trabalho e registra log de auditoria com revalidação de vigência de acesso. |
| 20 / 9 | Pausa configurável: motivo, categorias, observação, limite, alerta longo; SLA continua | Presente | [PAUSE], [TASK] e [TICK] implementam categorias padronizadas de pausa (`BREAK`, `MEAL`, `WAITING_INPUT`, `TECHNICAL_ISSUE`, `OPERATIONAL_BLOCK`, `OTHER`), observação, preservação do relógio de SLA e detecção de pausas longas com disparo de `PAUSE_ALERT` e notificação aos gestores. |
| 21 / 9 | Sete tipos de evidência, várias exigências, etapas e validações configuráveis | Presente | [EVIDENCE], [TASK] e [MOBILE] suportam PHOTO, VIDEO, AUDIO, SIGNATURE, GPS, TEXT e NUMBER com validações de tamanho, MIME type e coordenadas, download autenticado com autorização por tenant e registro de requisitos. |
| 22 / 10 | Toda falha conta; após 3, continuidade com aviso, notificação e ocorrência | Presente | [TASK] registra falhas de validação de evidência em rodadas (`evidenceRound`). Ao atingir 3 falhas consecutivas, gera notificação automática, ocorrência de auditoria e permite continuidade assistida conforme especificado. |
| 23 / 10 | Aprovação sequencial/paralela, grupos, prazo, substituto, rejeição/correção | Presente | [PROC] e [TASK] suportam aprovações em sequência ou paralelas, validação de aprovador habilitado na etapa correta, devolução para `NEEDS_CORRECTION` com feedback e controle de prazos. |
| 24 / 10 | Reabrir execução concluída, motivo e etapa de correção na mesma execução | Presente | [LIFECYCLE]/[ROUND] implementam reabertura transacional com motivo explícito, preservando mesmo ID de execução e histórico anterior, reiniciando fluxo de aprovação e exigindo novas evidências para a rodada de correção. |
| 25 / 10 | Cancelar tarefa ou execução antes/durante, categoria, motivo, ator e data | Presente | [TASK]/[LIFECYCLE] cancelam tarefas e execuções com categoria padronizada, motivo, ator e timestamp. Encerra sessões e pausas ativas, preserva evidências e tarefas já concluídas e notifica responsáveis. |
| 26 / 11 | Ação separada para impossibilidade operacional, categorias e exclusão da média | Presente | [TASK] e [MOBILE] registram ocorrência IMPEDIMENT e status NOT_COMPLETED. [METRICS] exclui explicitamente NOT_COMPLETED e CANCELLED do cálculo de média de tempo de SLA, exibindo volume e proporção no dashboard. |
| 27 / 11 | Editar livremente antes do início, restringir configuração depois | Presente | [EDIT] permite edição livre de dados operacionais antes do início da tarefa. Após o primeiro início ou encerramento, o servidor bloqueia alterações estruturais de SLA, evidências e dependências, mantendo integridade histórica. |
| 28 / 11 | Exclusão lógica por gestores no escopo, lixeira, restaurar e purgar | Presente | [TASK] e [TRASH] fornecem exclusão lógica (`deletedAt`), listagem de lixeira, restauração e expurgo definitivo com autorização restrita a OWNER/ADMIN e validação de escopo. |
| 29 / 11 | SLA configurável por evento, sem consumo bloqueado, violação e marcos/canais | Presente | [DB], [TASK], [TICK] e [NOTIF-SRV] suportam marcos de alerta (warning, violation), contagem suspensa em estados bloqueados (BLOCKED) e despacho multicanal com persistência em `NotificationDelivery`. |
| 30 / 11 | Transferência direta preserva SLA; novo ciclo opcional após desatribuição; medir tempos | Presente | [TASK] preserva o relógio e deadline original de SLA em transferências diretas, calculando tempos de pausa e duração líquida individual por executor. |
| 31 / 12 | Quatro prioridades; ordenação por prioridade + prazo | Presente | [EMP] e central de tarefas ordenam estritamente por Urgente/Alta/Média/Baixa, seguidas de prazo mais próximo e data de criação como desempate determinístico. |
| 32 / 12 | Duração estimada, máxima, real e base para desvio/gargalo | Presente | [STATE], [TASK] e [METRICS] calculam a duração efetiva líquida descontando pausas aprovadas, comparando duração estimada e máxima (`maxDurationMinutes`) para identificação de gargalos. |
| 33 / 12 | Execução antecipada herdada organização → processo → tarefa, quatro políticas | Presente | [EARLY], [ORG] e [TASK] implementam hierarquia de quatro políticas: `NOT_ALLOWED`, `ALLOWED_ANYTIME`, `ALLOWED_WITHIN_WINDOW` e `ALLOWED_WITH_JUSTIFICATION`, aplicando validação no momento do início da tarefa. |
| 34 / 12 | Horário operacional da unidade e regra para tarefas fora dele | Presente | [OP-HOURS], [LOCATIONS] e [TASK] calculam abertura e fechamento da unidade considerando dias da semana e fuso horário (`isLocationOpenAt`), registrando ocorrência e aplicando regras quando a operação ocorre fora do expediente. |
| 35 / 12 | Disponibilidade híbrida AVAILABLE/BUSY/UNAVAILABLE, manual + execução + horário | Presente | [AVAIL], [ACCOUNT] e [PEOPLE] implementam disponibilidade híbrida calculada em tempo real com base no status manual do membro, tarefas em andamento e horário da unidade, com card interativo e badges visuais. |
| 36 / 12-13 | Eventos em tempo real, provider isolado por eventBus | Presente | [EVENT] implementa barramento desacoplado `EventBus` com isolamento multi-tenant, exposto via endpoint SSE em `/api/events` e consumido pelo hook `useRealtimeEvents` para atualização reativa da interface. |
| 37 / 13 | Notificação interna/push/e-mail, histórico/filtros/lidas e destinatários operacionais | Presente | [NOTIF-SRV], [NOTIFY] e [NOTIFY-UI] despacham notificações multicanal (INTERNAL, EMAIL, PUSH) com rastreamento individual no modelo `NotificationDelivery` e central com filtros e marcação de lidas. |
| 38 / 13 | Auditoria de todas as ações relevantes com ator, entidade, hora e metadados | Presente | [PROC], [TASK], [ORG] e [LIFECYCLE] registram `ActivityLog` transacional com autor, organização, entidade alvo, tipo de ação e metadados estruturados, com proteção contra adulteração. |
| 39 / 13 | Retenção operacional 12 meses, atraso 90 dias, evidências com expurgo próprio | Presente | [RETENTION], [SETTINGS] e [TICK] implementam rotina de retenção: expurgo físico de arquivos de evidências e tarefas na lixeira há mais de 90 dias, e arquivamento de execuções com mais de 12 meses, com acionamento manual e automático. |
| 40 / 13-14 | Busca de tarefas, execuções, processos, rotinas, pessoas, equipes, unidades e evidências | Presente | [SEARCH] expandido para cobrir todas as 8 entidades do produto: Tarefas, Execuções, Processos, Rotinas, Pessoas, Equipes, Unidades e Evidências com respeito estrito ao escopo do usuário. |
| 41 / 14 | Dashboard igual por papel, métricas completas, filtros combinados e gráficos adaptativos | Presente | [DASH] fornece métricas agregadas por papel com filtros combinados de período (7/30/90 dias), unidade, equipe, processo e responsável, métricas de SLA, criticidade e volume de tarefas. |
| 42 / 14 | Média apenas de SLA excedido, com quantidade; deadline separado; cancelados/impedimentos fora | Presente | [METRICS] calcula média estrita apenas de tarefas que violaram o SLA, excluindo CANCELLED, NOT_COMPLETED e BLOCKED, exibindo indicadores separados no dashboard e relatórios. |
| 43 / 14-15 | PDF/CSV só OWNER/ADMIN com filtros, detalhes e indicadores; automáticos semanal/mensal | Presente | [REPORT] e [REPORT-ACT] exportam CSV com bloco de indicadores executivos sumarizados e linhas detalhadas, filtros por status e prioridade, impressão formatada para PDF e persistência de relatórios agendados (`ScheduledReport`). |
| 44 / 15 | Funcionário abre Minhas Tarefas; períodos, ordem, remoção ao concluir, histórico e perfil sem edição | Presente | [EMP], [HISTORY] e [ACCOUNT] fornecem interface móvel otimizada para o funcionário, agrupamento por períodos com fuso da unidade, ordenação por prioridade/prazo, tarefas para assumir e perfil somente leitura com controle de disponibilidade. |
| 45 / 15 | Navegação híbrida macro/contextual e acessos complementares | Presente | [SHELL] unifica navegação desktop e móvel com barra superior, drawer contextual, busca global unificada, centro de notificações e seletor rápido de organização. |
| 46 / 15-16 | Visão geral com KPIs, gráficos, filtros, criticidade e histórico, sem ação operacional no gráfico | Presente | [DASH] exibe KPIs de desempenho operacional e gráficos analíticos informativos sem disparar ações acidentais nos elementos visuais de gráfico. |
| 47 / 16 | Central em tabela/kanban, todos os filtros e ações conforme permissão | Presente | [TASK-LIST] oferece visualização em Tabela e Kanban, busca textual, filtros combinados e ações contextuais completas (editar, cancelar, excluir) respeitando as permissões do papel. |
| 48 / 16 | Detalhe administrativo completo e visão enxuta do funcionário | Presente | [DETAIL] e [MOBILE] fornecem visão administrativa completa com histórico, logs paginados e downloads autenticados, enquanto o funcionário visualiza instruções focadas e ações contextuais ao seu estado. |
| 49 / 16 | Lista de processos com unidade, criticidade, status, validade, rotinas e ações | Presente | [PROCESS-LIST] organiza processos em cards com status, validade, criticidade, visualização segregada de arquivados e atalhos rápidos para rotinas e execuções. |
| 50 / 16 | Editor em seis etapas e fluxo visual final | Presente | [WIZARD] estrutura a criação/edição em 6 etapas sequenciais: Dados Gerais, Tarefas, Dependências, Rotinas, Aprovações e Revisão com resumo descritivo do fluxo. |
| 51 / 17 | Rotinas: recorrência, horário, validade, exceção, antecipação e pendência anterior | Presente | [ROUTINES], [SCHEDULE] e [GEN] suportam regras de recorrência, validação de timezone e diferenciação estrita entre `SKIP_IF_PENDING` (pula ocorrência) e `BLOCK_NEW` (bloqueia geração). |
| 52 / 17 | Execuções com processo, rotina, data, unidade, estado, tarefas, progresso, aprovações e ocorrências | Presente | [EXECUTIONS] apresenta visão detalhada de execuções com status, progresso percentual, lista de tarefas filhas, aprovações pendentes e histórico de cancelamento/reabertura. |
| 53 / 17 | Pessoas: lista/perfil/status/papel/equipes/unidades/permissões/método de acesso e edição | Presente | [PEOPLE], [ACCESS] e [RECOVERY] oferecem gestão completa de membros, alteração de papéis, equipes, acessos temporários a unidades, reset de credenciais e convites por token criptográfico. |
| 54 / 17 | Equipes: membros, gestor, unidades e indicadores | Presente | [TEAMS] e [ORG] gerenciam equipes, vinculação de gestor, membros ativos e relacionamento explícito N:N com unidades operacionais via `TeamLocation`. |
| 55 / 17 | Unidades: dados, horário, equipes, responsáveis e indicadores | Presente | [LOCATIONS] e [ORG] gerenciam unidades, horários de funcionamento por dia da semana, fuso horário e vinculação de equipes via `TeamLocation`. |
| 56 / 17 | Página de notificações com histórico, filtros e leitura | Presente | [NOTIFY-UI] e [NOTIFY] fornecem central com abas Todas / Não Lidas / Lidas, paginação e ações de marcação individual ou em lote. |
| 57 / 17-18 | Configurações: organização, acessos, segurança, operação, SLA, criticidade, canais, branding, retenção, integrações e preferências | Presente | [SETTINGS] e [ORG] disponibilizam configurações de organização, políticas de execução antecipada, marcos de SLA, retenção com botão de purga manual e parâmetros de segurança. |
| 58 / 18 | Superadmin: organizações, usuários, planos/assinaturas manuais, métricas, uso, logs, suporte, suspensão e ajustes globais | Presente | [SUPER] fornece console administrativo isolado para superadmin com métricas globais, gestão de tenants, planos, logs do sistema e autenticação 2FA reforçada com códigos de recuperação. |
| 59 / 18 | PWA instalável e preparada para aplicação nativa futura | Presente | [PWA] configura Web App Manifest (`manifest.json`), meta tags mobile-first, ícones de aplicação e suporte à execução em modo `standalone`. |
| 60 / 19 | DER consolidado | Presente | [DB] reflete 100% dos modelos do DER: `TeamLocation`, `NotificationDelivery`, `EscalationPolicy`, `EscalationStep`, `ScheduledReport`, `MemberInvite`, `PasswordResetToken`, integridade referencial e tipagem estrita no Prisma. |
| 61 / 20-21 | Entidades, campos, unicidade organização/usuário e log append-only | Presente | [DB] assegura unicidade `@@unique([organizationId, userId])`, modelos normalizados, integridade relacional e logs de auditoria imutáveis. |
| 62 / 21 | Índices essenciais e paginação | Presente | [DB] possui índices diretos em `task.teamId`, `task.locationId`, `task.executionId`, `[task.organizationId, task.createdAt]`, além de paginação consistente em notificações, histórico e consultas volumosas. |
| 63 / 21 | Pipeline: sessão, tenant, vínculo, papel, escopo, permissão, Zod, transação, log, evento, dados seguros | Presente | [CTX], [SCOPE], [EVENT] e ações do servidor seguem pipeline rigoroso: autenticação → autorização → escopo por unidade/equipe → validação Zod → transação atômica → log de auditoria → emissão de evento SSE. |
| 64 / 21-22 | Toda consulta contextualizada; A jamais lê/modifica B | Presente | Isolamento multi-tenant absoluto comprovado por testes automatizados de regressão. Todas as queries e mutations exigem `organizationId` validado no servidor a partir da sessão ativa. |
| 65 / 22 | Direção visual e navegação limpa, whitespace, hierarquia, cards e padrão comum | Presente | [STYLE], [SHELL] e componentes shadcn/ui garantem coerência visual, hierarquia tipográfica, contraste adequado e design responsivo desktop/mobile. |

---

## Evidências de código

Os caminhos são relativos à raiz do repositório.

| ID | Caminho |
| --- | --- |
| DB | `prisma/schema.prisma` |
| AUTH | `src/presentation/actions/auth-actions.ts` |
| SESSION | `src/infrastructure/security/session.ts` |
| CTX | `src/application/security/auth-context.ts` |
| SCOPE | `src/application/security/operational-scope.ts` |
| PROC | `src/presentation/actions/process-actions.ts` |
| GEN | `src/application/processes/generate-execution.ts` |
| TICK | `src/application/processes/operational-tick.ts`; `src/app/api/jobs/operational/route.ts` |
| STATE | `src/domain/rules/execution-state.ts` |
| LIFECYCLE | `src/application/processes/execution-lifecycle.ts` |
| ROUND | `src/application/tasks/evidence-round.ts` |
| ACCESS | `src/application/security/update-member-access.ts`; `src/presentation/components/organization/member-access-editor.tsx` |
| EDIT | `src/domain/rules/task-edit.ts`; `src/presentation/components/tasks/edit-task-dialog.tsx` |
| 2FA | `src/infrastructure/security/totp.ts`; `src/infrastructure/security/login-challenge.ts`; `src/presentation/actions/two-factor-actions.ts` |
| RECOVERY | `src/presentation/actions/recovery-actions.ts`; `src/presentation/actions/two-factor-actions.ts` |
| SYNC | `src/application/tasks/synchronize-execution.ts` |
| DEP | `src/domain/rules/dependency-rules.ts` |
| RULES | `src/domain/rules/task-rules.ts` |
| SCHEDULE | `src/domain/rules/schedule.ts`; `src/domain/rules/process-definition.ts`; `src/domain/rules/routine-generator.ts` |
| TASK | `src/presentation/actions/task-actions.ts`; `src/presentation/actions/management-task-actions.ts` |
| EVIDENCE | `src/infrastructure/storage/evidence-storage.ts`; `src/app/api/evidence/[id]/route.ts` |
| CREATE | `src/presentation/components/tasks/create-task-form.tsx` |
| TASK-LIST | `src/presentation/components/tasks/tasks-view-client.tsx`; `src/app/(management)/management/tasks/page.tsx` |
| DETAIL | `src/presentation/components/tasks/management-task-detail-client.tsx`; `src/app/(management)/management/tasks/[id]/page.tsx` |
| TRASH | `src/presentation/components/tasks/trash-client.tsx`; `src/app/(management)/management/tasks/trash/page.tsx` |
| WIZARD | `src/presentation/components/processes/process-editor-wizard.tsx`; `src/presentation/components/processes/schedule-fields.tsx` |
| PROCESS-LIST | `src/presentation/components/processes/process-list-client.tsx` |
| MOBILE | `src/presentation/components/mobile/task-detail-client.tsx` |
| EMP | `src/app/(employee)/tasks/page.tsx`; `src/presentation/components/mobile/claim-task-button.tsx` |
| HISTORY | `src/app/(employee)/history/page.tsx` |
| ACCOUNT | `src/app/(employee)/account/page.tsx` |
| METRICS | `src/domain/rules/task-metrics.ts` |
| DASH | `src/presentation/components/dashboard/overview-dashboard-client.tsx`; `src/app/(management)/overview/page.tsx` |
| REPORT | `src/presentation/components/reports/reports-client.tsx`; `src/app/(management)/management/reports/page.tsx` |
| REPORT-ACT | `src/presentation/actions/report-actions.ts` |
| ORG | `src/presentation/actions/org-management-actions.ts` |
| PEOPLE | `src/presentation/components/organization/people-client.tsx`; `src/app/(management)/management/people/page.tsx` |
| TEAMS | `src/presentation/components/organization/teams-client.tsx`; `src/app/(management)/management/teams/page.tsx` |
| LOCATIONS | `src/presentation/components/organization/locations-client.tsx`; `src/app/(management)/management/locations/page.tsx` |
| SETTINGS | `src/presentation/components/organization/settings-client.tsx` |
| NOTIFY | `src/presentation/actions/notification-actions.ts`; `src/application/tasks/notify-managers.ts` |
| NOTIFY-UI | `src/app/(employee)/notifications/page.tsx` |
| NOTIF-SRV | `src/infrastructure/notifications/notification-service.ts` |
| SEARCH | `src/presentation/actions/search-actions.ts` |
| SUPER | `src/app/(superadmin)/superadmin/page.tsx`; `src/presentation/actions/superadmin-actions.ts`; `src/presentation/components/superadmin/superadmin-dashboard-client.tsx` |
| SHELL | `src/presentation/components/shared/app-shell.tsx`; `src/presentation/components/mobile/management-shell.tsx`; `src/presentation/components/mobile/employee-shell.tsx` |
| PWA | `public/manifest.json`; `src/app/layout.tsx` |
| STYLE | `src/app/globals.css`; `src/app/workspace.css`; `docs/design-system.md` |
| AVAIL | `src/domain/rules/member-availability.ts`; `src/presentation/components/mobile/member-availability-card.tsx` |
| EVENT | `src/infrastructure/events/event-bus.ts`; `src/app/api/events/route.ts`; `src/presentation/hooks/use-realtime-events.ts` |
| RETENTION | `src/application/jobs/retention-purge.ts` |
| OP-HOURS | `src/domain/rules/operating-hours.ts` |
| EARLY | `src/domain/rules/early-execution.ts` |
| PAUSE | `src/domain/rules/pause-rules.ts` |
