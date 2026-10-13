# Prompt completo — aplicativo Marcaí para funcionários

Referência: código local inspecionado em 13/10/2026. Copie este documento integralmente para a IA responsável pela implementação. Os caminhos referem-se ao projeto original; confirme o estado mais recente dos arquivos antes de implementar.

---

Atue como especialista sênior em UX/UI mobile, arquitetura React Native, segurança de aplicações e notificações operacionais. Implemente o aplicativo **Marcaí para funcionários**, para iOS e Android, reproduzindo integralmente as capacidades da área do funcionário do projeto localizado em:

`C:/Users/gabriel/development/marcai`

O resultado deve ser um aplicativo nativo em React Native, conectado ao backend existente, funcional e preparado tecnicamente para distribuição na App Store e no Google Play. A experiência deve ser simples, clara, minimalista, rápida e reconhecível como Marcaí, com forte inspiração nos aplicativos nativos de iPhone.

**As notificações push são o principal diferencial do produto e o requisito de maior prioridade.** Trate confiabilidade, precisão de destinatários, segurança, navegação ao tocar no aviso, recuperação de falhas e observabilidade como parte central da arquitetura.

Você tem autonomia para melhorar interface, acessibilidade, desempenho, organização do código e segurança. Preserve as regras operacionais válidas e documente qualquer divergência encontrada. Não reproduza falhas de implementação como se fossem requisitos. Não simplifique funcionalidades para entregar apenas um protótipo visual.

## 1. Entendimento obrigatório antes de implementar

1. Leia `C:/Users/gabriel/development/marcai/AGENTS.md`. Antes de alterar código Next.js, consulte os guias relevantes em `C:/Users/gabriel/development/marcai/node_modules/next/dist/docs/`, especialmente Route Handlers, autenticação e Server Actions. O projeto inspecionado usa Next.js 16.3.6, React 19.2.8 e Prisma 7.10; não suponha compatibilidade com versões anteriores.
2. Inspecione o estado atual do repositório, incluindo arquivos modificados e novos ainda não versionados. Existem alterações locais importantes na área do funcionário, autenticação, processos e templates. Não descarte, restaure ou sobrescreva trabalho existente.
3. Leia `C:/Users/gabriel/development/marcai/package.json`, `C:/Users/gabriel/development/marcai/prisma/schema.prisma` e `C:/Users/gabriel/development/marcai/src/domain/types/index.ts`.
4. Consulte `C:/Users/gabriel/development/marcai/docs/architecture-design.md`, `C:/Users/gabriel/development/marcai/docs/design-system.md` e `C:/Users/gabriel/development/marcai/docs/auditoria-produto.md`. São referências históricas: o código e os testes atuais têm mudanças posteriores. Por exemplo, a documentação antiga exige início explícito e descreve pausas, enquanto a implementação atual permite conclusão direta, inicia várias tarefas automaticamente e desabilita novas pausas.
5. Produza uma matriz de rastreabilidade: capacidade existente → tela original → função de domínio/aplicação → endpoint mobile → tela nativa → teste de aceite. Faça a leitura transitiva dos imports e dos pontos que criam, alteram ou notificam tarefas; a área do funcionário depende de ações da gestão e de jobs.
6. Diferencie sempre **comportamento atual**, **regra de negócio confirmada**, **defeito encontrado** e **melhoria proposta**. Resolva diferenças técnicas pela fonte de verdade do servidor. Só peça decisão do responsável quando houver uma ambiguidade real de produto que altere permissões, prazos, resultados ou exceções.
7. Crie o app em projeto próprio. Destino sugerido: `C:/Users/gabriel/development/marcai-mobile`, se ainda não existir. Mantenha o projeto web como backend e referência. Alterações necessárias no backend devem ser pequenas, compatíveis com a web, revisáveis e acompanhadas de testes relevantes.

## 2. Arquitetura real do sistema original

- **Dados operacionais:** PostgreSQL e Prisma, em `C:/Users/gabriel/development/marcai/src/infrastructure/database/prisma.ts`. Não existe evidência de uso de Firestore como banco operacional nesta versão.
- **Autenticação:** implementação própria com PIN/senha, bcrypt, JWT assinado em cookie HttpOnly, TOTP e WebAuthn/passkeys. Firebase Authentication não é o mecanismo atual.
- **Firebase:** inicialização web, Analytics e Firebase Cloud Messaging; Firebase Admin faz os envios no servidor. Reutilize o projeto Firebase e a integração de servidor existentes, após verificar a configuração real.
- **Tempo real:** SSE em `/api/events`, alimentado por um `EventEmitter` em memória. Isso precisa ser adaptado para autenticação mobile e fortalecido para múltiplas instâncias e reconexão.
- **Mutação de dados:** principalmente Server Actions. React Native precisa de uma API autenticada e versionada que exponha os mesmos casos de uso; não deve importar Server Actions como se fossem funções locais.
- **Evidências:** arquivos privados no armazenamento do servidor, atualmente em diretório definido por `EVIDENCE_STORAGE_DIR` ou `.data/evidence`, com downloads autenticados. Não presuma que Firebase Storage já armazena essas evidências.
- **Hierarquia:** organização → processo e versões → rotina → execução com snapshot → tarefas → atribuições, evidências, aprovações e ocorrências.

Reutilize domínio e casos de uso onde possível; extraia funções portáveis quando necessário. Prisma, Firebase Admin, credenciais privadas, acesso ao banco e validações finais permanecem no servidor. Não migre banco, autenticação ou fornecedor de tempo real sem necessidade demonstrável.

## 3. Mapa completo das telas do funcionário e autenticação compartilhada

As pastas entre parênteses são grupos de rotas Next.js e não fazem parte das URLs.

| Tela/fluxo a implementar | Onde estudar no projeto original | O que precisa reproduzir |
| --- | --- | --- |
| Inicialização e recuperação de sessão | `C:/Users/gabriel/development/marcai/src/app/page.tsx`; `C:/Users/gabriel/development/marcai/src/app/layout.tsx` | Resolver identidade, organização e papel; encaminhar funcionário para tarefas; impedir flash de conteúdo protegido. No app, incluir estado de sessão expirada e retomada de destino de push. |
| Login, URL `/login` | `C:/Users/gabriel/development/marcai/src/app/(auth)/login/page.tsx` | PIN como acesso principal, organização + matrícula + PIN de 6 dígitos; senha quando aplicável; biometria/passkey; carregamento, erros e ajuda. O usuário não cria tarefas nem contas administrativas por esta tela. |
| Verificação adicional, URL `/verify-access` | `C:/Users/gabriel/development/marcai/src/app/(auth)/verify-access/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/auth/two-factor-form.tsx` | TOTP quando a conta exige 2FA, código de recuperação, expiração de desafio e mensagens claras. Separar cadastro inicial de autenticador da verificação de um autenticador existente. |
| Seleção de organização, URL `/select-org` | `C:/Users/gabriel/development/marcai/src/app/(auth)/select-org/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/auth/select-org-client.tsx` | Vínculos ativos, organização atual e papel. No app exclusivo de funcionários, definir tratamento claro para vínculos com papel gerencial, sem incorporar os painéis da gestão. |
| Troca de organização dentro do app | `C:/Users/gabriel/development/marcai/src/presentation/components/shared/organization-switcher.tsx` | Troca validada no backend; limpeza de cache e rascunhos do contexto anterior; ressincronização de tarefas, avisos e permissões. |
| Aprovação de login web por QR, URL `/login/qr/[token]` | `C:/Users/gabriel/development/marcai/src/app/(auth)/login/qr/[token]/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/actions/mobile-auth-actions.ts`; `C:/Users/gabriel/development/marcai/src/presentation/actions/webauthn-actions.ts` | Interoperabilidade de login por passkey. Se disponibilizado no app, mostrar contexto da solicitação e confirmação consciente antes de aprovar uma sessão no computador. Fortalecer o protocolo antes de expô-lo. |
| Minhas tarefas, URL `/tasks` | `C:/Users/gabriel/development/marcai/src/app/(employee)/tasks/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/employee-kanban-board.tsx` | Quadro, filtros, busca, tarefas atribuídas, tarefas para assumir, prazos, tolerância, cronômetros, processos agrupados e atalhos seguros. |
| Detalhe de tarefa por URL `/tasks/[id]` | `C:/Users/gabriel/development/marcai/src/app/(employee)/tasks/[id]/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/task-detail-client.tsx` | Descrição, instruções, dependências, ocorrências, evidências, questionário, conclusão, envio para aprovação e impedimento. Deve ter paridade com o detalhe aberto pelo quadro. |
| Detalhe de tarefa em painel inferior | `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/task-detail-drawer.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/task-detail-sheet.tsx` | Carregamento pelo identificador, formulários, evidências e ação fixa. O arquivo `task-detail-sheet.tsx` é apenas um reexport do drawer. Unificar a implementação nativa para evitar diferenças entre entradas. |
| Detalhe de execução de processo e suas etapas | `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/process-detail-drawer.tsx`; `getEmployeeProcessExecutionAction` em `C:/Users/gabriel/development/marcai/src/presentation/actions/process-actions.ts` | Visão geral do processo → etapa → retorno ao processo; progresso, sequência livre/restrita/customizada, tarefas obrigatórias/opcionais e responsáveis. Não há página própria de funcionário para processos nesta versão: o acesso ocorre pelo quadro. |
| Captura/visualização de evidências | `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/task-evidence-item.tsx` | Foto, vídeo, arquivo, texto, número, assinatura desenhada e localização; preview, troca, limites, tentativas, status de validação e evidências anteriores autorizadas. |
| Questionário de tarefa `FORM` | `C:/Users/gabriel/development/marcai/src/presentation/components/shared/form-choice-input.tsx`; os três componentes de detalhe anteriores | Texto curto/longo, avaliação 1–5, escolha única entre alternativas, sim/não, foto, vídeo e arquivo. A definição vem da tarefa, não é fixa no app. |
| Histórico, URL `/history` | `C:/Users/gabriel/development/marcai/src/app/(employee)/history/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/employee-history-list.tsx` | Concluídas, canceladas e não realizadas; períodos 7, 30, 90 e 365 dias; padrão 30 dias; paginação original de 20 itens; abertura de detalhes. A consulta atual usa `updatedAt` como recorte. |
| Avisos, URL `/notifications` | `C:/Users/gabriel/development/marcai/src/app/(employee)/notifications/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/actions/notification-actions.ts` | Todos/não lidos/lidos, prioridade, data, contador e link para tarefa; marcar um ou todos como lidos. Existem também ações para não lido, exclusão e limpeza de lidos, que não estão todas expostas na página atual. |
| Minha conta, URL `/account` | `C:/Users/gabriel/development/marcai/src/app/(employee)/account/page.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/shared/face-id-setup.tsx` | Nome, e-mail quando existente, papel, matrícula, organização/identificador, biometria e logout. Sem edição livre do cadastro pelo funcionário. |
| Estrutura de navegação e busca global | `C:/Users/gabriel/development/marcai/src/presentation/components/mobile/employee-shell.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/shared/app-shell.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/actions/search-actions.ts` | Quatro abas: Tarefas, Histórico, Avisos e Conta; badge de não lidos; contexto da organização. Busca global do funcionário limitada a tarefas autorizadas; busca do quadro também considera unidade/processo. |
| Aviso de vigência do plano | `C:/Users/gabriel/development/marcai/src/presentation/components/shared/subscription-expiration-card.tsx`; `C:/Users/gabriel/development/marcai/src/application/superadmin/manual-subscription.ts` | Aviso contextual de expiração; orientação apropriada ao funcionário. Não inventar bloqueio de operação ou cobrança no app porque um banner informa vigência encerrada. |
| Carregamento, falha e recurso indisponível | `C:/Users/gabriel/development/marcai/src/app/(employee)/loading.tsx`; `C:/Users/gabriel/development/marcai/src/app/loading.tsx`; `C:/Users/gabriel/development/marcai/src/app/error.tsx`; `C:/Users/gabriel/development/marcai/src/app/not-found.tsx` | Estados nativos claros para espera, falta de conexão, falha recuperável, acesso revogado e tarefa removida. |

