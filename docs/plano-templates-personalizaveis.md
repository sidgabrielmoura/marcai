# Templates personalizáveis — plano de implementação

Data: 11/10/2026. Escopo desta entrega: estudo do código atual e planejamento; nenhuma implementação operacional ou alteração de banco.

## 1. Resultado pretendido

Ao acessar Processos, a gestão poderá escolher “Usar template” ou “Criar do zero”. A biblioteca terá pelo menos 15 templates: três para cada uma de cinco áreas propostas a partir dos exemplos de varejo, serviços e checklists do projeto. O catálogo detalhado está em [catalogo-templates-iniciais.md](catalogo-templates-iniciais.md).

Todos os conteúdos serão editáveis: nome, descrição, tarefas, instruções, perguntas, opções, obrigatoriedade, evidências, ordem, dependências, prioridades, criticidade, tolerância, prazos, rotina e aprovações. Também será possível adicionar, duplicar e remover tarefas e perguntas. Alterar o processo criado não altera o template; alterar o template não altera os processos ou execuções já existentes.

OWNER e ADMIN poderão transformar a definição de seus processos em templates da organização. Um template é um modelo de procedimento; salvar, publicar, visualizar ou personalizar um template não cria execução, tarefa, notificação ou rotina ativa.

“Iniciar com template” significa escolher um modelo, adaptar e revisar a configuração e confirmar a criação. O fluxo final explicará quando o processo inicia imediatamente e quando aguarda sua programação.

## 2. Evidências encontradas no projeto

| Área examinada | Estado atual | Implicação para a implementação |
| --- | --- | --- |
| Stack | Next 16.3.6, React 19.2.8, Prisma 7.10, PostgreSQL, Zod 4, Tailwind 4, Base UI e Framer Motion | Trabalhar com as dependências existentes. |
| Camadas | app, domain, application, infrastructure e presentation | Domínio valida; aplicação converte e orquestra; Server Actions autorizam; páginas consultam no servidor. |
| Modelagem | ProcessTemplate e ProcessTemplateVersion já existem e são privados por organização | Hoje também armazenam a definição interna versionada do próprio processo. Não listar esses registros diretamente como biblioteca. |
| Salvamento | createProcessAction cria uma versão em cada edição e aponta sourceTemplateVersionId para ela | Manter esse mecanismo durante a expansão e garantir que cada novo processo tenha sua própria linha de versões. |
| Histórico | ProcessExecution.definitionSnapshot guarda a definição usada na geração | Preservar snapshots e tarefas já geradas, inclusive execuções futuras que já foram materializadas. |
| Editor | ProcessEditorWizard, com Dados, Tarefas, Dependências, Rotina, Aprovações e Revisão | Reaproveitar controles e seções; introduzir contratos distintos para processo e template. |
| Tarefas | STANDARD e FORM; oito tipos de pergunta; evidências, dependências AND/OR e aprovação sequencial/paralela | O catálogo pode conter procedimentos úteis, formulários e conferências reais. |
| Segurança | Papéis OWNER, ADMIN, MANAGER, EMPLOYEE e SUPERADMIN; contexto de organização e escopo de unidade/equipe | Catálogo e biblioteca não substituem a validação operacional no servidor. |
| UI | Geist local, verde profundo, branco/cinza suave, cards, drawers e dialogs compartilhados | Estética iPhone localizada no modal; preservar identidade, navegação e tipografia do MarcAI. |
| Navegação | Processos na sidebar e no mobile; criação também pelo botão central; busca global | Integrar todos os pontos de entrada, sem acrescentar uma sexta aba móvel. |
| Operação | Geração recorrente, relógio, dependências, evidências, aprovações, notificações e retenção | Testar a passagem completa de template até tarefa e histórico do colaborador. |
| Documentação | auditoria-produto.md declara templates como presentes | A declaração excede a UX e as garantias atuais. Atualizar a auditoria somente após a entrega comprovada. |
| Migrações | Não há diretório de migrations no checkout examinado | Confirmar a estratégia de baseline do banco antes de produzir e aplicar migração aditiva. |

Principais arquivos de referência:

