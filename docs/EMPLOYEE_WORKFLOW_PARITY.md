# Paridade dos fluxos do funcionário

Repositórios: `marcai-emp-app` e `../marcai`. Revisão: 19/10/2026.

## Regras implementadas

| Situação | Comportamento nos dois ambientes |
| --- | --- |
| Prazo vencido | A tarefa muda para **Atrasados** pelo relógio, sem exigir recarregamento. Durante a tolerância ainda pode ser executada; após o limite, o servidor recusa início, comprovação e conclusão. |
| Processo com atraso e etapa independente disponível | Permanece em **A fazer**, com identificação e ação amarelas **Atenção**. |
| Processo com atraso e demais etapas dependentes ou indisponíveis | Vai para **Atrasados**. A etapa dependente não pode ser executada mesmo se seu prazo individual ainda for válido. |
| Dependências | Condições AND são cumulativas; alternativas OR exigem uma satisfeita; referências informativas não bloqueiam. Aprovação pendente não satisfaz uma condição de aprovação. |
| Bloqueio da gestão | Tem estado e motivo próprios. A sincronização de dependências não remove esse bloqueio. Retirar o bloqueio não renova o prazo e não ignora outras dependências. |
| Limite operacional | Usa o menor prazo aplicável, a tolerância configurada e o teto de duração de 12 horas. O relógio para no limite. Um início anterior à liberação não consome tempo antes dela. |
| Próximos dias | Usa a data de liberação no fuso da unidade. Amanhã pode estar a menos de 24 horas; uma tarefa já liberada com prazo amanhã continua disponível hoje. |
| Sem responsável principal | É necessário **Assumir tarefa** antes de trabalhar, mesmo para um colaborador já vinculado. Duas tentativas concorrentes não criam dois responsáveis principais. |
| Comprovação no início | Assumir não inicia a sessão antes de satisfazer as comprovações obrigatórias de início. |
| Entrega com aprovação | Fica **Em aprovação**, sem anunciar conclusão definitiva nem acumular atraso do funcionário durante a espera. |
| Conclusão de processo | Avalia todas as etapas obrigatórias e suas aprovações, inclusive fora do acesso do funcionário. Opcionais pendentes não impedem conclusão quando existem obrigatórias concluídas. Se só existem opcionais, é preciso concluí-las; a execução não se encerra vazia por uma condição lógica. |
| Paginação e filtros | Não alteram o progresso ou a situação real do processo. O resumo é calculado sobre todas as etapas pertinentes, sem expor conteúdo de etapas sem acesso. Etapas concluídas em dias anteriores continuam compondo processos ativos. |
| Repetição de envio | Os canais usam recibos idempotentes e validação de rodada. Repetir uma operação não duplica entrega, sessão, atribuição ou log. |

## Evidências e Cloudinary

Os dois clientes enviam arquivos diretamente para o Cloudinary com todos os parâmetros assinados pelo servidor. A assinatura fica vinculada a empresa, pessoa, tarefa, campo ou requisito e rodada de correção. O identificador é aleatório e imutável, com sobrescrita desabilitada.

Antes de registrar a comprovação, o servidor consulta os metadados reais do provedor e confere identidade, tipo, formato, tamanho e URL. Uma URL válida da mesma conta não comprova propriedade do arquivo. A consulta externa ocorre antes da transação que bloqueia a tarefa; acesso, rodada e prazo são revalidados ao registrar.

Limites: **10 MB** para comprovações e **12 MB** para anexos de formulário. O tamanho retornado pelo provedor é aceito quando houve normalização legítima do arquivo, respeitando o limite do produto. Anexos usam identificadores opacos e precisam pertencer ao campo e à rodada. As rotas de visualização revalidam acesso.

Uploads novos não fazem fallback silencioso diante de erro de assinatura ou autorização. Envios legados já iniciados preservam a retomada por partes. Nenhum arquivo arbitrário informado pelo cliente é apagado ao tratar uma rejeição.

Foram removidas credenciais fixas do serviço de upload. A configuração deve vir do ambiente. A credencial anteriormente embutida deve ser rotacionada no provedor.

## Organização do código