Inclua no app uma tela simples de **estado das notificações** em Conta/Avisos: permissão do sistema, registro deste aparelho, data da última sincronização, teste solicitado pelo usuário e acesso aos ajustes. É uma melhoria nativa proposta, não uma página já existente.

O histórico atual lista resultados de tarefas; **uma timeline completa de ActivityLog não é uma página existente de funcionário**. Disponibilize a timeline autorizada no detalhe como melhoria, com projeção segura e sem expor dados administrativos ou atividades de terceiros fora do escopo.

## 4. Onde encontrar as funções e regras para implementação

| Responsabilidade | Arquivos e pontos de entrada |
| --- | --- |
| PIN, senha, organizações e logout | `C:/Users/gabriel/development/marcai/src/presentation/actions/auth-actions.ts`: `loginWithPinAction`, `loginWithPasswordAction`, `getUserOrganizationsAction`, `switchOrganizationAction`, `logoutAction`, `loginWithMobileSessionAction`. |
| Sessão e autorização | `C:/Users/gabriel/development/marcai/src/infrastructure/security/session.ts`: JWT HS256 assinado, validade web de 7 dias; `C:/Users/gabriel/development/marcai/src/application/security/auth-context.ts`: `getAuthenticatedContext`; `C:/Users/gabriel/development/marcai/src/application/security/operational-scope.ts`: `taskScope`, `eligibleMember`, `isManagement`. |
| Passkeys/biometria web | `C:/Users/gabriel/development/marcai/src/presentation/actions/webauthn-actions.ts`: geração e verificação de cadastro/autenticação; modelo `PasskeyAuthenticator` no schema. Não transportar `@simplewebauthn/browser` para RN. |
| Segundo fator e recuperação | `C:/Users/gabriel/development/marcai/src/presentation/actions/two-factor-actions.ts`; `C:/Users/gabriel/development/marcai/src/infrastructure/security/login-challenge.ts`; `C:/Users/gabriel/development/marcai/src/infrastructure/security/totp.ts`; `C:/Users/gabriel/development/marcai/src/presentation/actions/recovery-actions.ts`. Há ações de recuperação/convite, mas as URLs de recuperação citadas no serviço não constam entre as páginas inspecionadas; confirme e complete o percurso antes de oferecer links. |
| Iniciar, comprovar, entregar e buscar detalhes | `C:/Users/gabriel/development/marcai/src/presentation/actions/task-actions.ts`: `startTaskAction`, `submitEvidenceAction`, `uploadEvidenceAction`, `uploadTaskFormFileAction`, `completeTaskAction`, `getTaskDetailAction`; função interna `saveEvidence`. |
| Assumir, retomar, impedimento e efeitos da gestão | `C:/Users/gabriel/development/marcai/src/presentation/actions/management-task-actions.ts`: `claimTaskAction`, `resumeTaskAction`, `reportImpedimentAction`; estudar também `createAdHocTaskAction`, `reassignTaskAction`, `transferTaskAction`, `cancelTaskAction` e `submitApprovalDecisionAction`. A localização do arquivo não torna todas essas funções exclusivas da gestão; leia cada guarda. |
| Transições e elegibilidade | `C:/Users/gabriel/development/marcai/src/domain/rules/task-rules.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/member-access.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/dependency-rules.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/task-edit.ts`. |
| Prazos, tolerância e relógio | `C:/Users/gabriel/development/marcai/src/domain/rules/employee-task-clock.ts`: `taskClock`, `formatClock`; `C:/Users/gabriel/development/marcai/src/domain/rules/task-metrics.ts`: `taskTiming`, `getTaskDeadlineStatus`; `C:/Users/gabriel/development/marcai/src/domain/rules/sla-events.ts`. |
| Agendamento e horário operacional | `C:/Users/gabriel/development/marcai/src/domain/rules/schedule.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/early-execution.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/operating-hours.ts`. |
| Disponibilidade e compatibilidade de pausas | `C:/Users/gabriel/development/marcai/src/domain/rules/member-availability.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/pause-rules.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/execution-state.ts`. Não criar controle manual de disponibilidade: a ação atual o rejeita. |
| Bloqueio concorrente e atualização da execução | `C:/Users/gabriel/development/marcai/src/application/tasks/task-lock.ts`: trava de execução antes da tarefa; `C:/Users/gabriel/development/marcai/src/application/tasks/synchronize-execution.ts`: dependências, elegibilidade, liberação e estado consolidado. |
| Correção e evidências por rodada | `C:/Users/gabriel/development/marcai/src/application/tasks/evidence-round.ts`: `getEvidenceRound`, `evidenceInRound`; último evento `TASK_CORRECTION_REQUESTED`/`APPROVAL_REJECTED` delimita a rodada. |
| Formulários dinâmicos | `C:/Users/gabriel/development/marcai/src/domain/rules/process-definition.ts`: `formFieldSchema`, `processTaskSchema`; `C:/Users/gabriel/development/marcai/src/domain/rules/form-answers.ts`: `validateFormAnswers`; `C:/Users/gabriel/development/marcai/src/presentation/components/shared/form-fields-editor.tsx` para entender a definição produzida pela gestão. |
| Processo e conclusão global | `C:/Users/gabriel/development/marcai/src/presentation/actions/process-actions.ts`: `getEmployeeProcessExecutionAction`, `completeProcessExecutionAction`; `C:/Users/gabriel/development/marcai/src/domain/rules/execution-state.ts`: `resolveExecutionStatus`. |
| Origem/versionamento dos processos | `C:/Users/gabriel/development/marcai/src/application/processes/save-process.ts`; `C:/Users/gabriel/development/marcai/src/application/processes/materialize-tasks.ts`; `C:/Users/gabriel/development/marcai/src/application/processes/generate-execution.ts`; `C:/Users/gabriel/development/marcai/src/application/processes/execution-lifecycle.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/routine-generator.ts`. |
| Templates que alimentam os processos | `C:/Users/gabriel/development/marcai/src/application/templates/template-library.ts`; `C:/Users/gabriel/development/marcai/src/domain/rules/reusable-template-definition.ts`; `C:/Users/gabriel/development/marcai/src/infrastructure/templates/catalog.ts`. Entender a origem e snapshots; a biblioteca gerencial não vira uma tela do funcionário. |
| Arquivos privados de evidência | `C:/Users/gabriel/development/marcai/src/infrastructure/storage/evidence-storage.ts`: inspeção de conteúdo e armazenamento; `C:/Users/gabriel/development/marcai/src/app/api/evidence/[id]/route.ts`; `C:/Users/gabriel/development/marcai/src/app/api/tasks/[id]/form-file/[key]/route.ts`. |
| Notificações a gestores, atribuídos e aprovadores | `C:/Users/gabriel/development/marcai/src/application/tasks/notify-managers.ts`: `notifyManagers`, `notifyTaskAssignees`, `notifyApprovers`. |
| Jobs e alertas automáticos | `C:/Users/gabriel/development/marcai/src/application/processes/operational-tick.ts`; `C:/Users/gabriel/development/marcai/src/app/api/jobs/operational/route.ts`; `C:/Users/gabriel/development/marcai/src/infrastructure/security/cron-auth.ts`. A existência da rota não comprova que um agendador externo esteja ativo. |
| Retenção e recursos que deixam de existir | `C:/Users/gabriel/development/marcai/src/application/jobs/retention-purge.ts`; `C:/Users/gabriel/development/marcai/src/app/api/jobs/retention/history/route.ts`; `C:/Users/gabriel/development/marcai/src/app/api/jobs/retention/trash/route.ts`. Respeitar políticas configuradas, expurgo e invalidar cache mobile. |

