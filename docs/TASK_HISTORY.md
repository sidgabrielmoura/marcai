# Visualizações e histórico de tarefas

Ao abrir os detalhes de uma tarefa, o web e o aplicativo de funcionários enviam uma operação explícita de visualização. Listagem, busca, pré-carregamento de links, consultas GET, atualizações automáticas e ações rápidas na lista não registram visualizações.

O evento `TASK_VIEWED` usa a auditoria existente (`activity_logs`) e salva o vínculo do funcionário autenticado, o nome, a data/hora do servidor e se a tarefa estava sem responsável principal naquele momento. Não exige migração. Cada nova abertura gera um evento; reenvios da mesma abertura usam a mesma chave de idempotência e preservam um único registro. O servidor revalida organização, equipe, unidade e acesso à tarefa.

O histórico da gestão, tanto na gaveta como na página completa, usa o mesmo componente e apresenta os eventos em português, com funcionário e data/hora completa no fuso de São Paulo. Eventos antigos com códigos em letras minúsculas também são traduzidos na exibição, sem reescrever a auditoria.

O resumo “Visualizaram e não assumiram” reúne os funcionários que abriram quando a tarefa estava sem responsável. Cada funcionário aparece uma vez, com sua última visualização nessa condição. Uma ação posterior de assumir, ou sua atribuição atual como responsável principal, retira a pessoa do resumo. Os eventos originais permanecem no histórico. Se a tarefa voltar a ficar disponível e a pessoa abrir novamente, ela volta ao resumo até assumir. Não há inferência sobre o motivo de não assumir.

O histórico mostra inicialmente 20 eventos, com opção de mostrar mais. O resumo considera todos os registros da tarefa. Visualizações anteriores à instalação da funcionalidade não são reconstruídas.

Validação:

- Web: `npm run typecheck` e `npm run test:task-history`.
- Mobile (`../marcai-emp-app`): `npm run typecheck` e `node --test --test-concurrency=1 tests/task-views-api.test.mjs tests/task-views-client.test.mjs`.
- O mobile contém a implementação nativa e as alterações correspondentes em `backend-overlay`; os arquivos novos estão incluídos no manifesto da integração.