- [schema.prisma](../prisma/schema.prisma): modelos e relações.
- [process-definition.ts](../src/domain/rules/process-definition.ts): contrato e validação.
- [process-actions.ts](../src/presentation/actions/process-actions.ts): criação, instanciação e adoção de versão.
- [generate-execution.ts](../src/application/processes/generate-execution.ts): geração recorrente.
- [editor-options.ts](../src/application/processes/editor-options.ts), [auth-context.ts](../src/application/security/auth-context.ts) e [operational-scope.ts](../src/application/security/operational-scope.ts): opções e autorização.
- [process-editor-wizard.tsx](../src/presentation/components/processes/process-editor-wizard.tsx), [process-list-client.tsx](../src/presentation/components/processes/process-list-client.tsx) e [process-detail-client.tsx](../src/presentation/components/processes/process-detail-client.tsx): experiência atual.
- [design-system.md](design-system.md), [globals.css](../src/app/globals.css) e [workspace.css](../src/app/workspace.css): identidade visual.

## 3. Correções necessárias para uma base sólida

Esses pontos foram identificados por leitura do código. Não foram reproduzidos contra dados reais nem corrigidos nesta entrega.

1. **Instanciação atual incompleta.** instantiateProcessFromTemplateAction não aplica a validação completa de equipe, responsável e aprovadores do salvamento normal. O filtro de MANAGER sobrescreve os IDs de unidades solicitados pelos IDs do seu escopo, podendo selecionar unidades adicionais. A nova operação deve aceitar apenas as unidades solicitadas e autorizadas e rejeitar integralmente seleções inválidas.
2. **Versão compartilhada e unidade divergente.** A instanciação aponta vários processos para a mesma versão, sem persistir a definição adaptada a cada unidade. O gerador consulta definition.locationId para validar o responsável. Criar uma definição interna independente e consistente com Process.locationId em cada processo.
3. **Adoção de versão sem garantias suficientes.** updateProcessToTemplateVersionAction filtra a organização, mas não aplica o escopo completo do MANAGER, a associação à mesma família de template, o remapeamento das pessoas/equipes ou a sincronização de dados e rotina. Não expor esse caminho diretamente na biblioteca. Se mantido, substituir sua implementação pelo mesmo caso de uso validado de adaptação.
4. **Materialização diferente entre manual e recorrente.** createInitialProcessExecution não copia taskType/formFields; os dois caminhos substituem prioridade/criticidade da tarefa pela do processo e não preservam consistentemente objetivo e tolerância. Extrair uma materialização compartilhada e testar a equivalência dos campos declarados editáveis.
5. **Modo de dependências no editor.** dependencyMode inicia sempre FREE, mesmo quando initial contém um fluxo sequencial ou customizado. Derivar o modo da definição e recalcular corretamente após remoção, duplicação ou reordenação.
6. **Agenda pode sobreviver à remoção.** Salvar schedule=null em processo já recorrente não desativa as rotinas existentes. A remoção deve suspender futuras gerações, preservando execuções anteriores. Definir uma rotina principal gerenciada pelo editor e tratar explicitamente eventuais rotinas adicionais.
7. **Datas concretas não são portáveis.** Não transportar deadlineAt, validade, startsAt, endsAt ou exceções de dias passados para um novo processo sem revisão. Templates devem conter sugestões relativas e obter as datas reais no uso.
8. **Notificações durante a transação.** Os geradores chamam dispatchNotificationAsync antes do commit. Coletar destinatários na transação e despachar depois de confirmação; não enviar alertas por prévia, cancelamento ou rollback.
9. **Identidade das tarefas no histórico.** O drawer de processo usa o título para recuperar a ordem do snapshot. Templates editáveis podem repetir ou alterar títulos. Acrescentar definitionTaskId e definitionOrder à tarefa gerada, preservando fallback para tarefas legadas.
10. **Contratos de formulário.** Reforçar IDs únicos, limites de perguntas/opções e validação por tipo, incluindo boolean false e arquivos autorizados. Remapear IDs de perguntas na cópia sem levar respostas ou anexos.

O campo slaMinutes ainda existe no contrato, mas os geradores atuais não materializam SLA por duração; a política de pendência é ignorada intencionalmente no código atual. A entrega de templates não deve reativar essas regras por acidente. Usar a geração sempre contínua como comportamento atual e alinhar textos/testes. Qualquer mudança dessa regra exige uma decisão própria.

## 4. Modelo recomendado: biblioteca separada da definição interna

Adicionar ReusableProcessTemplate e ReusableProcessTemplateVersion. Manter ProcessTemplate/ProcessTemplateVersion existentes para a definição interna de processos, evitando uma migração ampla do motor operacional.

