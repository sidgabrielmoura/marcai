# Catálogo inicial — 15 templates personalizáveis

Complemento de [plano-templates-personalizaveis.md](plano-templates-personalizaveis.md). Proposta de cinco áreas autorizada pelo usuário em 11/10/2026.

Cada item abaixo contém cinco tarefas iniciais completas. São sugestões editáveis, sem IDs reais, datas concretas ou execução automática. Evidências e perguntas indicadas são obrigatórias por padrão; o usuário pode alterar essa regra. Demais tarefas pedem apenas conclusão. Prioridade/criticidade inicial MEDIUM e tolerância 20 minutos, editáveis; sem prazo obrigatório por padrão. Rotina e horários são confirmados no uso. Aprovações referenciam papéis, nunca pessoas predefinidas.

Cada tarefa STANDARD suporta uma evidência conforme o contrato atual. Uma tarefa FORM contém perguntas dos tipos já suportados: SHORT_TEXT, LONG_TEXT, RATING, MULTIPLE_CHOICE, BOOLEAN, PHOTO, VIDEO e FILE. Não confundir pergunta de formulário com evidência numérica de tarefa STANDARD.

Fluxo livre permite qualquer ordem. Fluxo sequencial bloqueia a etapa seguinte até concluir a anterior. As dependências especiais são descritas explicitamente. Todas as tarefas são obrigatórias inicialmente; o usuário pode alterá-las.

## 1. Varejo e operação de loja

### V01 — Abertura de loja

Objetivo: deixar a unidade preparada para receber clientes. Papéis: Operação e Gestor. Sugestão: diária nos dias de funcionamento; escolher horário de abertura. Fluxo sequencial.

1. **Inspecionar a entrada.** Verifique acessos, iluminação e obstáculos; registre qualquer impedimento para a liderança. Evidência: PHOTO da entrada.
2. **Preparar o salão.** Organize balcão, exposição e itens de uso; confira limpeza e sinalização de preço. Evidência: PHOTO do salão preparado.
3. **Conferir recursos de atendimento.** Ligue os equipamentos utilizados; teste o acesso aos sistemas e comunique falhas. FORM: “Equipamentos funcionam?” BOOLEAN; “Pendências encontradas” LONG_TEXT opcional.
4. **Conferir o caixa inicial.** Compare o valor inicial com o controle interno e informe divergências. Evidência: NUMBER com o valor conferido; instrução para não fotografar dados de clientes.
5. **Confirmar a abertura.** Revise os registros anteriores; sinalize se há impedimento para iniciar o atendimento. FORM: “Unidade pronta?” BOOLEAN; “Observações” LONG_TEXT opcional. Aprovação pelo papel Gestor.

### V02 — Fechamento e passagem de turno

Objetivo: encerrar o atendimento e registrar pendências para o próximo turno. Papéis: Operação e Gestor. Sugestão: diária, ao fechamento. Fluxo sequencial.

1. **Encerrar os atendimentos.** Confirme que solicitações em curso têm responsável e que nenhum cliente aguarda retorno. FORM: “Há atendimento pendente?” BOOLEAN; “Pendência e encaminhamento” LONG_TEXT opcional.
2. **Conferir o caixa final.** Compare os valores do sistema com o controle interno; explique divergências ao responsável. Evidência: NUMBER do saldo conferido.
3. **Organizar o ambiente.** Reponha os materiais essenciais e organize o salão para o próximo turno. Evidência: PHOTO do ambiente.
4. **Verificar equipamentos e acessos.** Siga o procedimento interno de desligamento e fechamento; comunique qualquer item que deva continuar ligado ou acessível. FORM: “Verificação concluída?” BOOLEAN; “Exceções” LONG_TEXT opcional.
5. **Registrar a passagem de turno.** Informe pendências, itens prioritários e o encaminhamento acordado. FORM: “Resumo do turno” LONG_TEXT; “Há prioridade para o próximo turno?” BOOLEAN. Aprovação Gestor.

### V03 — Reposição e conferência de exposição

Objetivo: corrigir faltas e inconsistências da exposição. Papéis: Reposição e Gestor. Sugestão: semanal ou diária, escolhida no uso. Fluxo sequencial.

