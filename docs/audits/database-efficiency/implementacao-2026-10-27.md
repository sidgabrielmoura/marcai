# Redução de consultas — site e app — 27/10/2026

Escopo: `marcai` (site/backend) e `marcai-emp-app` (React Native). As alterações são locais. Nenhuma publicação, escrita em produção ou mudança de configuração do Neon foi executada nesta etapa. Não há nova mudança de schema ou migração funcional necessária para este conjunto.

## Implementações

1. Leitores autenticados específicos para os quadros do colaborador, tarefas da gestão e visão geral, reaproveitados pela carga inicial e pelas atualizações.
2. Atualização desses três recursos sem reconstruir toda a página e seu shell a cada evento.
3. Fila de alterações por categoria, com agrupamento por 350 ms no transporte web e no cache móvel.
4. No site, uma leitura por recurso em voo; eventos ocorridos durante ela geram uma reconciliação posterior. Erros não criam repetição contínua.
5. Relação explícita entre categoria e rota: avisos não recarregam tarefas, visão geral ou configurações sem relação com o evento.
6. Contadores do shell reconciliados separadamente; eventos só de aviso consultam apenas não lidos.
7. Marcar/limpar avisos no site deixa de invalidar vários quadros e publica a alteração no canal do usuário autenticado.
8. Catálogos de filtros da gestão/visão geral reutilizados por dez minutos. Mudanças estruturais/permissões com `ALL` renovam os catálogos imediatamente.
9. Cache de detalhes web por até 60 s, com limite de 30 itens, agrupamento de leituras e invalidação de detalhes fechados.
10. Server Actions de início/conclusão e de assumir tarefa como colaborador devolvem o DTO autorizado atualizado e um recibo de alteração. A conclusão rápida, que só precisa atualizar o quadro, evita ler um detalhe completo desnecessário.
11. Detalhe/drawer/botões reaproveitam a resposta da ação. Os caminhos otimizados deixam de pedir a mesma revalidação geral da aplicação compartilhada.
12. O DTO de uma ação evita que uma leitura web anterior atrasada restaure o estado antigo. O cache móvel também descarta DTO de versão anterior à já aplicada.
13. Recibos de ações são compartilhados com a indicação do Ably e retirados das filas pendentes, reduzindo atualização duplicada pelo próprio eco.
14. Protocolo 2 opcional nos endpoints de autorização, com `tokenRequest`, `scopeVersion` e `contextKey`; clientes anteriores mantêm o formato antigo.
15. Metadados derivados do contexto já autenticado, sem consulta adicional apenas para calcular o hash. Papel/escopos/contexto diferentes exigem reconstrução do acesso.
16. No app com protocolo 2, mensagens saudáveis invalidam diretamente as famílias; renovação com mesmo escopo não dispara replay.
17. Replay preservado para conexão/retomada/reconexão/lacuna. Fallback continua com backoff e para quando a assinatura saudável é recuperada.
18. SSE web passa categorias do replay. Snapshot, lacuna ou mudança de escopo continuam exigindo reconciliação completa; o checkpoint legado permanece compatível.
19. Cancelamento de autorizações ao ocultar/desmontar e descarte de respostas de clientes/contextos encerrados, tanto na web quanto no app.
20. Abas web visíveis do mesmo contexto compartilham o transporte via Web Locks/BroadcastChannel. O líder libera a lease; o próximo valida uma autorização antiga antes de assumir. Sem suporte às APIs, cada aba visível preserva seu transporte próprio.
21. Compartilhamento restrito a categorias e recibos, sem tokens, DTOs, nomes ou conteúdo de notificações. Usuário, vínculo, organização e escopos fazem parte do isolamento.
22. Validade móvel por família: tarefas/execuções/avisos 60 s, busca 30 s, histórico 5 min e catálogos 10 min. Esses valores não criam polling.
23. Refetch automático redundante por foco/rede desativado; a reconciliação central cuida da retomada. Recursos desabilitados/sem foco ficam desatualizados sem consulta imediata.
24. `applyTaskResponse` reaproveita o detalhe e atualiza registros das páginas carregadas. Listas/totais/dependências e outros detalhes afetados permanecem sujeitos a reconciliação seletiva.
25. Ably e FCM usam `changeId` comum para a mesma notificação e alimentam a mesma fila móvel. O ACK de recebimento permanece independente da deduplicação de consultas.
26. Abrir aviso reaproveita o detalhe já autorizado na navegação; marcar lido invalida somente avisos.
27. Sincronização de instalação compara token, permissão, contexto, ambiente, plataforma e versão. Estado idêntico não repete POST/DELETE em cada retomada; há conferência após 24 h de oportunidade e sincronização manual explícita.
28. Registros de instalação concorrentes são agrupados; rotação pendente é preservada e o novo contexto aguarda a gravação antiga terminar. Respostas antigas não atualizam o estado novo.
29. Registro idempotente de visualização de tarefa permanece auditado, mas não publica mudança operacional que faria outros quadros consultarem o banco.
30. Contrato permanente, mapas de arquivos, fluxo de publicação, limites e testes documentados; ambos os `AGENTS.md` e READMEs indicam os guias para futuras IAs.
31. Snapshot do backend no app atualizado somente na direção canônica site → app e validado com manifesto de 199 arquivos.
32. Testes acrescentados para protocolo, deduplicação, DTO atrasado, filas, telas inativas, instalação e liderança entre abas, além das verificações já existentes de domínio, autorização, schema e eficiência.