| Alternativa | Avaliação |
| --- | --- |
| Expor ProcessTemplate atual como biblioteca | Rejeitada: cada edição de processo viraria conteúdo da biblioteca e continuaria presa a unidades/pessoas. |
| Adicionar purpose ao modelo atual e dois formatos de definition | Possível, mas exige filtros em todos os leitores e aumenta o risco de o motor receber uma definição abstrata. |
| Biblioteca própria, adaptada para ProcessDefinition ao usar | Recomendada: separação explícita e implantação aditiva, com reaproveitamento da geração e dos snapshots existentes. |

### ReusableProcessTemplate

Campos propostos: id, organizationId obrigatório, name, description, jobKey, tags, status (DRAFT, PUBLISHED, ARCHIVED), draftDefinition, draftRevision, publishedVersionId opcional, createdBy, updatedBy, createdAt, updatedAt e archivedAt. A referência de versão publicada deve pertencer ao mesmo template, verificada no caso de uso. Índices por organizationId/status/jobKey e organizationId/updatedAt.

A definição de rascunho pode estar incompleta; uma versão publicada sempre precisa passar a validação completa. draftRevision protege contra sobrescrita concorrente. Ao editar template publicado, continuar servindo sua última versão publicada até nova publicação. Arquivar remove o modelo das novas seleções e preserva versões e processos. Restaurar conserva a última publicação.

Guardar a origem do modelo como metadados restritos ao admin: chave/versão do catálogo ou processo/versão de origem. A remoção do processo de origem não deve remover o template.

### ReusableProcessTemplateVersion

Campos: id, templateId, version, schemaVersion, definition JSON, createdBy e createdAt. Restrição única em templateId/version. Versões publicadas são imutáveis; edição cria nova publicação.

### Process e Task

Adicionar ao Process originReusableTemplateVersionId opcional e templateOriginSnapshot JSON com tipo, chave, nome e versão de origem, resolvidos pelo servidor. O snapshot permite identificar a origem mesmo após arquivamento. Para catálogo, a referência usa sua chave e versão estáveis, sem vínculo com organização fictícia.

sourceTemplateVersionId continua apontando exclusivamente para uma definição operacional concreta e independente do processo. Para Task, acrescentar definitionTaskId e definitionOrder opcionais para rastreabilidade e ordem. Não usar o nome da tarefa como chave.

Adicionar Process.creationRequestId opcional, com unicidade em organizationId/creationRequestId. Processos legados mantêm o campo nulo. No reenvio, confirmar também o ator antes de retornar o resultado existente; usar uma nova chave para uma nova intenção de criação.

### Catálogo pronto

Guardar os 15 modelos iniciais em catálogo versionado no código, carregado no servidor, sem IDs de organização/unidade/equipe/pessoa. Isso disponibiliza modelos a organizações existentes e novas sem rodar o seed destrutivo atual.

O modelo pronto oferece “Usar no processo” e “Personalizar template”. Personalizar cria uma cópia privada da organização com todos os campos editáveis. A cópia passa a aparecer em “Da minha operação”; manter o original de referência impede que uma empresa altere o catálogo de outra. MANAGER pode editar integralmente o processo que está criando, mas administrar o template da biblioteca cabe a OWNER/ADMIN.

Não converter todos os registros internos existentes em templates publicados. Somente a ação explícita “Salvar como template” cria um item da biblioteca.

## 5. Contrato portátil e conversão

Criar ReusableTemplateDefinition separado de ProcessDefinition, com validação estrita e schemaVersion.

- Conteúdo: nome, descrição, criticidade e lista ordenada de tarefas com chaves estáveis locais.
- Tarefa: tipo, título, objetivo, instruções, formulário, prioridade, criticidade, obrigatoriedade, evidência, tolerância e dependências locais.
- Papéis: teamSlots, assigneeSlots opcionais e approverSlots com rótulos operacionais, como “Operação”, “Conferente” e “Gestor”. Nenhum slot contém ID de pessoa ou unidade.
- Aprovação: tarefa aponta para um ou mais slots e conserva o modo sequencial/paralelo.
- Agenda sugerida: frequência, intervalo, dias, horários opcionais e antecedência; datas reais, fuso, validade e exceções são escolhidos no uso.
- Prazo: NONE ou OFFSET_FROM_SCHEDULED com minutos. Não copiar datas absolutas do processo original.