1. **Identificar faltas.** Percorra as áreas definidas e liste produtos ou materiais que precisam de reposição. FORM: “Itens a repor” LONG_TEXT.
2. **Separar os itens.** Compare a lista com a disponibilidade no estoque e indique o que não foi encontrado. FORM: “Separação concluída?” BOOLEAN; “Itens indisponíveis” LONG_TEXT opcional.
3. **Repor a exposição.** Organize os itens conforme o padrão da unidade e mantenha acessos desobstruídos. Evidência: PHOTO da exposição.
4. **Conferir identificação.** Compare etiquetas e materiais de informação com os dados internos; comunique inconsistências. FORM: “Identificação conferida?” BOOLEAN; “Divergências” LONG_TEXT opcional.
5. **Registrar o resultado.** Resuma as faltas restantes e atribua seu acompanhamento no fluxo operacional. Evidência: TEXT do resumo.

## 2. Alimentação e restaurantes

### A01 — Preparação do turno

Objetivo: preparar ambiente, materiais e equipe conforme o procedimento da operação. Papéis: Produção e Gestor. Sugestão: diária por turno, com horários configurados no uso. Fluxo sequencial.

1. **Conferir a área de trabalho.** Verifique organização, condições visíveis e disponibilidade dos materiais exigidos pelo procedimento interno. FORM: “Área preparada?” BOOLEAN; “Pendências” LONG_TEXT opcional.
2. **Verificar equipamentos.** Confira funcionamento aparente e controles exigidos pela unidade; encaminhe falhas ao responsável. FORM: “Condição dos equipamentos” MULTIPLE_CHOICE: “Prontos”, “Com pendência”, “Indisponíveis”; “Detalhes” LONG_TEXT opcional.
3. **Conferir insumos do turno.** Compare a previsão de produção com os itens disponíveis; registre faltas e encaminhamentos. FORM: “Insumos faltantes” LONG_TEXT; instrução para escrever “Nenhum” se não houver.
4. **Preparar as estações.** Organize utensílios, materiais e identificação conforme o padrão interno. Evidência: PHOTO da estação.
5. **Liberar o turno.** Revise as pendências e confirme as condições para começar. FORM: “Pronto para começar?” BOOLEAN; “Observações” LONG_TEXT opcional. Aprovação Gestor.

### A02 — Recebimento de insumos

Objetivo: registrar conferência e destino do recebimento. Papéis: Recebimento e Gestor. Sugestão: manual, por entrega. Fluxo sequencial.

1. **Identificar a entrega.** Confira fornecedor e documento de referência com o pedido esperado. FORM: “Fornecedor” SHORT_TEXT; “Referência da entrega” SHORT_TEXT.
2. **Conferir quantidade e condição.** Compare os itens com o pedido; registre faltas ou condições inadequadas conforme o procedimento da unidade. FORM: “Conferência” MULTIPLE_CHOICE: “Conforme”, “Com divergência”; “Divergências” LONG_TEXT opcional.
3. **Registrar controles previstos.** Anote os controles específicos requeridos pela operação, sem limites setoriais predefinidos. Evidência: TEXT dos controles e resultados.
4. **Confirmar o destino.** Identifique o local de armazenamento ou segregação e registre a decisão de recebimento. FORM: “Decisão” MULTIPLE_CHOICE: “Receber”, “Receber parcialmente”, “Encaminhar para avaliação”; “Destino” SHORT_TEXT. Aprovação Gestor.
5. **Organizar e identificar.** Após a decisão do responsável, armazene os itens recebidos e identifique os que aguardam avaliação. Evidência: PHOTO. Dependência APPROVAL_CONDITION da tarefa 4.

### A03 — Encerramento de produção

Objetivo: encerrar o turno e deixar a área organizada. Papéis: Produção e Gestor. Sugestão: diária ao fim do turno. Fluxo sequencial.