## 5. Regras funcionais que devem permanecer corretas

### 5.1 Identidade, organização e permissões

- PIN identifica **organização + matrícula + seis dígitos**; nunca PIN isolado. PIN é verificado no backend contra hash. Não armazene PIN em texto nem use PIN local para substituir autenticação remota.
- Valide usuário, vínculo e organização ativos a cada operação. Acessos temporários só valem dentro de `startsAt`/`expiresAt`; não basta guardar permissões no primeiro login.
- Funcionário opera tarefas atribuídas e pode consultar/assumir tarefas sem responsável primário quando pertence à equipe e tem acesso vigente à unidade. Respeite `removedAt` nas atribuições.
- Diferencie `PRIMARY`, `COLLABORATOR` e `JOINT_EXECUTOR`. Não confunda identificador de usuário com identificador de vínculo na organização.
- Funcionário não cria/edita livremente tarefas, não decide aprovações gerenciais, não cancela rotinas como gestor, não acessa lixeira administrativa e não altera cadastro corporativo.
- A interseção de equipe **e** unidade para MANAGER é relevante ao calcular destinatários de alertas da liderança. Preserve a separação entre funcionário, gestão e superadmin.
- A troca de organização deve produzir novo contexto e caches distintos. Um aviso da organização A não autoriza abrir a tarefa A enquanto a sessão está na organização B.

### 5.2 Quadro Kanban e agrupamento

Reproduza as cinco colunas atuais: **A Fazer (Hoje), Atrasadas, Para Assumir, Concluídas Hoje e Próximos Dias**. São categorias de apresentação, não transições livres de estado.

- Navegação horizontal com encaixe por coluna e lista vertical de cartões; seleção por rótulo acessível e contador. Não obrigar o usuário a descobrir um gesto.
- Não adicionar arraste de cartão que altere status ou contorne evidências, prazo e aprovação. O quadro atual não implementa mudança de estado por drag-and-drop.
- Busca por título, unidade e processo; filtros **Todos / Tarefas / Com perguntas**; preserve filtros e posição ao abrir/fechar detalhes.
- A consulta original inclui tarefas ativas e concluídas desde o início do dia, com exclusão de tarefas removidas. Canceladas e não realizadas ficam no histórico.
- A UI atual trata agendamento futuro a menos de 24 horas como A Fazer/Para Assumir e a partir de 24 horas como Próximas. Há também classificação pelo fim do dia para deadlines; documente e alinhe essa diferença com os rótulos, usando o fuso operacional.
- A coluna inicial favorece A Fazer; se não houver tarefas para hoje, pode cair em Atrasadas ou Para Assumir. Um destino explícito de navegação deve prevalecer.
- Cartão apresenta título, tipo, estado, prazo/tolerância, tempo decorrido e próxima ação. Unidade só precisa ocupar espaço quando há várias unidades; detalhes continuam acessíveis.
- Conclusão rápida está disponível para tarefa apropriada, sem evidência obrigatória e sem questionário, e continua validada pelo servidor. Não marque sucesso antes da confirmação.

**“Mesclagem” existente:** `buildKanbanItems` agrupa tarefas `origin=PROCESS` pelo mesmo `executionId` em um cartão com nome, etapas e progresso. Preserve essa identidade. Execuções diferentes do mesmo processo não podem ser agrupadas por nome ou `processId`, e processos independentes não são fundidos no banco. Se for exigida uma fusão real, trate como nova regra de produto a especificar.

### 5.3 Estados, início e conclusão

Estados de tarefa: `AVAILABLE`, `IN_PROGRESS`, `PAUSED`, `BLOCKED`, `SUBMITTED`, `NEEDS_CORRECTION`, `COMPLETED`, `CANCELLED`, `NOT_COMPLETED`. Estados de execução incluem também `SCHEDULED` e `PENDING_REVIEW`. Não misture os enums.

- Abrir um detalhe não deve disparar início. Entretanto, criação atribuída, liberação programada, assumir tarefa e desbloqueio podem iniciar a tarefa no servidor. O app não deve inventar um botão “Iniciar” obrigatório para todos os fluxos.
- A conclusão direta é permitida de `AVAILABLE`, `IN_PROGRESS`, `NEEDS_CORRECTION` e `PAUSED` quando todos os requisitos e guardas são atendidos.
- Assumir tarefa é uma operação concorrente e atômica. Se outra pessoa assumir primeiro, explique o ocorrido, remova a ação e atualize o quadro.
- `BLOCKED` impede início e conclusão; estados terminais e `SUBMITTED` impedem nova entrega pelo funcionário.
- Sem workflow, entrega válida resulta em `COMPLETED`. Com workflow, resulta em `SUBMITTED`: a interface deve dizer “Enviado para aprovação”, e não “Concluído”.
- Aprovação sequencial/paralela, rejeição e responsável substituto são regras do backend. Funcionário acompanha; não ganha poder de aprovador pela UI.
- Rejeição gera necessidade de correção e nova rodada de evidências; reenviar preserva histórico e decisões anteriores.
- Novas pausas estão **desabilitadas** em `canPauseTask` e `pauseTaskAction`. `PAUSED` e retomar existem para compatibilidade. Não reintroduzir pausa nem disponibilidade manual por causa de documentação antiga.

### 5.4 Deadline, SLA e tolerância

- Havendo `deadlineAt` e `slaDueAt`, o bloqueio de entrega usa o **menor instante válido**. Não invente prazo quando ambos são nulos.
- `toleranceMinutes` é configurável; o fallback atual é **20 minutos**. Use `??`, preservando o valor zero.
- Até o prazo: dentro do prazo. Depois dele, até o prazo + tolerância inclusive: em tolerância. Quando `serverNow > dueAt + toleranceMinutes`: conclusão e envio de evidências bloqueados.
- Exemplo: prazo 10h00 e tolerância 20 minutos permitem entrega às 10h20 exatas; um instante posterior deve ser rejeitado. O instante recebido pelo servidor é a autoridade, inclusive em uploads demorados.
- Mostrar bloqueio com motivo e próxima orientação: aguardar atuação da gestão. Não conceder minutos extras ao reiniciar o app, alterar o relógio do aparelho, ficar offline ou trocar de aba.
- Bloqueio por **dependência** e bloqueio por **tolerância** são conceitos diferentes. O segundo hoje é calculado como condição, não como enum exclusivo. Modele o motivo explicitamente na API.
- Agendamento futuro impede assumir, enviar evidência e concluir nos fluxos atuais. `startTaskAction` tem políticas de início antecipado; não estenda automaticamente essa exceção à conclusão.
- Tarefa futura não deve parecer atrasada nem ter cronômetro correndo antes da liberação. Dependência bloqueante não deve parecer consumir SLA ativo.
- Diferencie tempo operacional decorrido e duração de trabalho calculada por sessões. O tempo de execução mostrado atualmente pretende congelar no limite de tolerância e em término; o cálculo precisa ser corrigido e testado para todos os estados.
- Mudanças de prazo pela gestão devem ressincronizar relógio e alertas. Reatribuição pode renovar prazo na implementação atual; não assuma que sempre preserva o prazo anterior.
- Use horário UTC para instantes e fuso IANA da unidade/rotina para apresentar dias/horários. Evite classificar “hoje” pelo fuso do servidor ou aparelho por acidente.

### 5.5 Dependências e processos

- `INFORMATIVE` não bloqueia; `BLOCKING` exige predecessora concluída; `APPROVAL_CONDITION` exige conclusão **e** aprovação da predecessora.
- AND exige todas as condições; OR exige pelo menos uma condição do grupo OR, sem ignorar as condições AND existentes.
- Use `evaluateTaskDependencies` como referência lógica; não substitua a regra por “todas as dependências completas”.
- Valide novamente a elegibilidade dos executores ao liberar uma etapa. Mostre por que uma etapa está indisponível e o que precisa acontecer.
- Preserve sequência `FREE`, `STRICT` e `CUSTOM`, mas derive permissões reais da mesma avaliação de domínio usada pelo servidor. A apresentação de sequência não pode transformar dependência informativa em bloqueante.
- A execução é calculada pelas tarefas **obrigatórias** e suas aprovações. Opcionais não bloqueiam a conclusão global no domínio atual. O botão manual de finalizar processo tem uma regra conflitante que precisa ser alinhada.
- Distinga progresso pessoal, progresso das tarefas visíveis e situação global da execução. A API deve retornar um resumo autorizado e fiel; não chamar de “processo concluído” porque todas as tarefas do recorte pessoal terminaram.
- Preservar `definitionSnapshot`, `definitionTaskId` e `definitionOrder`; não reordenar por título nem aplicar retrospectivamente alterações de templates.
- Rotinas respeitam `CREATE_NEW`, `SKIP_IF_PENDING` e `BLOCK_NEW`, validade, exceções e timezone. Uma execução futura já agendada não equivale a uma pendência anterior vencida.
- Geração, liberação, reabertura e cancelamento são responsabilidades do backend/job/gestão. O funcionário recebe seus efeitos em tempo real, mesmo sem abrir o app.

### 5.6 Evidências e formulários