O adaptador resolve slots em dados reais da organização e produz ProcessDefinition. Extrair os campos comuns das duas validações sem enfraquecer a exigência de locationId/teamId na definição operacional.

No primeiro uso, escolher unidade, mapear cada papel para equipe ativa, indicar responsáveis opcionais e aprovadores necessários. Propor opções apenas quando inequívocas; não atribuir pessoas pelo primeiro registro nem decidir equivalência apenas pelo nome.

Após o mapeamento:

1. Criar novos IDs locais para tarefas e perguntas, mantendo um mapa de dependências.
2. Validar todas as referências, ciclos, tipos, limites e aprovações.
3. Verificar organização ativa, papel, unidade/equipe, acesso temporal do responsável e escopo do aprovador no servidor.
4. Obter datas em função da unidade e revisar sugestão de rotina.
5. Persistir a definição concreta no processo, com origem/versionamento separados.

Limites iniciais: até 100 tarefas por template, 50 perguntas por tarefa FORM, 20 opções por pergunta e 10 aprovadores por tarefa, alinhando os limites operacionais existentes onde aplicável. Validar também tamanho total do documento; não depender apenas do limite de 12 MB de Server Actions.

Os templates e processos utilizam prazo em data fixa ou sem prazo fixo. Por padrão, o catálogo não impõe prazo nem reintroduz SLA por duração.

## 6. Fluxos e navegação

### A. Processos → usar template

1. Página mantém a lista atual e oferece “Usar template”, “Criar do zero” e link “Templates”.
2. “Usar template” abre a seleção com busca, área e origem.
3. Selecionar apresenta objetivo, tarefas, evidências, aprovações e sugestão de frequência.
4. “Usar este template” abre o editor existente com conteúdo preenchido e mapeamento pendente.
5. Usuário edita livremente e revisa unidade, equipes, pessoas, prazos e rotina.
6. No fim: “Criar e iniciar” para manual; “Criar processo agendado” para recorrente, com próxima ocorrência explicitada.

Escolher ou visualizar não escreve dados operacionais. Ao desistir, nenhuma execução é criada. Sem unidade/equipe, mostrar o que falta e um caminho de cadastro, preservando o conteúdo do editor.

### B. Templates

Rota principal proposta: /management/templates. Duas origens: “Prontos” e “Da minha operação”. Busca textual e filtro das cinco áreas, com opção “Personalizado” para modelos de outros usos. Cards apresentam nome, objetivo curto, área, número de etapas, tipo manual/recorrente sugerido e origem. Não apresentar duração garantida.

Admin pode criar do zero, personalizar modelo pronto, editar, duplicar, publicar, arquivar e restaurar. Rascunhos são visíveis só a OWNER/ADMIN. A última versão publicada é a selecionável pelo MANAGER; rascunhos e arquivados não entram no seletor de criação. Busca global obedece à mesma visibilidade.

Rotas de edição: /management/templates/new e /management/templates/[id]/edit. O editor de template usa as mesmas seções e controles, substituindo unidade/pessoas por papéis operacionais. Reaproveitar componentes de tarefa, formulário, dependências e agenda; evitar copiar integralmente o wizard de 1.566 linhas ou criar um segundo editor divergente.

### C. Processo → salvar como template

OWNER/ADMIN acessa a ação no detalhe e no menu da lista. O servidor lê a definição interna atual e apresenta nome, área e descrição. Converte equipes/pessoas em papéis, remove datas concretas e mantém o conteúdo declarativo. Se houver várias rotinas ativas, pedir seleção explícita de uma sugestão de agenda.

Salvar cria rascunho e abre sua edição/revisão. Publicar torna o procedimento disponível à gestão da organização. Não transportar execuções, resultados, respostas de formulário, evidências enviadas, arquivos, logs, notificações ou histórico de conclusão.

Se não existir definição válida, explicar que o processo precisa ter suas etapas configuradas. Não reconstruir silenciosamente um modelo a partir de tarefas executadas ou editar o processo de origem.

### D. Edição independente

Editar processo atualiza só sua definição interna. Editar template cria rascunho; publicar cria nova versão. Novos usos selecionam a versão publicada mais recente. Processos anteriores permanecem vinculados à versão usada como origem.