1. **Registrar o que ficou pendente.** Relacione ordens, itens ou preparos que precisam de acompanhamento. FORM: “Pendências” LONG_TEXT.
2. **Destinar insumos remanescentes.** Siga as instruções internas de identificação, armazenamento ou descarte e registre exceções. Evidência: TEXT do encaminhamento.
3. **Organizar utensílios e superfícies.** Execute o procedimento interno para cada área e deixe os materiais em seu lugar. Evidência: PHOTO da estação organizada.
4. **Verificar equipamentos.** Faça o encerramento conforme as orientações dos equipamentos e da unidade. FORM: “Verificação concluída?” BOOLEAN; “Equipamentos que permanecem ativos” LONG_TEXT opcional.
5. **Concluir a passagem de turno.** Registre o estado da área e confirme que as pendências foram encaminhadas. FORM: “Resumo final” LONG_TEXT; “Área liberada?” BOOLEAN. Aprovação Gestor.

## 3. Limpeza e facilities

### L01 — Limpeza de abertura

Objetivo: preparar os ambientes para uso. Papéis: Limpeza e Supervisor. Sugestão: diária antes da abertura. Fluxo livre nas tarefas 1–4; tarefa 5 depende das quatro anteriores (AND).

1. **Preparar os materiais.** Separe os materiais conforme o procedimento interno e sinalize as áreas de trabalho.
2. **Limpar áreas comuns.** Execute a limpeza das superfícies e do piso previstos no roteiro da unidade; comunique condições inadequadas. Evidência: PHOTO.
3. **Preparar sanitários e vestiários.** Execute o roteiro interno e confira itens de uso. FORM: “Ambiente pronto?” BOOLEAN; “Itens faltantes” LONG_TEXT opcional.
4. **Recolher resíduos e organizar.** Encaminhe os resíduos aos locais indicados pela operação e guarde materiais de trabalho.
5. **Conferir a liberação.** Revise as áreas atendidas e registre as pendências restantes. FORM: “Áreas liberadas?” BOOLEAN; “Pendências” LONG_TEXT opcional. Aprovação Supervisor.

### L02 — Inspeção de sanitários e vestiários

Objetivo: registrar as condições e a reposição ao longo do dia. Papéis: Limpeza. Sugestão: diária com múltiplos horários escolhidos no uso. Fluxo sequencial.

1. **Inspecionar as condições.** Verifique limpeza, acesso e funcionamento aparente dos itens do ambiente. FORM: “Condição geral” MULTIPLE_CHOICE: “Adequada”, “Precisa de atenção”, “Indisponível”; “Problema encontrado” LONG_TEXT opcional.
2. **Repor os consumíveis.** Confira os itens previstos para o local e reponha o que estiver faltando.
3. **Executar a manutenção de limpeza.** Siga o roteiro interno para os pontos que precisam de atendimento.
4. **Registrar impedimentos.** Informe vazamentos, falhas ou danos e encaminhe ao responsável da unidade. FORM: “Há impedimento?” BOOLEAN; “Encaminhamento” LONG_TEXT opcional.
5. **Registrar o resultado.** Confirme o estado final do ambiente, evitando capturar pessoas em fotos. FORM: “Ambiente disponível?” BOOLEAN; “Observações finais” LONG_TEXT opcional.

### L03 — Limpeza periódica de ambientes

Objetivo: organizar uma intervenção programada em uma área. Papéis: Limpeza e Supervisor. Sugestão: semanal; ajustar área e procedimento. Fluxo sequencial.

1. **Confirmar a área e o roteiro.** Identifique a área prevista e revise o procedimento antes da intervenção. FORM: “Área atendida” SHORT_TEXT; “Roteiro confirmado?” BOOLEAN.
2. **Preparar o acesso.** Sinalize e organize o local conforme a orientação da unidade.
3. **Executar o roteiro.** Realize as etapas descritas pelo admin para a área. Evidência: PHOTO do resultado.
4. **Conferir materiais e resíduos.** Organize o local após o trabalho e encaminhe materiais/resíduos aos destinos internos.
5. **Solicitar a liberação.** Informe o que foi feito e o que ficou pendente. FORM: “Resumo da execução” LONG_TEXT; “Há pendências?” BOOLEAN. Aprovação Supervisor.

## 4. Estoque e logística

### E01 — Recebimento de mercadorias

Objetivo: conferir uma entrega e registrar seu destino. Papéis: Recebimento e Conferente. Sugestão: manual, por entrega. Fluxo sequencial.

