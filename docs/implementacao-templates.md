# Templates personalizáveis

Implementado em 12/10/2026 a partir do plano e do catálogo aprovados.

## Uso

- **Processos → Usar template** abre a biblioteca em um modal. O botão central de criação também oferece essa entrada.
- **Operação → Templates** oferece busca, filtros por área e por publicação, prévia das etapas e acesso aos templates da operação. No celular, a página também aparece em **Mais**.
- O catálogo contém três templates em cada área: varejo, alimentação, limpeza e facilities, estoque e logística, manutenção e serviços. São 15 templates e 75 etapas.
- Ao usar um template, escolha a unidade, vincule os papéis às equipes e selecione os aprovadores. Atribuir executores é opcional. Depois, revise e edite todo o processo no editor habitual, incluindo as datas e o fuso da programação.
- A prévia e a preparação não criam tarefas. Salvar um processo manual cria sua execução; uma rotina segue a janela de geração existente.
- Proprietários e administradores podem criar templates, copiar o catálogo, editar rascunhos, publicar versões, duplicar, arquivar e restaurar.
- **Salvar como template**, disponível na lista e no detalhe dos processos, transforma sua definição em rascunho. Se houver várias rotinas, o admin escolhe qual programação será sugerida.

## Dados e permissões

`ReusableProcessTemplate` contém o rascunho e o ponteiro da publicação. `ReusableProcessTemplateVersion` mantém cada publicação imutável. Esses modelos são separados de `ProcessTemplate` e `ProcessTemplateVersion`, que continuam guardando as definições concretas dos processos.

Os templates portáveis armazenam papéis de equipe, executor e aprovador. Não carregam vínculos operacionais, datas absolutas, respostas, arquivos enviados, resultados ou execuções. Instruções e descrições são copiadas como texto: o admin deve revisar referências pessoais que tenha escrito nesse conteúdo.

Gestores acessam catálogo e publicações da própria organização. Ao criar um processo, a unidade, as equipes e as pessoas são verificadas novamente no servidor. Funcionários não acessam a biblioteca. Superadmin não recebe acesso operacional automaticamente.

O processo criado tem uma definição concreta independente e registra a origem e a versão do template. Editar/publicar/arquivar o template não altera os processos nem os snapshots existentes. Uma seleção antiga de uma publicação substituída é recusada, para o gestor escolher novamente a versão desejada.

O envio do editor tem uma chave de idempotência. Transação e bloqueio por chave evitam processos e execuções duplicados em envios concorrentes. Revisões de rascunho evitam sobrescrever a edição de outro admin.

Processos manuais e rotinas compartilham `materializeProcessTasks`. Ela preserva perguntas, instruções, evidências, prioridades, criticidades, dependências, ordenação e aprovações. A ordem é registrada por ID e posição, inclusive quando duas tarefas têm o mesmo título. Prazos relativos usam o início programado da execução. Duração de SLA permanece desativada, conforme a regra atual do projeto.

Notificações persistidas ficam na mesma transação das tarefas. Entregas externas só são disparadas depois do commit. Remover a programação na edição de um processo pausa suas rotinas, preservando as execuções existentes. Editar uma programação atua sobre a rotina indicada pela página, sem substituir as demais.

## Interface

O editor de processos é compartilhado com o editor de templates. O modo template substitui pessoas/equipes por papéis e deixa datas e fuso para a instanciação. Formulários permitem editar perguntas, tipos, obrigatoriedade, alternativas e ordem. Etapas podem ser duplicadas, removidas e reordenadas; aprovações podem ser sequenciais ou paralelas.

O modal usa os componentes existentes de Dialog e Drawer. Tem cantos de 28 px, fundo desfocado, superfícies e verde do projeto, conteúdo com rolagem independente e ações fixas. O Drawer móvel inclui o gesto de fechamento e respeita a área segura inferior.

## Banco e implantação

O banco existente não possui uma linha de base de migrations Prisma. Por isso, esta entrega inclui uma atualização SQL aditiva e idempotente, sem reconstruir tabelas ou alterar dados existentes.

```sh
npm run db:templates
npx prisma generate
npm run build
```

A atualização já foi aplicada ao banco configurado neste workspace. Para outro ambiente, aplique `prisma/templates-library.sql` antes de disponibilizar o código. Reinicie o servidor após gerar o cliente Prisma para carregar os novos modelos.

O catálogo versionado está em `src/infrastructure/templates/catalog-data.json`. A validação do catálogo acontece por `reusableTemplateDefinitionSchema`, compartilhada com as publicações da operação. A estrutura de templates usa `schemaVersion: 1`.

## Verificações

- `npm run typecheck` e compilação de produção.
- `npm run test:domain`: 31 regras.
- `npm run test:operational`: 51 regras em UTC, São Paulo e Tóquio. Duas expectativas antigas foram atualizadas para a definição de tarefas e a regra atual de geração do projeto.
- `npm run test:regressions`: 29 verificações, com fixtures revertidas.
- `npm run test:templates`: 23 verificações de catálogo, conversão, formulários, isolamento de organização, permissões, conflito de revisão, idempotência concorrente, publicação imutável, snapshots, prazos relativos, geração manual e recorrente, pausa, arquivamento e rollback de tarefas/notificações. Fixtures próprias são removidas ao finalizar.
- `npm run test:templates:ui`: fluxo real no navegador para selecionar, vincular equipes, personalizar, duplicar/remover etapa, criar processo, salvar como template, editar perguntas/alternativas, salvar rascunho e publicar. Modal verificado em desktop e telas de 390 px e 320 px, sem rolagem horizontal. Requer o servidor local na porta 3000 e Microsoft Edge instalado; usa conta temporária e remove seus dados ao terminar. Capturas ficam em `tmp/`.

As especificações detalhadas permanecem em `docs/plano-templates-personalizaveis.md` e `docs/catalogo-templates-iniciais.md`.