Atualizar um processo para uma publicação mais nova fica fora da primeira entrega. Se introduzido depois, exigir comparação, remapeamento e aplicação explícita apenas a futuras gerações; execuções já materializadas preservam seu snapshot.

### Integração no shell

Adicionar “Templates” ao grupo Operação da sidebar e às páginas da busca. No celular, manter as cinco posições da navegação; acesso por Processos e “Mais”. Ajustar o estado ativo para /management/templates. O botão central “+” deve encaminhar a criação de processo para a mesma escolha entre template e criação vazia.

Não abrir o modal automaticamente sempre que entrar em Processos; apresentar a opção com destaque e usar o estado vazio para incentivar o primeiro uso.

## 7. Modal com linguagem visual do iPhone

Usar uma apresentação do tipo sheet: conteúdo focado, uma única superfície de interação e navegação interna entre seleção e prévia. A referência de comportamento é [Apple HIG — Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets); os detalhes de cor e dimensão abaixo são decisões específicas para o MarcAI.

- Mobile: painel inferior com cantos superiores de 28 px, puxador discreto, cabeçalho e ação principal persistentes. Altura inicial adequada ao catálogo; permitir expansão, rolagem e teclado sem encobrir a ação.
- Desktop: dialog central com raio de 28 px, largura máxima aproximada de 760 px e altura limitada à viewport; catálogo e prévia podem ocupar a mesma superfície em passos sucessivos.
- Fundo: escurecimento discreto e blur; superfícies internas opacas. Evitar depender de vidro/transparência para legibilidade.
- Estrutura: título claro, busca discreta, filtros agrupados, linhas/cards com espaço de toque e rodapé com um único CTA principal. Voltar dentro da própria janela, sem sobrepor modais.
- Identidade: manter Geist, --brand-900, --brand-700, --surface, --canvas, --text-primary e --border-subtle. Não mudar o app para uma paleta iOS azul nem exigir SF Pro.
- Movimento: entrada suave de 220–300 ms, baseada em transform/opacity, reduzida quando prefers-reduced-motion estiver ativo.
- Acessibilidade: nome e descrição do diálogo, foco contido, retorno do foco ao gatilho, Escape, botões de pelo menos 44 px, inputs móveis de 16 px, safe area, zoom e leitor de tela.
- Dispensa: seleção/prévia pode fechar por gesto/backdrop; ao salvar/editar conteúdo, proteger alterações pendentes. Uma confirmação de descarte substitui o conteúdo do sheet ou usa a primitiva adequada sem empilhar o fluxo.

Criar TemplatePickerDialog/TemplatePreview e um wrapper responsivo dedicado usando Dialog no desktop e Drawer no mobile. Não mudar todos os modais da aplicação. Drawer e Dialog já existem e oferecem as bases de foco, portal e gestos. Manter um único estado de conteúdo ao trocar o breakpoint e respeitar as diferenças entre as duas primitivas.

O SegmentedControl atual é implementado como Select, apesar do nome; usar o Select existente para filtros ou construir um controle de abas acessível específico para as duas origens, sem mudar seu comportamento global.

Estados obrigatórios: carregando, sem resultados, biblioteca privada vazia, template arquivado/removido durante o uso, versão desatualizada, falta de configuração, falha de salvamento e conflito de edição. Em falhas, conservar o que foi preenchido.

## 8. Permissões e consistência

| Ação | OWNER / ADMIN | MANAGER | EMPLOYEE | SUPERADMIN |
| --- | --- | --- | --- | --- |
| Ver catálogo pronto | Sim | Sim | Não | Sem acesso operacional automático |
| Ver templates publicados da organização | Sim | Sim | Não | Sem acesso operacional automático |
| Usar template e editar o processo criado | Sim | Dentro da unidade AND equipes autorizadas | Não | Sem acesso operacional automático |
| Criar, editar, publicar, arquivar/restaurar template | Sim | Não | Não | Não nesta entrega |
| Salvar processo como template | Sim, da própria organização | Não | Não | Não nesta entrega |
| Ver rascunhos e metadados do processo de origem | Sim | Não | Não | Não nesta entrega |

Publicar na biblioteca significa disponibilizar o procedimento à gestão da organização. Não enviar IDs/nomes de pessoas, unidade de origem ou histórico ao MANAGER no catálogo. O acesso ao conteúdo do modelo não concede acesso ao processo de origem.