1. **Identificar o recebimento.** Compare a entrega com sua referência interna. FORM: “Fornecedor/origem” SHORT_TEXT; “Pedido/documento” SHORT_TEXT.
2. **Conferir volumes.** Compare a quantidade de volumes com a informação esperada e registre divergências. Evidência: NUMBER da quantidade recebida.
3. **Inspecionar a condição.** Verifique condições visíveis e anote avarias ou diferenças. FORM: “Condição” MULTIPLE_CHOICE: “Conforme”, “Com divergência”; “Detalhes” LONG_TEXT opcional; “Registro da condição” PHOTO.
4. **Confirmar aceite e destino.** Registre os itens aceitos, os segregados e a área de destino. FORM: “Decisão e destino” LONG_TEXT. Aprovação Conferente.
5. **Organizar o armazenamento.** Encaminhe os itens conforme o aceite e registre a organização final. Evidência: PHOTO. Dependência APPROVAL_CONDITION da tarefa 4.

### E02 — Separação e expedição

Objetivo: separar e conferir uma saída com rastreabilidade. Papéis: Separação e Conferente. Sugestão: manual, por pedido. Fluxo sequencial.

1. **Identificar o pedido.** Confira a referência e o destino na informação interna. FORM: “Pedido” SHORT_TEXT; “Destino” SHORT_TEXT.
2. **Separar os itens.** Compare cada item separado com a relação do pedido e registre indisponibilidades. FORM: “Separação concluída?” BOOLEAN; “Itens indisponíveis” LONG_TEXT opcional.
3. **Conferir a separação.** Revise quantidade e identificação; registre divergências e encaminhe a decisão. FORM: “Conferência” MULTIPLE_CHOICE: “Conforme”, “Com divergência”; “Detalhes” LONG_TEXT opcional. Aprovação Conferente.
4. **Preparar os volumes.** Organize e identifique os volumes conforme o procedimento da operação. Evidência: PHOTO. Dependência APPROVAL_CONDITION da tarefa 3.
5. **Registrar a saída.** Informe quantidade de volumes e referência de coleta/retirada. FORM: “Volumes expedidos” SHORT_TEXT; “Referência da saída” SHORT_TEXT.

### E03 — Inventário cíclico

Objetivo: comparar a contagem física de um recorte com o controle interno. Papéis: Estoque e Conferente. Sugestão: semanal; ajustar recorte e frequência. Fluxo sequencial.

1. **Definir o recorte.** Identifique área, grupo ou item previsto e registre a referência utilizada. FORM: “Recorte da contagem” SHORT_TEXT; “Referência do controle” SHORT_TEXT.
2. **Realizar a primeira contagem.** Conte os itens do recorte conforme o roteiro interno, sem registrar dados de outros itens. Evidência: NUMBER da quantidade.
3. **Comparar o resultado.** Confronte a contagem com a referência e indique diferenças. FORM: “Resultado” MULTIPLE_CHOICE: “Sem diferença”, “Com diferença”; “Diferença encontrada” LONG_TEXT opcional.
4. **Conferir as divergências.** Revise o recorte e registre recontagem ou justificativa; se não houver diferença, registre “Não se aplica”. FORM: “Resultado da conferência” LONG_TEXT. Aprovação Conferente.
5. **Registrar o encaminhamento.** Informe a decisão sobre ajustes e acompanhamento. Evidência: TEXT. Dependência APPROVAL_CONDITION da tarefa 4.

## 5. Manutenção e serviços técnicos

### M01 — Inspeção periódica de equipamento

Objetivo: registrar a condição de um equipamento conforme seu roteiro interno. Papéis: Manutenção e Responsável técnico. Sugestão: semanal; admin adapta roteiro e frequência. Fluxo sequencial.

1. **Identificar o equipamento.** Registre a identificação interna e a área atendida. FORM: “Equipamento” SHORT_TEXT; “Área” SHORT_TEXT.
2. **Executar a inspeção prevista.** Siga o procedimento aprovado para o equipamento; não inclua intervenções que não estejam no roteiro. FORM: “Condição encontrada” MULTIPLE_CHOICE: “Conforme”, “Com pendência”, “Indisponível”; “Observações” LONG_TEXT opcional.
3. **Registrar a condição.** Documente o ponto inspecionado conforme o procedimento interno. Evidência: PHOTO.
4. **Encaminhar pendências.** Descreva a pendência e a orientação recebida; se não houver, registre “Nenhuma”. Evidência: TEXT.
5. **Conferir o resultado.** Revise o registro e indique o encaminhamento final. FORM: “Resultado da inspeção” LONG_TEXT. Aprovação Responsável técnico.