Tipos reais nesta versão: **PHOTO, VIDEO, FILE, TEXT, NUMBER, SIGNATURE e LOCATION**. Não anunciar AUDIO ou o enum GPS: eles aparecem em documentação histórica, mas não estão no enum atual.

- Respeite requisito obrigatório/opcional, quantidade mínima/máxima, etapa `START`/`COMPLETION`, tentativas, validação e rodada de correção. `validationConfig` existe no modelo; verifique quais regras estão efetivamente aplicadas antes de prometer suporte.
- A experiência principal permite capturar/preencher rascunhos e tocar uma vez em **Concluir tarefa/Enviar para aprovação**. A execução técnica pode fazer vários uploads antes da entrega; mostre progresso sem exigir repetição desnecessária.
- Foto: câmera traseira, preview e nova captura; seleção de arquivo só quando a política aplicável permitir. Vídeo: captura/seleção e preview. Arquivo: seletor do sistema. Assinatura: desenho, limpar e visualizar. Localização: captura pontual com precisão informada, sem rastreamento contínuo.
- O servidor atual aceita JPG/PNG/WebP, PDF e MP4 conforme tipo e conteúdo real, com limite de **10 MB** para evidências. Anexos de formulário têm limite separado de **12 MB** e validação menos completa. Uniformize a segurança sem alterar limites de produto silenciosamente.
- iPhone pode gerar HEIC/MOV e mídias muito grandes. Converta/comprima quando necessário para formatos aceitos, preservando legibilidade, orientação e precisão. Não reduzir a foto a ponto de inutilizar a comprovação.
- Nunca enviar string de URI local como prova de upload. Upload precisa produzir registro/chave de armazenamento autorizado, verificável e vinculado à tarefa/requisito/campo.
- TEXT: não vazio, até 10.000 caracteres no fluxo de evidência atual. NUMBER: valor finito, incluindo zero e decimal com vírgula. LOCATION: latitude/longitude válidas e `accuracy` não negativa; servidor registra recebimento e contexto.
- **Após três rejeições de validação registradas pelo servidor por requisito e rodada**, a regra D-05 permite continuidade com ressalva e ocorrência crítica para gestão. Não aumentar tentativas por falta de conexão, permissão negada, cancelamento de captura ou validação local. Não simular rejeições para obter dispensa.
- A dispensa após três falhas não elimina bloqueios de tolerância, agendamento, autorização ou dependência. Não tratar uma evidência rejeitada como válida; mostrar claramente “continuidade com ressalva”.
- Correção usa somente envios da rodada atual para elegibilidade, mantendo rodadas anteriores consultáveis conforme autorização. Não apagar evidências e decisões antigas para “resetar” a tarefa.
- Questionários dinâmicos validam obrigatoriedade, tipos, opções permitidas, rating inteiro 1–5 e texto até 5.000 caracteres no validador atual. `false` e `0` não representam ausência de resposta.
- Validar anexos de questionário também no servidor: campo existente, tipo, MIME, bytes, tamanho, propriedade da chave, estado, agendamento e tolerância. Não confiar no JSON enviado pelo app.
- Preservar rascunhos durante falha de rede, ida à câmera, atualização em tempo real e retorno de background. Isolar os rascunhos por usuário/organização/tarefa/rodada e descartá-los de forma segura em logout, revogação ou mudança de contexto.

### 5.7 Impedimento, histórico, conta e avisos

- “Não foi possível realizar” exige categoria e justificativa de 3–1.000 caracteres, encerra sessões, cria ocorrência, muda para `NOT_COMPLETED`, audita e avisa a gestão. Não é uma pausa e não equivale a conclusão.
- Histórico deve permitir resultados e períodos atuais. Mostre término/cancelamento/ocorrência e comprovações autorizadas. Não transformar quantidade de tarefas em ranking de produtividade.
- Conta é consulta de dados corporativos, biometria, organização e sessão. Disponibilidade é calculada por vínculo ativo, expediente e tarefas em andamento; não há controle manual válido. O cálculo existe na página atual, mas não é exibido ali: se exibido no app, seja informativo.
- Avisos têm estado persistente de leitura e contador derivado do backend. Receber/exibir um push não significa que o aviso foi lido; abrir e carregar seu destino pode marcar leitura de maneira idempotente.
- Avisos de vigência do plano devem orientar o funcionário a falar com a gestão, sem expor configuração financeira nem inventar uma regra de suspensão.
- Evidências e histórico estão sujeitos à retenção configurada. Um recurso expurgado deve explicar sua indisponibilidade e não permanecer acessível indefinidamente em cache local.

## 6. Notificações push — prioridade máxima

### 6.1 Arquivos obrigatórios para estudar

| Etapa | Fonte |
| --- | --- |
| Inicialização Firebase web | `C:/Users/gabriel/development/marcai/src/infrastructure/firebase/firebase.ts`; `C:/Users/gabriel/development/marcai/src/lib/firebase.ts` é reexport. |
| Permissão e token no navegador | `C:/Users/gabriel/development/marcai/src/infrastructure/firebase/firebase-messaging.ts`; `C:/Users/gabriel/development/marcai/src/hooks/use-push-notifications.ts`. |
| Registro automático e convite de permissão | `C:/Users/gabriel/development/marcai/src/presentation/components/shared/push-notification-registrar.tsx`; `C:/Users/gabriel/development/marcai/src/presentation/components/shared/push-notification-banner.tsx`; inicialização em `C:/Users/gabriel/development/marcai/src/app/layout.tsx`. |
| Background/clique web | `C:/Users/gabriel/development/marcai/public/firebase-messaging-sw.js`. É referência do fluxo web; Service Worker e VAPID não são a implementação de push nativo. |
| Registro/remoção de dispositivo | `C:/Users/gabriel/development/marcai/src/presentation/actions/push-notification-actions.ts`: `saveDeviceTokenAction`, `removeDeviceTokenAction`; modelo `UserDeviceToken`. |
| Serviço de envio e registro | `C:/Users/gabriel/development/marcai/src/infrastructure/notifications/notification-service.ts`: `PUSH_ELIGIBLE_TYPES`, `isPushEligible`, `dispatchNotificationAsync`, `sendNotification`. |
| Firebase Admin/multicast | `C:/Users/gabriel/development/marcai/src/infrastructure/firebase/firebase-admin.ts`: `getFirebaseAdminApp`, `getFirebaseAdminMessaging`, `sendWebPushNotification`. |
| Destinatários e eventos operacionais | `C:/Users/gabriel/development/marcai/src/application/tasks/notify-managers.ts`; `C:/Users/gabriel/development/marcai/src/application/processes/operational-tick.ts`; ações de tarefas, aprovações, processos e reatribuição já mapeadas. |
| Eventos em tempo real | `C:/Users/gabriel/development/marcai/src/infrastructure/events/event-bus.ts`; `C:/Users/gabriel/development/marcai/src/app/api/events/route.ts`; `C:/Users/gabriel/development/marcai/src/presentation/hooks/use-realtime-events.ts`. |

### 6.2 Integração nativa

Reutilize o **mesmo projeto Firebase existente**, a origem dos eventos de negócio e a integração Firebase Admin. Registre aplicações iOS/Android próprias, com identificadores de pacote corretos, arquivos nativos específicos e ambientes controlados. Não copiar o `appId` web como identificação de app iOS/Android.