Todas as consultas privadas precisam de organizationId derivado da sessão; todos os IDs de versão recebidos devem ser resolvidos com sua organização. Receber papel/organizationId da interface não autoriza nada. Revalidar elegibilidade na criação e na geração, pois pessoas e acessos podem mudar.

Transação de criação: definição interna, processo, rotina opcional, execução manual opcional e auditoria. Serializar publicação por template, comparar draftRevision e expectedPublishedVersionId e impedir publicação/arquivamento concorrente com o uso. Cada novo processo recebe um requestId único no seu contexto para tornar repetição do envio idempotente; reenvio após perda de resposta retorna o processo já criado.

Validar alterações de vínculo dentro da transação com proteção de concorrência compatível com os casos de uso de acesso. Geradores devem determinar status e sessões a partir da atribuição efetivamente validada, sem marcar IN_PROGRESS só porque havia um ID no modelo.

Auditoria: TEMPLATE_CREATED, TEMPLATE_SAVED_FROM_PROCESS, TEMPLATE_DRAFT_UPDATED, TEMPLATE_PUBLISHED, TEMPLATE_DUPLICATED, TEMPLATE_ARCHIVED, TEMPLATE_RESTORED e PROCESS_CREATED_FROM_TEMPLATE. Registrar ator, origem e versão; evitar o documento completo no log.

Usar revalidatePath nas rotas de biblioteca, processo/detalhe/editor e demais telas afetadas após commit. O projeto não habilita Cache Components; seguir o guia local correspondente. Não introduzir cache global para templates privados. Caso se acrescente cache depois, incluir organização e visibilidade na chave.

## 9. Mapa de implementação

| Local | Trabalho previsto |
| --- | --- |
| prisma/schema.prisma e migração nova | Biblioteca, versões, origem opcional, identidade das tarefas e idempotência de criação. |
| src/domain/rules/reusable-template-definition.ts | Schema portátil, rascunho/publicação, papéis e agenda sugerida. |
| src/domain/rules/process-definition.ts | Compartilhar schemas de conteúdo e prazo relativo compatível com legado. |
| src/domain/rules/template-mapping.ts | Conversão pura, novos IDs, dependências e tratamento de datas. |
| src/application/templates/ | Consulta, save-from-process, rascunho, publicação, duplicação, arquivo/restauração e preparação para uso. |
| src/application/processes/ | Caso de uso compartilhado para salvar processo e materializar tarefas; revisões de rotina. |
| src/infrastructure/templates/catalog.ts | Carregamento no servidor dos 15 modelos, chaves e versões estáveis. |
| src/presentation/actions/template-actions.ts | Fronteiras autenticadas e validadas, resultados estruturados e revalidação. |
| src/presentation/actions/process-actions.ts | Delegação para caso de uso comum; retirar ou substituir os caminhos antigos inseguros. |
| src/presentation/components/templates/ | Biblioteca, seletor responsivo, prévia, editor e modal “Salvar como template”. |
| src/presentation/components/processes/ | Entradas na lista/detalhe e composição reaproveitada do editor. |
| src/app/(management)/management/templates/ | Páginas server-side de biblioteca/criação/edição com loading/error. |
| src/app/(management)/management/processes/new/page.tsx | Resolver origem/versionamento via params autenticados, sem definitions na URL. |
| shared/app-shell.tsx, management/more/page.tsx e search-actions.ts | Descoberta consistente em desktop, celular, “+” e busca. |
| src/app/workspace.css | Estilos isolados para biblioteca e modal, usando tokens existentes. |
| scripts e testes de browser | Contratos, mapeamento, isolamento, geração manual/recorrente e interação móvel. |
| docs/auditoria-produto.md e docs/design-system.md | Documentar apenas as garantias efetivamente entregues. |

## 10. Sequência e critérios de saída