### M02 — Atendimento a chamado

Objetivo: acompanhar um atendimento desde a identificação até a conferência. Papéis: Técnico e Responsável técnico. Sugestão: manual, por chamado. Fluxo sequencial.

1. **Identificar a solicitação.** Registre a referência e o problema relatado. FORM: “Chamado” SHORT_TEXT; “Problema relatado” LONG_TEXT.
2. **Avaliar o atendimento.** Verifique o cenário dentro das orientações e da competência do técnico; registre o diagnóstico e o encaminhamento. FORM: “Avaliação” LONG_TEXT; “Pode executar o procedimento previsto?” BOOLEAN.
3. **Registrar o serviço realizado.** Execute somente o procedimento autorizado e descreva a intervenção ou o impedimento. FORM: “Serviço/encaminhamento” LONG_TEXT; “Registro do resultado” PHOTO.
4. **Verificar o resultado.** Faça a verificação prevista para o atendimento e registre a condição final. FORM: “Resultado” MULTIPLE_CHOICE: “Resolvido”, “Parcialmente resolvido”, “Aguardando ação”; “Observações” LONG_TEXT opcional.
5. **Conferir o encerramento.** Revise o atendimento e as pendências para acompanhamento. FORM: “Resumo final” LONG_TEXT; “Há pendência?” BOOLEAN. Aprovação Responsável técnico.

### M03 — Preparação e entrega de serviço

Objetivo: organizar materiais, execução e conferência de um serviço agendado. Papéis: Equipe de serviço e Gestor. Sugestão: manual; o usuário pode configurar recorrência. Fluxo sequencial.

1. **Confirmar o escopo.** Revise a referência do serviço e os requisitos acordados. FORM: “Referência do serviço” SHORT_TEXT; “Escopo confirmado” LONG_TEXT.
2. **Conferir os recursos.** Compare materiais e equipamentos com o roteiro; encaminhe faltas antes do trabalho. FORM: “Recursos disponíveis?” BOOLEAN; “Faltas e encaminhamento” LONG_TEXT opcional.
3. **Executar o roteiro aprovado.** Siga as instruções que o admin personalizou para o serviço e registre o resultado. Evidência: PHOTO.
4. **Conferir a entrega.** Compare o resultado com o escopo e registre eventuais diferenças. FORM: “Entrega conforme o escopo?” BOOLEAN; “Diferenças” LONG_TEXT opcional.
5. **Registrar a conclusão.** Descreva o que foi entregue e as pendências encaminhadas. FORM: “Resumo da entrega” LONG_TEXT; “Pendências” LONG_TEXT opcional. Aprovação Gestor.

## Regras editoriais para cadastrar no código

- Chaves estáveis propostas: V01–V03, A01–A03, L01–L03, E01–E03 e M01–M03; usar slugs ASCII correspondentes no catálogo técnico e versionar desde v1.
- Converter a ordem descrita em dependências locais; nos casos APPROVAL_CONDITION, manter o slot de aprovador na tarefa anterior.
- Inserir os títulos, objetivos, instruções e perguntas integralmente, sem tarefas vazias ou conteúdo genérico de preenchimento.
- “Conferente”, “Supervisor” e “Responsável técnico” são rótulos de papéis do procedimento. Para aprovação, o mapeamento deve escolher membro com papel de gestão e autorização conforme as regras do Tarefaí.
- Nenhum template aprova automaticamente um resultado porque uma resposta é “Sim”. As perguntas registram a informação; a aprovação usa o fluxo existente.
- Ao receber “Não”, “Com divergência” ou “Indisponível”, o colaborador registra o encaminhamento conforme as instruções. Desvios automáticos condicionados a respostas não fazem parte do motor atual nem desta entrega.
- SLA por duração e limiares setoriais não são prescritos. Prazos relativos e criticidades adicionais são configurados explicitamente pelo admin.
- Cada publicação do catálogo precisa passar validação de schema, dependências e tipos de perguntas; seus testes precisam resolver papéis fictícios e verificar que o processo resultante pode gerar tarefas nos dois caminhos.