Preferência: `@react-native-firebase/app` + `@react-native-firebase/messaging` para FCM nativo, com apresentação/interação coordenada por `@notifee/react-native` quando necessária. Valide versões e config plugins. Essa integração requer development build nativo; Expo Go não serve como validação deste app. [Expo e Firebase](https://docs.expo.dev/guides/using-firebase/), [React Native Firebase Messaging](https://rnfirebase.io/messaging/usage).

No iOS, configurar APNs, entitlement de push, associação correta ao bundle ID e comportamento para alertas/background. No Android, canais, ícone de notificação adequado e permissão de notificações nas versões que a exigem. [Configuração iOS](https://rnfirebase.io/messaging/usage/ios-setup), [permissão Android](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

Verifique a documentação atual de FCM/Admin e seus avisos de depreciação antes de perpetuar as APIs existentes de endereçamento de instalações/tokens. Preserve compatibilidade com dispositivos web e faça migrações de forma gradual, conforme suporte efetivo das versões utilizadas. [Envio com Firebase Admin](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk).

### 6.3 Matriz de eventos

| Evento | Destinatário/experiência esperada |
| --- | --- |
| `TASK_ASSIGNED` | Responsável recebe tarefa nova, de processo ou reatribuição/renovação pertinente; abre a tarefa e, se aplicável, o contexto da execução. |
| `TASK_UNBLOCKED` | Executor autorizado recebe liberação de etapa quando há ação útil; cobertura deve ser completada, pois o fluxo atual persiste aviso sem garantir despacho push. |
| `TASK_EXPIRING_SOON` | Responsáveis recebem aviso preventivo; janela atual de 30 minutos antes de `slaDueAt`, sem repetir em cada tick. |
| `TASK_OVERDUE` / `SLA_BREACH` | Responsáveis e gestores no escopo apropriado; marcos atuais incluem 0 e, por padrão, 15/30/60/120 minutos. Quando o job recupera atraso, emitir apenas o marco mais recente aplicável, sem tempestade. |
| `TASK_TOLERANCE_EXCEEDED` | Informar bloqueio e avisar a gestão com destinatários corretos. Incluir o evento na política de envio; hoje não aparece na allowlist push e o aviso depende da tentativa de concluir. |
| `TASK_CORRECTION_REQUESTED` | Funcionário recebe motivo de correção e link para reenviar; reabertura de execução precisa entrar no mesmo pipeline confiável. |
| `APPROVAL_REQUESTED` | Aprovador/gestão correspondente recebe entrega pendente; o app de funcionário exibe aguardando revisão. |
| `APPROVAL_UPDATED` | Funcionário acompanha resultado; alinhar a nomenclatura do registro persistido e do evento push, que atualmente pode variar na rejeição. |
| `TASK_CANCELLED` / `TASK_TRANSFERRED_OUT` | Revogar ação/acesso e sincronizar o app anterior. Definir quando push é necessário; atualização dentro do app permanece indispensável. |
| `OPERATIONAL_ALERT` / `VALIDATION_EXCEPTION` | Gestão recebe impedimento e dispensa após três falhas; contexto suficiente para agir e sem vazamento a outros funcionários. |
| `EXECUTION_COMPLETED` e alterações de execução | Atualizar resumo, etapas, histórico e avisos de quem deve acompanhar. |

Audite também alertas de aprovação vencida e tarefa sem responsável: são relevantes ao backend, embora não virem telas gerenciais no aplicativo do funcionário. Não ativar alertas de novas pausas porque essa capacidade está desabilitada.

### 6.4 Confiabilidade do servidor

1. **Outbox transacional persistente:** estado da tarefa, auditoria, aviso e evento de despacho devem ser registrados na mesma transação. Um worker processa depois do commit. Não usar somente `void dispatchNotificationAsync(...)` como garantia de execução, especialmente dentro de transações ou em ambientes serverless.
2. **Identidade estável:** evento, aviso e entrega têm IDs correlacionáveis. Chave de idempotência considera organização, evento, destinatário, instalação e canal. Incluir ciclo/versão de prazo/rodada quando necessário para não suprimir um novo alerta legítimo após reatribuição ou correção.
3. **Retentativas:** backoff exponencial com jitter, respeito a erros transitórios/limites do provedor, limite de tentativas, fila de falhas e reprocessamento observável. Token inválido é tratado como falha permanente e removido; não repetir indefinidamente.
4. **Entregas por instalação:** registrar tentativas e resposta de cada destinatário. Fracionar lotes conforme limites atuais da API; sucesso de um token não prova sucesso de todos.
5. **Estados honestos:** diferenciar enfileirado, enviado/aceito pelo provedor, falha permanente, sem dispositivo, recebido/aberto quando houver confirmação observável e lido no produto. O código atual chama de `DELIVERED` um resultado aceito pelo Firebase; corrija essa interpretação. [Medição de entrega FCM](https://firebase.google.com/docs/cloud-messaging/understand-delivery).
6. **Vigência:** configurar TTL e política de agrupamento por significado. Um alerta de tarefa cancelada/concluída não pode chegar dias depois como ordem de execução. Revalidar estado antes de despachar e antes de executar ações. [Validade de mensagens](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan).
7. **Precisão:** gerar avisos de deadline/tolerância no backend, com agendador realmente configurado, monitorado e testado. Não depender de timers JS, tela aberta ou push silencioso para fazer regras de negócio acontecerem.
8. **Métricas:** acompanhar idade da fila, tempo até aceite do provedor, falhas por plataforma, credenciais/APNs inválidos, tokens obsoletos, destinatários sem dispositivo e abertura quando disponível. Definir metas mensuráveis em ambiente saudável e alarmes operacionais.

### 6.5 Cadastro, segurança e ciclo de vida do dispositivo

- Vincular instalação ao usuário autenticado, plataforma, ambiente, versão do app, status de permissão e última atualização. Manter suporte a vários aparelhos e tokens/identificadores rotativos.
- Registrar/atualizar ao autenticar e na rotação; sincronizar permissões ao retornar de ajustes; remover ou desassociar no logout, troca de conta e revogação. `Notification.permission=granted` na web não comprova registro concluído; no app também não confundir permissão com inscrição válida.
- Revalidar vínculo ativo, autorização e contexto organizacional ao despachar. Definir explicitamente política para avisos de outras organizações às quais o usuário pertence, sem inferi-la apenas da organização aberta na tela.
- Nunca aceitar `userId` arbitrário enviado pelo cliente para registrar dispositivo em outra conta. Proteger cadastro/remoção com sessão e limites de abuso.
- Credenciais de Firebase Admin/APNs/conta de serviço permanecem no servidor ou no sistema de segredos de build. Arquivos de configuração cliente não substituem autenticação/autorização. Não colocar chaves privadas em bundles, logs ou repositório.
- Payload mínimo: IDs e contexto necessário à navegação, sem PIN, tokens de acesso, URLs privadas duradouras, dados de evidência ou segredos. Previews de tela bloqueada devem respeitar privacidade.
- Proteger contra links arbitrários e payloads manipulados. Rota em allowlist; a API confirma acesso ao recurso. Tópicos públicos não são mecanismo de isolamento entre empresas.

A higiene de instalações/tokens e atualização periódica devem seguir a documentação vigente. [Gestão de tokens FCM](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

### 6.6 Recepção, apresentação e navegação

- Cobrir foreground, background e inicialização a partir de um toque com app encerrado. Registrar handlers cedo e separar recebimento de navegação: o destino aguarda sessão, organização e navegador prontos.
- Definir **um único responsável por exibir cada aviso**. Se o sistema já apresentou um payload com `notification`, não exibir uma segunda notificação local do mesmo evento. Coordenar Firebase/Notifee e deduplicar por ID estável.
- Não depender exclusivamente de mensagens `data-only` ou push silencioso para alertas importantes. O sistema operacional pode limitar execução em background. Não usar PushKit/VoIP, full-screen intents ou permissões de alarmes exatos para contornar restrições de um app comum.
- Respeitar prioridade adequada e canais; urgência real deve ter tratamento apropriado, sem classificar todo aviso como crítico. [Prioridade FCM Android](https://firebase.google.com/docs/cloud-messaging/android-message-priority).
- Um toque abre **a tarefa ou a etapa certa**, preserva contexto do processo e solicita autenticação se necessário. Depois de login, continuar ao destino original somente se autorizado.
- Tratar recurso removido, concluído, transferido, organização inativa e sessão revogada com mensagem útil. O push não autoriza concluir tarefa nem contorna evidências.
- Atualizar contador pelo servidor; receber o mesmo evento via push e SSE não incrementa duas vezes. “Marcar como lido” é idempotente. Concluir tarefa diretamente pela notificação só poderia existir com as mesmas guardas; para este app, prefira abrir o fluxo completo.
- No foreground, usar aviso discreto quando há informação útil e não repetir interrupção para o conteúdo já visível. Textos curtos, relevantes e sem dados sensíveis. [Diretrizes Apple para notificações](https://developer.apple.com/design/human-interface-guidelines/notifications).
- Pedir permissão após explicar o benefício, em contexto apropriado, com ação explícita. Se negada, manter o app utilizável, indicar o estado e oferecer ajustes; não insistir em cada abertura.
- Validar a implementação dos eventos de clique da versão escolhida do Notifee/RNFirebase, incluindo diferenças iOS/Android. Não combinar APIs incompatíveis supondo que todas receberão o mesmo callback. [Eventos Notifee](https://notifee.app/react-native/docs/events/), [notificações RNFirebase](https://rnfirebase.io/messaging/notifications).

**Não prometa entrega push 100% em qualquer condição.** Internet, permissões, Foco, economia de bateria, dispositivo desligado, force-stop e políticas do sistema podem interferir. A exigência é não perder o evento no backend, rastrear tentativas honestamente, manter a central de avisos persistente e recuperar estado ao reconectar. Declare precisamente os limites encontrados em testes. [Comportamento dos estados RNFirebase](https://rnfirebase.io/messaging/usage).

## 7. Tempo real e comportamento com conexão instável

- Adapte `/api/events` para uma autenticação mobile segura. Não enviar tokens em query string e não confiar apenas em `activeOrgId` presente numa sessão antiga.
- Filtre **no servidor** por usuário, papel, organização e escopo vigente. O endpoint atual transmite o canal inteiro da organização e a UI filtra parte dos avisos depois; isso não é suficiente para impedir exposição entre colegas.
- `EventEmitter` em memória não conecta múltiplas instâncias nem oferece replay durável. Use mecanismo compartilhado compatível com a infraestrutura e eventos persistidos, sem obrigar uma troca de fornecedor desnecessária.
- Cursor/ID de evento, ressincronização de snapshot, deduplicação e tratamento de eventos fora de ordem. Se houver lacuna de eventos, buscar estado autoritativo.
- Reconectar com backoff/jitter; ao voltar ao foreground, retomar conexão e atualizar tarefas/avisos. Monitorar rede; prever fallback de atualização periódica quando o stream não puder ser mantido.
- Invalidar consultas afetadas em vez de remontar todas as telas a cada evento. Preservar scroll, foco, etapa aberta, formulário e rascunhos. Consolidar rajadas de eventos.
- Sem rede: permitir consulta ao cache autorizado e preparo local de rascunhos quando seguro; mostrar que os dados podem estar desatualizados. Não anunciar “entregue” sem confirmação do servidor.
- Não usar timestamp escolhido pelo cliente para obter entrega dentro de tolerância após reconectar. Uma fila local de intenção pode ser revalidada, mas não reserva prazo nem aprovação.
- Proteger cache e arquivos temporários, minimizar dados offline e remover no logout/revogação. Novas respostas não podem reaparecer na conta seguinte.

## 8. PIN, Face ID e segurança mobile

O “Face ID” atual é WebAuthn/passkey do navegador. Isso não garante que o método utilizado foi reconhecimento facial, nem que existe uma passkey vinculada exclusivamente ao aparelho atual. Diferencie:

1. **Login remoto por passkey:** desafio de uso único verificado pelo backend; prova criptográfica por credencial. Para RN, integração mantida com AuthenticationServices no iOS e Credential Manager no Android, ou solução equivalente comprovada. Configurar domínio real, RP ID, origens e associações necessárias. Reutilizar a família de credenciais quando suportado.
2. **Desbloqueio local com biometria:** acesso a segredo/sessão protegida em Keychain/Keystore após login inicial válido. Um booleano `authenticateAsync()=true` não autentica o usuário no backend e não deve ser a única proteção de um segredo exportável.

Utilize `expo-local-authentication` para interface de biometria quando aplicável e `expo-secure-store` com proteção adequada para credenciais. Exija vínculo criptográfico com recurso protegido, tratamento de novo cadastro biométrico, dispositivo incompatível, cancelamento, lockout e recuperação por PIN remoto. Nunca capturar o rosto com a câmera para simular Face ID e nunca enviar dados biométricos ao servidor. Nomeie Face ID, Touch ID ou biometria conforme a capacidade real do aparelho. [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [OWASP: bypass de autenticação local](https://mas.owasp.org/MASWE/MASVS-AUTH/MASWE-0020/).

- Para o transporte mobile, projetar sessões revogáveis, access token curto e renovação segura com rotação/detecção de reutilização, ou protocolo equivalente documentado. Refresh token protegido no armazenamento seguro; não persistir segredo em AsyncStorage nem logs.
- Rate limit persistente para PIN/senha/QR/passkeys/2FA; backoff e respostas sem enumeração desnecessária. Avaliar unicidade real de matrícula por organização: o schema atual tem índice, não uma restrição única dessa combinação.
- TOTP não pode ser ignorado por login biométrico, QR, renovação ou troca de organização quando a política exige prova adicional.
- Desafio de passkey deve ter expiração, vínculo correto com sessão/usuário e consumo atômico. Exigir user verification quando a promessa for biometria/autenticação forte.
- QR deve ter curta validade, uso único, associação ao navegador solicitante, confirmação da organização e consumo atômico. Não escolher silenciosamente o primeiro vínculo do usuário nem aprovar sem contexto.
- HTTPS; controle de acesso por objeto em todas as leituras/mutações/downloads; validação estrita de entrada; limites de tamanho e abuso; logs redigidos; encerramento de streams após revogação.
- Não depender de ofuscação, detecção de root/jailbreak ou App Check como substituto da autorização de servidor. Avaliar integridade/attestation como camada adicional se justificar o risco e a infraestrutura.

Use OWASP MASVS como referência de verificação, com evidências de controles implementados, sem afirmar “segurança 100%”. [MASVS autenticação](https://mas.owasp.org/MASVS/07-MASVS-AUTH/), [MASVS armazenamento](https://mas.owasp.org/MASVS/controls/MASVS-STORAGE-1/).

## 9. Regras indispensáveis de UX e UI

### 9.1 Clareza e facilidade de uso

Aplicar as dez heurísticas de Nielsen: visibilidade do estado, linguagem familiar, controle do usuário, consistência, prevenção de erros, reconhecimento em vez de memorização, eficiência, simplicidade, recuperação de erro e ajuda contextual. [Heurísticas de usabilidade](https://www.nngroup.com/articles/ten-usability-heuristics/).

Para o Marcaí, isso se traduz em:

- O funcionário entende imediatamente **o que fazer agora**, **quando precisa entregar**, **qual comprovação falta** e **por que algo está bloqueado**.
- Uma ação principal por contexto: Assumir, Concluir, Enviar para aprovação ou Corrigir. Não colocar cinco ações concorrentes no rodapé.
- Linguagem pt-BR simples: “Prazo”, “Em tolerância”, “Aguardando aprovação”, “Correção solicitada”. Evitar expor códigos de status, nomes de bibliotecas e jargão como SSE/FCM na experiência comum.
- Revele detalhe progressivamente: cartão informa o essencial; tela informa instruções e requisitos. Não esconder informação necessária para executar com segurança.
- Fluxo curto, uso com uma mão, ação principal confortável perto da parte inferior, protegida da barra de gestos e do teclado.
- Evitar escolhas desnecessárias; defaults refletem o contexto e a organização. Um toque no cartão abre a tarefa, e voltar devolve ao ponto anterior.
- Estado de carregamento aparece imediatamente; progresso de envio diferencia preparar mídia, enviar, validar e concluir. Nunca usar spinner indefinido sem possibilidade de recuperação.
- Erro explica causa e próximo passo, mantém respostas e focaliza campo pendente. Falha de rede não vira acusação de evidência inválida.
- Ação bloqueada deve ter motivo visível. Não reduzir opacidade do texto inteiro a ponto de torná-lo ilegível.
- Confirmar consequências de impedimento e descarte de rascunho. Não pedir confirmação redundante para toda navegação ou tarefa comum. Desfazer só quando a regra de negócio realmente permitir.
- O app deve funcionar para quem está em operação, com pressa, pouca familiaridade digital e conexão variável. Validar jornadas reais de primeira utilização e repetição diária.

### 9.2 Aparência nativa, minimalista e com identidade

Referências visuais existentes: `C:/Users/gabriel/development/marcai/docs/design-system.md`, `C:/Users/gabriel/development/marcai/src/app/globals.css`, `C:/Users/gabriel/development/marcai/src/app/workspace.css`, `C:/Users/gabriel/development/marcai/src/presentation/components/shared/brand.tsx`, `C:/Users/gabriel/development/marcai/public/brand-icon.svg` e `C:/Users/gabriel/development/marcai/public/brand-icon-sem-fundo.svg`.

- Verde principal **#164D36**, verde de ação **#247B56**, fundo **#F5F6F5**, superfície branca, texto **#1C2420**, secundário **#58665E**, bordas **#E7ECE8**. Rever contraste em cada combinação real.
- Verde é identidade e ação; âmbar sinaliza atenção/tolerância; vermelho sinaliza erro/impedimento/bloqueio. Não preencher a tela com cores de cada coluna.
- Tipografia do sistema no iOS, com tamanhos dinâmicos, hierarquia discreta, títulos claros e números tabulares. No Android, tipografia nativa compatível e mesma identidade. Geist é referência da web, não requisito de copiar sua escala desktop.
- Espaçamento consistente, margens de aproximadamente 16–20 unidades lógicas, superfícies limpas, separadores delicados, agrupamentos simples e poucos níveis de cartão. Raios moderados compatíveis com o sistema, sem exagero visual.
- Navegação e transições nativas; quatro abas com ícone e texto. No iOS, headers/large titles quando adequados, apresentação de sheets e gestos familiares. No Android, respeitar voltar do sistema, edge-to-edge e convenções locais.
- Símbolos adequados à plataforma. SF Symbols no iOS via suporte apropriado; ícones compatíveis no Android, sem empacotar recursos de uso exclusivo Apple ali.
- Sem gradientes decorativos, glassmorphism excessivo, dashboards de métricas inúteis, sombras pesadas, ícones em todos os textos ou animação promocional em tarefas.
- Sheets servem para decisões curtas; formulários extensos e execução de várias etapas podem usar uma tela completa com retorno claro. Evitar pilhas de modais que disputem foco/câmera/teclado.
- Haptics curtos e opcionais para sucesso/interação significativa. Movimento discreto, interrompível e respeitando reduzir movimento; jamais atrasar tarefa por uma animação.
- Não copiar HTML/CSS/shadcn como uma WebView. Recriar a linguagem visual com componentes React Native e padrões nativos.

### 9.3 Acessibilidade obrigatória

- Alvos confortáveis: pelo menos **44 × 44 pt no iOS** e **48 × 48 dp no Android**, com espaçamento e área de toque real. Não usar texto minúsculo para fazer tudo caber.
- Contraste de referência: 4,5:1 para texto comum, 3:1 para texto grande e elementos necessários à interação. Estado nunca depende só de cor. [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [acessibilidade Android](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility).
- VoiceOver/TalkBack, rótulos, papéis, estado desabilitado, ordem de leitura, anúncio pontual de sucesso/erro e foco após navegar. Não anunciar cronômetro a cada segundo.
- Dynamic Type/font scaling sem corte de botão, título, pergunta ou instrução. Testar os maiores tamanhos usados por pessoas reais.
- Navegação por gesto tem alternativa por toque; assinatura tem instruções e tratamento adequado se a pessoa não puder desenhar.
- Safe areas, recortes, teclado e orientação de leitura corretos. Testar iPhones pequenos e grandes e Android de entrada.

## 10. Stack recomendada e organização do app

Escolha versões estáveis e **compatíveis entre si** no início da implementação. Não instalar indiscriminadamente a versão mais nova de cada pacote. Fixar versões no lockfile, registrar a matriz de compatibilidade e seguir as APIs atuais.

| Necessidade | Recomendação |
| --- | --- |
| Base | React Native + TypeScript strict + Expo com development builds e config plugins. EAS Build/Submit como opção preferencial de distribuição; módulos nativos permitidos quando necessários. [Orientação React Native](https://reactnative.dev/docs/environment-setup). |
| Navegação | Expo Router com stacks nativos; alternativa justificada: React Navigation native-stack. Não criar dois sistemas de navegação concorrentes. Avaliar maturidade das abas nativas na versão escolhida, pois a documentação consultada ainda expõe `unstable-native-tabs`. [Native Stack](https://reactnavigation.org/docs/native-stack-navigator/), [Expo Native Tabs](https://docs.expo.dev/router/advanced/native-tabs/). |
| Dados remotos | TanStack Query: cache por usuário/organização, paginação, invalidação seletiva, cancelamento, estado de rede e retorno ao foreground. Não tratar cache como autorização. [React Native e TanStack Query](https://tanstack.com/query/latest/docs/framework/react/react-native). |
| Estado local | Hooks/context por feature; adicionar uma biblioteca de estado apenas quando a complexidade justificar. Não duplicar o banco em estado global. |
| Formulários | React Hook Form + Zod, Controller em inputs nativos, validação local para feedback e servidor para autoridade. [Suporte React Native](https://github.com/react-hook-form/documentation/blob/master/src/content/docs/usecontroller/controller.mdx). |
| Push | React Native Firebase app/messaging + Notifee conforme a estratégia de apresentação, mantendo FCM/Firebase Admin existentes. |
| Segredos/biometria | Expo SecureStore/Keychain/Keystore e Expo LocalAuthentication conforme o modelo de segurança; passkeys remotas com bridge nativa mantida e verificação do servidor. |
| Gestos/movimento | React Native Gesture Handler e Reanimated em versões compatíveis; preferir transições nativas. [Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/). |
| Sheets | Sheets nativas de navegação quando atendem; `@gorhom/bottom-sheet` se houver necessidade específica comprovada. [Bottom Sheet](https://gorhom.dev/react-native-bottom-sheet/). |
| Listas | FlatList bem configurada inicialmente; FlashList para volume/perfil que justifique. FlashList v2 requer New Architecture. [FlashList](https://github.com/Shopify/flash-list). |
| Mídia | Expo Camera, ImagePicker, DocumentPicker, Location, Image e módulos de arquivo/manipulação necessários; seleção pontual de permissões. [Camera](https://docs.expo.dev/versions/latest/sdk/camera/), [ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/), [DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/), [Location](https://docs.expo.dev/versions/latest/sdk/location/), [Image](https://docs.expo.dev/versions/latest/sdk/image/). |
| Qualidade | Testes de domínio/API, React Native Testing Library para fluxos relevantes e Maestro ou equivalente para jornadas reais. Observabilidade de erros via serviço apropriado, com dados sensíveis removidos. [Maestro](https://docs.maestro.dev/). |

Organize por features: `auth`, `organizations`, `tasks`, `process-executions`, `evidence`, `notifications`, `history`, `account`. Separe cliente de API, contratos, domínio portátil, adapters nativos e componentes do design system. Os nomes são estrutura proposta para o novo app; não representam pastas já existentes no projeto original.

API proposta, a criar ou adaptar — **não assumir que estes endpoints já existem**:

- autenticação PIN/senha, desafio/2FA/passkeys, renovação, logout e organizações;
- lista de tarefas, detalhe, assumir, início quando aplicável, retomar legado, evidências, anexos de formulário, concluir e impedimento;
- detalhe de execução, resumo autorizado, etapas e sincronização do estado global;
- avisos, não lidos, leitura individual/em lote e preferências permitidas;
- registro/rotação/remoção de instalação para notificações;
- downloads privados, timeline autorizada e stream/replay de eventos.

Use contratos tipados e versionados, erros estáveis com código/mensagem e respostas que incluam `serverNow`, versão do recurso, ações permitidas e motivos de bloqueio. Não devolver objetos Prisma completos. Operações críticas precisam de chave de idempotência e proteção concorrente; upload e conclusão devem suportar retomada sem duplicar envios.

## 11. Problemas encontrados que exigem verificação/correção

Esta lista vem da leitura do código local; é uma orientação de auditoria e não prova de que os serviços em produção já foram testados.

1. **Push fora de transação confiável:** vários locais despacham com `void` durante a transação. Outros registram avisos sem despacho. Unificar em outbox/worker após commit.
2. **Entrega registrada de forma imprecisa:** `sendNotification` cria entregas como `SENT` antes de enviar e muda para `DELIVERED` se algum token foi aceito; `dispatchNotificationAsync` não registra o mesmo detalhamento. Corrigir o modelo e a instrumentação.
3. **Eventos críticos sem cobertura uniforme:** `TASK_TOLERANCE_EXCEEDED` fora da allowlist; liberação de dependência e reabertura de execução podem persistir só aviso. Bloqueio por tolerância não tem um job dedicado demonstrado; não depende de o funcionário tentar concluir.
4. **SSE com exposição excessiva:** valida sessão/organização, mas transmite eventos de toda a organização, incluindo payloads destinados a outros usuários. Aplicar autorização no stream e sustentar revogação.
5. **Barramento só em memória:** sem replay e sem comunicação entre instâncias. Não tratar como tempo real confiável em implantação distribuída.
6. **Detalhe de processo com escopo incompleto:** `getEmployeeProcessExecutionAction` e `completeProcessExecutionAction` consultam por tenant, sem aplicar o mesmo escopo específico de funcionário usado nas tarefas. Projetar resumo autorizado e verificar permissão por objeto/etapa.
7. **Processo manual versus domínio:** finalização manual exige todas as tarefas; `resolveExecutionStatus` usa obrigatórias e aprovações. Unificar a regra sem fazer opcionais bloquearem inadvertidamente.
8. **Dependências divergentes:** detalhe de processo pode bloquear por qualquer predecessora incompleta, ignorando tipo informativo, OR e aprovação. Reatribuição/desbloqueio precisam reavaliar dependências antes de liberar execução.
9. **Etapas de processo sem paridade de evidências:** o drawer do processo recebe requisitos, mas não oferece o mesmo fluxo completo de comprovação do detalhe avulso. Reutilizar o componente nativo de execução de tarefa, sem omitir evidências.
10. **Upload de formulário no processo:** `handleCompleteCurrentTask` chama `uploadTaskFormFileAction` sem `taskId`, embora a ação o exija. Corrigir o contrato e testar o caminho.
11. **Detalhe por URL sem dados de questionário:** a página `/tasks/[id]` não passa `taskType`/`formFields` ao componente que os utiliza, enquanto `getTaskDetailAction` os fornece. Push/deep link deve abrir o mesmo fluxo completo de formulário.
12. **Leitura de respostas em histórico:** `TaskDetailResult` não inclui `formAnswers`, e componentes de detalhe avulso inicializam respostas vazias. Não entregar uma tela de “histórico” que apaga visualmente as respostas já recebidas.
13. **Upload de formulário menos protegido:** ação verifica tarefa e tamanho, mas não valida integralmente estado, tolerância, agendamento, tipo real e propriedade do anexo. Vincular o arquivo à tarefa/campo/usuário e validar tudo na API; impedir uso de `storageKey` arbitrário.
14. **Relógio divergente:** `scripts/verify-employee-task-clock.ts` falha no caso de crescimento do decorrido, com 630 versus 510 segundos. Há também caminhos que continuam calculando elapsed a partir de `now` para terminais; validar congelamento. Determinar regra atual correta e alinhar implementação e testes, sem apenas mudar expectativa para verde.
15. **Cálculos de dia/fuso espalhados:** mistura de fuso do host, aparelho e `America/Sao_Paulo` fixo; cartão de processo considera atraso de maneira diferente da tarefa individual. Centralizar classificação e estado de prazo/tolerância.
16. **Passkeys frágeis em pontos específicos:** RP ID/origem de produção fixos com TODO; user verification preferida e verificação com `requireUserVerification:false`; desafio de cadastro em campo do usuário sem expiração explícita. Fortalecer o protocolo e não afirmar Face ID por conta de uma passkey genérica.
17. **QR sem validade/consumo robustos:** `MobileAuthSession` não tem expiração explícita; polling e aprovação dependem só do token; login consome após operações e nem todas as guardas de ativo são reaplicadas nesse caminho. Implementar validade, contexto, rate limit e uso único atômico.
18. **Proteção de login insuficiente demonstrada:** PIN/senha não apresentam rate limit no caminho inspecionado. Há proteção em parte do TOTP, mas isso não cobre todas as entradas. Aplicar defesa persistente a todos os fluxos.
19. **Segredo TOTP exibido em verificação:** `/verify-access` abre o segredo existente para construir QR. Na verificação de uma conta já configurada, não devolver novamente o segredo; QR pertence ao cadastro protegido do segundo fator.
20. **Registro/logout de push incompletos:** associação atual é por usuário/token, sem plataforma/ambiente/instalação; logout web não chama remoção de token. Rever vínculo para evitar avisos para a pessoa anterior em aparelho compartilhado.
21. **Permissão não equivale a registro:** hook web inicia `isSubscribed` quando permissão está concedida; confirmação de cadastro precisa ser independente.
22. **Duplicação/agrupamento de avisos:** web usa apresentação customizada no Service Worker junto de payload com `notification`; investigar duplicação. Sem `notificationId`, tag genérica pode substituir avisos distintos. Não transportar esse desenho para o app.
23. **Tipos e campos nem sempre aplicados:** documentação fala em áudio/GPS e políticas completas de pausa; schema atual usa FILE/LOCATION e pausa desabilitada. Alguns campos/modelos de escalonamento/SLA existem sem uso completo nos fluxos. Não confundir existência de campo com capacidade pronta.

Registre as correções em relatório de rastreabilidade, com arquivo, regra, risco real e teste. Mantenha compatibilidade dos eventos já consumidos pela web durante a migração.

## 12. Desempenho e fluidez

- Medir em **build de produção** em iPhone físico e Android de entrada/intermediário; modo de desenvolvimento não representa desempenho final. [Desempenho React Native](https://reactnative.dev/docs/performance).
- Buscar rolagem e transições consistentes a 60 fps nos aparelhos suportados; adaptar a altas taxas de atualização quando disponível. Registrar p95 de abertura, navegação, carregamento e envio sob condições definidas, sem prometer números sem medir.
- Virtualizar listas; chaves estáveis; paginação; imagens redimensionadas/cache; downloads sob demanda. Evitar renderizar todas as colunas/cartões/evidências simultaneamente sem necessidade.
- Um relógio compartilhado, apenas enquanto relevante/visível; timestamps autoritativos em vez de incrementar contador acumulativamente. Não reconstruir todo o quadro a cada segundo para atualizar texto de dois cartões.
- Evitar imagens base64 no estado global, operações pesadas no thread JS, logs excessivos e subscriptions duplicadas. Fechar câmera, liberar previews e abortar requisições ao sair quando seguro.
- Prefetch seletivo de detalhes; agrupar invalidações; não fazer polling agressivo nem manter stream ativo indefinidamente em background.
- Formulários longos não devem perder foco ou engasgar durante digitação. Upload deve reportar progresso e preservar evidências já aceitas em falha parcial.
- Recursos pesados carregados sob demanda; bundle e dependências mínimos; startup sem Analytics ou rede bloqueando a primeira tela útil. Crash/error reporting sem PIN, evidências ou dados pessoais em logs.
- Profiling antes de otimização; documentar gargalos observados e melhoria medida.

## 13. Preparação para Google Play e App Store

Entregar configuração e documentação completas de distribuição; distinguir **preparado tecnicamente**, **validado em aparelhos**, **submetido** e **aprovado**. Aprovação e entrega push não são garantias que o código possa prometer.

- Identificadores permanentes de pacote/bundle, versão/build number, nome Marcaí, ícones/adaptive icons e splash corretos.
- Ambientes de desenvolvimento, homologação e produção; backend HTTPS real; configuração Firebase nativa por ambiente; APNs, signing e credenciais gerenciados com segurança.
- Builds Android AAB e iOS assinados quando houver credenciais; pipelines reproduzíveis, lockfile, verificações e perfis de build. Não deixar domínio localhost ou credencial de teste no release.
- EAS Build/Submit é opção para preparar e enviar; envio não substitui configuração da loja nem revisão. iOS exige ambiente macOS/Xcode ou serviço de build equivalente; Windows não comprova build local iOS. [Submissão com Expo](https://docs.expo.dev/deploy/submit-to-app-stores/).
- Conferir **na data de submissão** requisitos vigentes de target SDK Android e SDK/Xcode Apple, suporte dos módulos nativos e exigências aplicáveis como compatibilidade de bibliotecas Android com páginas de memória de 16 KB. Não congelar esses requisitos em números antigos. [Google Play target API](https://support.google.com/googleplay/android-developer/answer/11926878), [requisitos Apple](https://developer.apple.com/news/upcoming-requirements/).
- Declarações de permissão úteis em pt-BR para câmera, fotos, localização pontual e biometria; acesso mínimo e solicitado no momento certo. Preferir seletores do sistema a permissões amplas de galeria/arquivos.
- Privacy manifests/required reason APIs e requisitos de SDKs terceiros no iOS; verificar a coleta real de cada dependência. [SDKs terceiros Apple](https://developer.apple.com/support/third-party-SDK-requirements/).
- Política de privacidade e suporte públicos, App Privacy/Data Safety coerentes com autenticação, evidências, localização, push, diagnóstico e retenção efetivos. Minimização de dados e procedimento aplicável de exclusão/solicitação; avaliar exigência de remoção de conta conforme o fluxo real, sem criar autoexclusão que destrua registros corporativos inadvertidamente.
- Metadados, classificação etária, screenshots reais, descrição objetiva, notas de revisão e conta de demonstração funcional sem depender de passkey pessoal da equipe. Backend disponível durante revisão. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
- Universal Links no iOS e App Links verificados no Android, com domínio de produção e arquivos de associação corretos; validar navegação de push e links em app fechado. [Links para o app](https://docs.expo.dev/linking/into-your-app/), [Universal Links](https://docs.expo.dev/linking/ios-universal-links/).
- TestFlight e teste interno Google Play; testar upgrades, reinstalação, rotação de token, mudança de biometria, revogação e compatibilidade com a menor versão suportada.
- Atualizações OTA, se utilizadas, com compatibilidade de runtime, controle de rollout/rollback e respeito às regras de distribuição. Mudança de dependência/permissão nativa exige novo binário.
- Relatório final de release com itens concluídos e dependências externas reais: contas de desenvolvedor, domínio, signing/APNs, URLs oficiais, credenciais e revisão. Não inventar credenciais nem afirmar publicação sem comprovante.

## 14. Critérios de aceite e testes obrigatórios

No projeto original, a inspeção de 13/10/2026 executou com sucesso `npm run typecheck -- --incremental false`, `npm run test:domain` e `npm run test:operational` — este último passou 55 verificações em cada um dos fusos UTC, America/Sao_Paulo e Asia/Tokyo. O teste separado de relógio falhou, como descrito acima. Isso não comprova saúde de push em produção, configuração APNs, agendador externo ou testes nativos.

Estude também os testes em:

- `C:/Users/gabriel/development/marcai/scripts/verify-domain-rules.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-operational-rules.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-employee-task-clock.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-workflow-regressions.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-pending-policy-e2e.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-retention-purge.ts`
- `C:/Users/gabriel/development/marcai/scripts/verify-template-library.ts`

Os últimos scripts podem acessar/mutar dados. Use banco de teste isolado e verifique o conteúdo antes de rodar; não executar expurgo, seed ou regressões destrutivas sobre a produção.

Aceite mínimo:

1. PIN válido/inválido, matrícula ambígua, organização suspensa, conta inativa, rate limit, sessão expirada, renovação concorrente, revogação, TOTP e recuperação.
2. Biometria após login inicial, cancelamento, lockout, inexistência de hardware, mudança de cadastro biométrico, novo aparelho e passkey com desafio expirado/reutilizado.
3. Troca entre organizações com papéis diferentes; nenhum dado, evento, badge, evidência ou rascunho da conta/contexto anterior vaza.
4. Tarefa atribuída, para assumir, disputa entre dois aparelhos, colaborador/executor conjunto, reatribuição e perda de acesso imediato.
5. Conclusão simples, evidência obrigatória pendente, requisito opcional, múltiplas quantidades, terceira falha, nova rodada e ocorrência sem duplicação.
6. Todos os sete tipos de evidência e oito tipos de pergunta; zero/false; anexos inválidos; iPhone HEIC/MOV convertido; payload grande; timeout; falha parcial; chave de arquivo de outra tarefa recusada.
7. Antes do agendamento, no instante da liberação, no deadline, durante tolerância, no limite exato e depois; tolerância zero; prazos nulos; suspensão/relógio adulterado/retorno ao foreground e upload que termina depois do limite.
8. Dependências AND/OR/informativas/por aprovação, ordem livre/restrita/customizada, opcionais e progresso pessoal versus global; dois processos com nomes iguais e execuções distintas não são fundidos.
9. Envio para aprovação, aprovação sequencial/paralela, rejeição, reabertura e correção; UI nunca anuncia conclusão antes do estado correto.
10. Impedimento e cancelamento gerencial refletem no quadro/histórico sem virar sucesso; retenção remove também o acesso a cache/evidências expirados.
11. Tempo real em dois aparelhos, evento duplicado/fora de ordem, queda e replay, múltiplas instâncias, reinício do servidor e acesso revogado durante o stream.
12. Push real iOS/Android em foreground/background/app encerrado, inicialização pelo toque, permissão negada/revogada, token rotativo/inválido, conta compartilhada, vários aparelhos, rede indisponível, economia de bateria/Foco/force-stop dentro dos limites do sistema.
13. Push + SSE do mesmo evento não duplicam apresentação nem contador. Alteração de prazo gera alerta do ciclo correto; retries não geram avisos duplicados. Rollback de negócio não dispara aviso. Falha parcial de multicast tem rastreabilidade por instalação.
14. Cada tipo importante da matriz push tem teste de origem até destino, e autorização negativa entre empresas/colegas. Outbox sobrevive a interrupção do processo após commit.
15. VoiceOver/TalkBack, textos grandes, menor tela suportada, teclado, safe area, botão voltar Android, gesto voltar iOS e preservação de rascunhos.
16. Build release, startup, listas longas, memória, uploads e rolagem medidos em aparelhos físicos, com relatório de resultados.

## 15. Forma de executar e entregar

Faça a implementação em etapas verticais verificáveis:

1. Inventário/rastreabilidade e decisões técnicas; contratos e autorização mobile.
2. Fundação React Native, identidade, login/PIN/biometria/2FA e organização.
3. Primeira jornada completa: push real de tarefa atribuída → toque → login se necessário → detalhe → evidência → entrega auditada → sincronização em outro aparelho.
4. Kanban, processos/etapas, questionários, dependências, tolerância, correções e impedimentos.
5. Avisos, histórico/timeline autorizada, conta, conexão instável e todos os eventos push.
6. Hardening de segurança, desempenho, acessibilidade, testes físicos e preparação de lojas.

Ao final, entregue código funcional, contratos/API, matriz de rastreabilidade preenchida, documentação de instalação/build/release, configuração segura de ambientes, testes executados, métricas e limitações comprovadas. Informe o que foi preservado, o que melhorou e quais diferenças do original foram corrigidas.

Critério principal: um funcionário consegue entrar, identificar o próximo trabalho, receber o aviso certo, abrir a tarefa certa, fornecer a comprovação correta e entregar sem dúvida, sem perder dados e sem ultrapassar as regras operacionais. A aplicação deve combinar essa simplicidade com segurança e confiabilidade reais no backend.
