# Acompanhamento de custo — site e aplicativo — 26/10/2026

Escopo: `marcai` (site e backend canônico) e `marcai-emp-app` (aplicativo).

## Conclusão principal

O usuário confirmou que **Scale to zero está desativado no Neon** e que os agendamentos do cron-job.org estão inteiramente desativados.

Sem suspensão automática, o compute pode permanecer ligado e ser cobrado mesmo sem ninguém consultar ou gravar tarefas. Em tamanho constante de **0,25 CU**, 24 horas ativo correspondem a **6 CU-h**, e 30 dias a **180 CU-h**. Isso é custo por tempo de computação, não por quantidade de registros. Fonte: [Neon — ciclo do compute](https://neon.com/docs/introduction/compute-lifecycle).

É uma causa concreta de custo ocioso. Não foi possível estabelecer quando essa configuração foi desativada ou reconstruir sua contribuição exata para todo o acumulado. Não atribuímos os 7,66 CU-h exclusivamente a ela sem as curvas do Neon.

| Métrica informada | Referência anterior | 26/10 | Diferença |
| --- | ---: | ---: | ---: |
| Compute desde 30/09 | 85,53 CU-h | 93,19 CU-h | +7,66 CU-h (+8,96%) |
| Storage | 43,19 MB | 37,98 MB | −5,21 MB |
| Histórico | 1,38 MB | 1,85 MB | +0,47 MB |
| Transferência | 949,01 MB | 979,41 MB | +30,40 MB |

Os 7,66 CU-h equivalem a 30 horas e 38 minutos ativo **se o compute ficou sempre em 0,25 CU nesse consumo**. A configuração atual não prova o tamanho usado durante todo o intervalo. A redução de armazenamento, por si, não diminui o tempo em que o compute fica ligado.

## Diagnóstico atual do banco

Somente leituras limitadas de metadados e agregados foram realizadas. Não houve reset de estatísticas, alteração de configuração, migração, limpeza ou testes com escrita nesse banco.

- A migração `20261021230000_database_efficiency` foi aplicada em `22/10/2026 00:40:12` no horário de Brasília; os índices consultados existem.
- Contagem exata atual: **8 tarefas, 3 usuários, 1 organização**.
- O último início registrado do job operacional é de **22/10/2026 17:07:54**, consistente com os crons atualmente desligados. Não há lease operacional em andamento nesse registro. Isso não constitui um histórico completo de todas as chamadas possíveis.
- Há 8 sessões web válidas e 4 sessões mobile válidas. **Sessão válida não é usuário conectado nem consulta em execução.**
- Na amostra havia 13 conexões ociosas, sem transação aberta. Isso não identifica o cliente de origem de cada conexão nem demonstra polling contínuo. Conexões ociosas isoladamente não são prova de que impedem suspensão.
- Nenhum arquivo temporário ou deadlock foi registrado nas estatísticas coletadas. Não foi medida pressão de RAM suficiente para atribuir a diferença de custo à memória.
- `pg_stat_statements` continua indisponível; não foi instalado. Sem histórico de requisições da hospedagem e métricas por intervalo, não há atribuição financeira por endpoint.

As coletas estão no diretório ignorado `tmp/database-efficiency`: `production-20261026.json` e `followup-details-20261026.json`. Não foi criado monitoramento SQL contínuo: consultar o banco para verificar se ele dormiu também pode acordá-lo.

## Investigação do site

Revisados o hook de tempo real, SSE, emissão de token, resumo do usuário, busca, relógios de tarefas, autenticação e jobs.

- Relógios dos cartões e rascunhos usam processamento local. Um timer visual de um segundo não equivale a consulta SQL a cada segundo.
- O resumo do usuário depende de navegação; a busca tem debounce. Não foi encontrado um job periódico disparado por cada render dessas telas.
- O caminho saudável usa Ably. Token com validade de dez minutos ainda precisa de autorização no servidor ao renovar. Uma tela de teste aberta em primeiro plano, portanto, pode continuar gerando consultas mesmo sem novas tarefas.
- O fallback SSE continua consultando o banco enquanto uma tela visível necessita dele. Se Ably estiver indisponível, isso pode impedir a janela de inatividade necessária ao Neon, mesmo com pouco conteúdo.

### Correções realizadas nesta revisão

1. A autorização Ably pendente recebe `AbortController` e é cancelada ao ocultar a aba ou desmontar o hook.
2. Resposta tardia, inclusive 401 após cancelamento, não agenda refresh nem altera o estado da conexão atual.
3. Mensagens de um cliente Ably antigo são ignoradas depois de sua substituição.

Arquivo: `src/presentation/hooks/use-realtime-events.ts`.

## Investigação do aplicativo

Revisados transporte HTTP, sessão/renovação, cache de consultas, foco das telas, AppState, notificações, destinos e recuperação de eventos.

- O transporte atual pausa ao sair do primeiro plano; a conexão Ably saudável não tem polling SQL periódico.
- O fallback espaça a recuperação até dois minutos; isso ainda pode manter o compute ativo durante uma falha de conexão com o app aberto.
- Renovação de token, reconexão e anexação de canais podiam pedir recuperação do mesmo cursor na mesma janela.
- Uma rajada de avisos podia causar mais de uma busca de eventos e invalidar consultas antes e depois do replay.
- Marcar todos os avisos como lidos invalidava todo o contexto do usuário, incluindo consultas de tarefas que não foram alteradas.
- Abrir um aviso carregava o detalhe para conferir autorização e depois a tela o buscava novamente porque a resposta não havia sido colocada no cache correspondente.

### Correções realizadas nesta revisão

4. Recuperações por aviso, renovação, reconexão e anexação são agrupadas em uma janela de 250 ms. Uma rajada de 20 avisos passa a gerar **uma busca adicional de replay**, em vez das duas do cenário anterior.
5. Os tipos de alteração do aviso e do replay são unidos para uma atualização de tela. Há apenas uma busca em andamento por vez; alteração que chega durante a busca exige nova recuperação depois dela, sem perder o novo cursor.
6. Pausa/desmontagem cancela também o timer de recuperação agrupada e limpa os avisos pendentes do contexto anterior.
7. Requisições JSON/binárias canceladas antes do envio não chegam à API. Cancelamento que coincide com resposta de token expirado não inicia renovação desnecessária.
8. Consultas canceladas ou cujo contexto mudou não são repetidas pelo mecanismo de retry.
9. Marcar todos os avisos como lidos invalida apenas listas e badge de avisos daquele usuário e organização.
10. O detalhe recém-autorizado ao abrir uma notificação é inserido na mesma chave de cache usada pela tela. A navegação reaproveita essa resposta dentro da validade normal existente de 15 segundos; a verificação de autorização antes da abertura permanece.
11. A invalidação após abrir a notificação também foi limitada aos avisos, preservando o detalhe que acabou de ser validado.

Arquivos do app: `src/core/realtime-controller.ts`, `src/core/api.ts`, `src/core/query.ts`, `src/features/notifications/provider.tsx`, `app/(tabs)/notifications.tsx`.

## Referência de backend e testes

12. O snapshot `backend-overlay` estava defasado em relação ao site canônico. Foi atualizado **do site para o app**, com o script protegido já existente; 188 arquivos passam pela conferência de correspondência. Essa cópia inclui alterações prévias do site, não apenas as mudanças de custo desta revisão.
13. A proveniência do schema de testes foi regenerada sem conexão com banco externo. Foram atualizados os mocks de testes para os helpers de data/hora já existentes no site e para a invalidação limitada de notificações. Nenhuma regra operacional ou expectativa de permissão foi removida.

Testes específicos cobrem rajadas, alterações durante replay, renovação simultânea com reconexão, suspensão, revogação, cancelamento de token web, cancelamento HTTP, ausência de retry em contexto obsoleto, invalidação de inbox/badge com preservação de tarefas e isolamento entre organizações, além de reaproveitamento do detalhe autorizado na navegação.

Os testes de banco do aplicativo usam PGlite/loopback e credenciais sintéticas. A suíte não usa o banco de produção. Logs desta revisão ficam em `marcai-emp-app/.tmp/cost-followup/`.

Resultado final:

- `npm test` no app: **306/306 testes passaram**, sem casos ignorados ou falhas. Inclui os testes de API, banco, áreas do funcionário, notificações e transporte.
- Conjunto específico de clientes/tempo real: **34/34 testes passaram**.
- `npm run typecheck`: aprovado no site e no app.
- Conferência do snapshot: **188 arquivos consistentes**; regras compartilhadas do workflow consistentes entre site, app e overlay.
- `git diff --check`: aprovado nos dois repositórios.
- Nesta revisão não foi executada nova compilação nativa Android/iOS nem ensaio em aparelho físico. A validação de transporte usou clientes controlados, sem publicar mensagens nas contas reais de Ably/Firebase.

Resumo estruturado: [validation-2026-10-26.json](validation-2026-10-26.json).

## Ajuste no Neon e acompanhamento

**A ação imediata é ativar Scale to zero no compute de produção**, com a janela padrão de cinco minutos de inatividade. O banco volta a responder ao receber nova conexão; a primeira requisição após suspensão pode ter latência adicional. Fonte: [Neon — Scale to Zero](https://neon.com/docs/introduction/scale-to-zero).

Essa configuração fica no painel Neon em production → Computes → Edit. Ela não foi alterada por esta revisão: não havia acesso autenticado à administração do projeto. O tamanho 0,25 CU já é pequeno; reduzir índices, armazenamento ou pool não substitui permitir a suspensão.

Para avaliar o custo realmente ocioso:

1. Publicar a correção do backend e uma versão atualizada do app. Uma versão antiga instalada não recebe automaticamente alterações locais no controlador de tempo real.
2. Ativar Scale to zero. Manter os crons desligados durante essa medição, como já informado pelo usuário.
3. Fechar o site de testes, o app/emulador e ferramentas que consultem o banco. Verificar também ambientes locais/preview que compartilhem a `DATABASE_URL` de produção.
4. Aguardar a janela de suspensão e observar o estado/curva de compute pelo painel, sem executar consultas de healthcheck SQL durante a espera.
5. Comparar depois um período sem clientes e outro com uma única sessão de teste aberta. Separar tempo de testes de ociosidade real.
6. Usar um banco/branch próprio de desenvolvimento para testes que não precisem acessar produção. Isso evita que o desenvolvimento do site e app mantenha o mesmo compute ativo.

Não é necessária nova migração para as correções de clientes desta revisão. Não houve deploy, atualização distribuída do app, alteração de cron externo ou mudança no painel Neon; não há economia financeira de produção medida após estas novas mudanças.