1. **Base e regressões:** corrigir instanciação/adaptação e materialização compartilhada; alinhar teste operacional desatualizado e regra atual de pendência. Saída: mesmos campos em tarefas manuais/recorrentes e nenhum vazamento de escopo.
2. **Domínio e banco:** contrato portátil, conversores, versões, idempotência e migração aditiva. Saída: definição publicada válida, isolamento e processos legados funcionando.
3. **Catálogo:** cadastrar e validar os 15 modelos do documento complementar, com conteúdo completo e sem IDs/datas concretas. Saída: três por área em todas as organizações.
4. **Uso em Processos:** biblioteca, modal iPhone, mapeamento, editor preenchido e criação após confirmação final. Saída: escolha de template vira processo funcional com todos os campos preservados.
5. **Administração:** salvar processo como template, rascunho, personalizar pronto, duplicar, publicar, arquivar/restaurar. Saída: admin produz procedimento reutilizável sem levar histórico nem iniciar execução.
6. **Homologação:** cenários de segurança, operação e UI, migração testada em cópia do banco, verificação do app e documentação atualizada.

### Critérios de aceitação

- Existem ao menos 15 templates úteis, três em cada uma das cinco áreas propostas.
- Acesso por Processos, Templates, “Mais”, busca e criação central funciona conforme o papel.
- Um modelo pode ser totalmente modificado, inclusive tarefas/perguntas/dependências; a alteração chega às tarefas geradas.
- Personalizar um pronto afeta somente a cópia da organização; editar um processo afeta somente esse processo.
- OWNER/ADMIN salva um processo como template, publica e o usa em outra unidade com novo mapeamento.
- Modelos manuais e recorrentes preservam formulários, objetivo, prioridade, criticidade, tolerância, evidências e aprovações.
- Datas e IDs não vazam entre usos; papéis precisam ser resolvidos antes de criar.
- MANAGER não cria em unidade/equipe não autorizada por URL, ID, POST direto ou troca de organização.
- Preview, rascunho e biblioteca não disparam execução nem notificação.
- Duplo clique e reenvio após timeout não duplicam processos/execuções.
- Publicações posteriores e arquivamentos não alteram snapshots nem tarefas existentes.
- Modal funciona com teclado, leitor de tela, safe area e viewport de 390, 768, 1024 e 1440 px; verificar também 320 px, zoom de 200% e teclado virtual.

## 11. Validação realizada nesta análise

- npm run typecheck: passou.
- npm run test:domain: passou, com 31 verificações.
- npm run test:operational: 49/51 passaram em cada um dos fusos UTC, America/Sao_Paulo e Asia/Tokyo.
- Falha “fluxo acíclico válido é aceito”: a fixture ainda envia estimatedDuration, removido do schema estrito. Atualizar a fixture para o contrato atual e conservar a verificação real de ciclos.
- Falha “política bloqueia execução anterior pendente”: o teste espera BLOCK_NEW, mas canGenerateExecutionForRoutine atualmente sempre permite gerar. Alinhar o teste e o texto à regra corrente; não restaurar comportamento antigo silenciosamente.
- typecheck exclui scripts e prisma; portanto seu resultado não cobre as fixtures.
- Prévia visual do modal: inspecionada e verificada em 320, 390 e 736 px, sem overflow horizontal ou erros de script; seleção das cinco áreas, prévia, edição do nome, inclusão/remoção de tarefas, revisão, busca vazia e alternância de origem passaram. Essa simulação local não testa autenticação, persistência ou gestos nativos do futuro modal.
- Catálogo documental conferido: 15 modelos e 75 tarefas.

Não executados nesta fase: build, testes de integração que escrevem no banco, seed, migrações e homologação por navegador do app autenticado. O planejamento se baseia na inspeção do código e nos testes indicados; não equivale à validação de uma implementação.

## 12. Referências e limites

Foram consultados os guias da versão instalada em node_modules/next/dist/docs: Server/Client Components, Mutating Data, Server Actions e Caching and Revalidating (Previous Model). A geração automática do bloco de AGENTS.md também foi verificada. Server Actions permanecem responsáveis por autenticar/autorizar cada chamada; params/searchParams são tratados de forma assíncrona, como nas páginas atuais.

As cinco áreas são uma proposta de catálogo, não um ranking de mercado: varejo tem evidência direta no seed e nos placeholders; as demais aproveitam as capacidades de checklists, formulários e serviços do produto. A proposta foi autorizada pelo usuário. Os conteúdos são procedimentos iniciais adaptáveis e não prometem certificação setorial.

As alterações preexistentes no checkout foram preservadas. A primeira entrega da funcionalidade deve priorizar criação independente e edição completa. Aplicação em lote em várias unidades, atualização seletiva de processos existentes, anexos estáticos de instrução e editor global de catálogo para SUPERADMIN podem ser planejados depois, sem serem dependências desta entrega.