`shared/employee-workflow.ts` é a fonte das regras puras de prazo, coluna, permissões, badges e progresso. `scripts/sync-employee-workflow.mjs --apply` gera o módulo de execução nativo e copia a regra para o overlay e o site. Sem `--apply`, o comando somente verifica igualdade.

`scripts/sync-employee-backend.mjs` verifica uma lista explícita de arquivos do fluxo compartilhado; `--apply` sincroniza esses arquivos. Os demais arquivos dos projetos não são sobrescritos por esse comando. O manifesto do overlay preserva as bases de comparação das alterações anteriores.

As ações web e as rotas móveis chamam os mesmos serviços transacionais para trabalhar, entregar, registrar anexos e concluir processos. As consultas de listas e etapas carregam rodadas em lote; os detalhes completos são buscados ao abrir a etapa. O agrupamento usa mapas e conjuntos para evitar duplicações e cópias repetidas de listas.

## Banco e aplicação em produção

A migração `20261019160000_employee_workflow` adiciona `managementBlocked` e `managementBlockReason` em tarefas. Ela está nos dois repositórios. Os testes aplicam a migração em bancos locais efêmeros; nenhum banco de produção foi migrado nesta revisão.

Antes de publicar o backend, aplicar a migração pelo procedimento normal do ambiente e gerar o Prisma Client. Publicar backend e clientes com o contrato atualizado. A exportação JavaScript Android não substitui compilação nativa, teste em aparelho ou publicação nas lojas.

## Verificações reproduzíveis

Resultados obtidos na revisão:

| Verificação | Resultado |
| --- | --- |
| Suite completa do aplicativo e integração com o backend real | 243 testes aprovados, zero falhas |
| Regressões web em banco efêmero | 29 verificações aprovadas |
| Domínio do site | 48 verificações aprovadas |
| Regras operacionais do site | 55/55 em UTC, São Paulo e Tóquio |
| TypeScript | Aprovado nos dois repositórios |
| Exportação JavaScript Android | Concluída, incluindo bundle Hermes |
| Cloudinary real | Upload, inspeção e limpeza aprovados |
| Regras e arquivos compartilhados | Igualdade e integridade verificadas |
| Navegador com servidor e banco efêmeros | 6/6 fluxos aprovados, nenhum erro de execução da página |
| Build de produção web | Interrompido antes de finalizar para atender ao pedido de encerramento rápido; não foi considerado aprovado |

Os seis fluxos de navegador verificam vencimento sem recarregar, processo em atenção com etapa independente, bloqueio por dependência, bloqueio da gestão, responsável único ao assumir e conclusão única persistida. As mensagens de Firebase indisponível durante essa auditoria são esperadas, pois as conexões externas do navegador estão bloqueadas. O bundle Android e os testes funcionais não substituem o build de produção web nem o teste em aparelho físico.

No aplicativo:

```powershell
npm.cmd run workflow:check
npm.cmd run typecheck
node --test --test-concurrency=1 tests/*.test.mjs
npm.cmd run test:workflow:regressions
npm.cmd run test:workflow:browser
npx.cmd expo export --platform android --output-dir .tmp/workflow-android-export
```

No site:

```powershell
npm.cmd run typecheck -- --incremental false
npm.cmd run test:domain
npm.cmd run test:operational
npx.cmd prisma validate
```

O teste de regressões do aplicativo executa o script do site em banco efêmero e aguarda o término das transações. O teste do navegador usa dados fictícios, banco em loopback e bloqueia conexões externas. Não usar um banco real para esses testes.

`npx.cmd tsx scripts/verify-cloudinary-workflow-live.ts`, no site, faz um smoke test real com as credenciais do ambiente. Ele envia uma imagem mínima em um caminho exclusivo, confere os metadados pela API administrativa e remove somente o arquivo criado pelo próprio teste. Esse smoke test foi executado com sucesso nesta revisão, incluindo a limpeza.

As suites cobrem diferenças entre app e site, acesso por empresa/equipe/unidade, prazo vencendo durante upload, rodada obsoleta, concorrência, metadados adulterados, dependências, bloqueio manual, conclusão com aprovação, opcionais e processos paginados. Os resultados não equivalem a uma garantia de ausência de qualquer defeito em produção.