## Evidências e limites

A validação funcional usa somente PostgreSQL local descartável ou PGlite, com dados sintéticos e sem credenciais externas. O executor do site agora permite `--reset` para reconstruir exclusivamente seu banco de fixtures fixo em loopback quando o baseline local estiver antigo. A limpeza remove tarefas/execuções antes da organização, respeitando os triggers e as FKs do schema atual.

O teste do histórico mede suas próprias consultas com AsyncLocalStorage para não misturar trabalho assíncrono de outros fluxos. O contrato atual inclui o fuso da rotina: uma tarefa e vinte tarefas usam as mesmas vinte consultas internas, demonstrando ausência de crescimento por item nesse cenário. Esse número não representa a contagem total de uma requisição HTTP autenticada nem uma medição de custo de produção.

Resultados finais e métricas locais: [validation-2026-10-27.json](validation-2026-10-27.json).

| Verificação | Resultado |
| --- | --- |
| Suíte completa do app | 319/319 aprovados |
| Tipos do app e do site | Aprovados |
| Regras de domínio, operação, workflow e histórico | Aprovadas |
| Eficiência em PostgreSQL 18 local | 22/22 verificações aprovadas |
| Comparação de schema ORM × banco local | Sem diferenças |
| Build de produção Next.js 16.3.6 com webpack | Aprovado |
| Paridade e manifesto do snapshot | 199 arquivos conferidos |
| Cópia de fontes usada no build | 383 arquivos conferidos com a fonte atual |

O build emitiu 19 avisos do otimizador de CSS, também observados no log anterior à etapa. Nenhum estilo foi alterado por este conjunto. A saída de testes também registra um aviso de depreciação do driver `pg` no ambiente com conexão única. Esses avisos não foram tratados como aprovação visual ou validação em aparelho.

As rotas legadas ainda podem usar atualização da rota quando ela é necessária. Listas com totais/dependências continuam reconciliando o leitor específico; o DTO de uma tarefa não permite deduzir todos os efeitos da operação. Autorização continua atual no servidor.

Não foram realizados ensaios em aparelho Android/iOS ou medição de economia em produção. O gráfico acumulado do Neon não permite atribuir uma queda a código ainda não publicado. Publicar o backend antes do app e comparar janelas equivalentes de CU-hours, tempo ativo, requisições e latência, conforme o [contrato de arquitetura](../../database-access-architecture.md).
