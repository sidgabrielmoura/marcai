# Controle de consumo e tempo real

O contrato detalhado para futuras alterações por pessoas e IAs está em [database-access-architecture.md](database-access-architecture.md). Atualização de 27/10/2026: protocolo 2, leitores por recurso, DTOs de mutação, compartilhamento entre abas e cache móvel por família.

O backend em `marcai` é canônico. O projeto `marcai-emp-app` consome a API e mantém somente um snapshot verificado desse backend. Editar o backend aqui e atualizar o snapshot com `node scripts/sync-employee-backend.mjs --refresh-from-source`, executado no repositório móvel. Scripts de aplicação na direção contrária foram bloqueados para evitar regressões.

## Transporte

- Web e mobile recebem avisos pelo Ably. A API key é exclusivamente do servidor.
- `GET /api/ably/token` autentica a sessão web. `GET /api/mobile/v1/realtime/token` autentica a sessão mobile, incluindo vínculo, papel, organização e credenciais vigentes.
- Tokens têm dez minutos e somente `subscribe`. O canal privado é `user:{userId}:notifications`; o canal `org:{organizationId}:sync` contém apenas organização e categorias de alteração. Nunca publicar dados de tarefas nesse canal.
- O replay persistente continua em `GET /api/mobile/v1/events?cursor=...`: ausência de cursor ou lacuna exige snapshot, sem baixar o histórico inteiro. O watermark por transações concluídas é preservado.
- No protocolo 2, o mobile recupera o replay ao conectar, retomar contexto, reconectar ou perder continuidade. Renovação com mesmo escopo e avisos saudáveis invalidam diretamente as famílias afetadas, sem replay extra. O modo legado preserva compatibilidade. Não há polling SQL de 2, 30 ou 60 segundos na conexão saudável. O fallback é ativado em falhas e espaça consultas até dois minutos.
- A autorização é revalidada em cada requisição. A renovação de token pode acordar o Neon a cada dez minutos em uma sessão permanentemente aberta; não confundir ausência de polling frequente com zero consumo.

## Escritas e invalidadores

Server Actions usam `revalidatePath` de `@/infrastructure/realtime/revalidate`, depois das gravações. A função preserva a invalidação do Next e agenda uma indicação de sincronização com `after`, agrupada por requisição/organização. Ações de superadmin que alteram outro tenant usam também `revalidateOrganization` com o destino já autorizado.

A API mobile publica após concluir as escritas relevantes e as transações; leitura de aviso usa o canal privado. GET, autorização, registro de aparelho e partes de uploads não devem disparar refresh do quadro. Jobs publicam apenas para organizações alteradas, após concluir suas transações.

O aviso não é um banco de dados nem autorização para acessar um recurso. A persistência e o replay continuam sendo a fonte de recuperação quando um aviso é perdido. O payload mínimo não substitui o controle de acesso dos leitores.

## Consultas

A primeira página de tarefas retorna as contagens completas. As seguintes usam `includeCounts: false` e carregam apenas os resumos das execuções presentes na página. O cliente guarda as contagens da primeira página. Não impor `take` arbitrário às estatísticas nem ocultar registros para reduzir consultas.

`GET /api/mobile/v1/notifications/unread-count` retorna somente o total de avisos não lidos. As telas móveis desabilitam suas consultas quando estão fora de foco; os relógios visuais continuam locais.

## Agendador

A análise dos quatro agendamentos apresentados no cron-job.org, incluindo impacto da frequência de cinco minutos e colisão entre lixeira/histórico, está em [crons-2026-10-27.md](audits/database-efficiency/crons-2026-10-27.md). Os crons não foram ativados pela auditoria.

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `OPERATIONAL_JOBS_ENABLED` | habilitado | `0` devolve `DISABLED` antes de acessar o banco, após autenticar o cron |
| `OPERATIONAL_JOB_MIN_INTERVAL_MS` | `60000` | Intervalo mínimo entre inícios de varreduras operacionais |
| `OPERATIONAL_SELECTIVE_ENABLED` | habilitado | `0` volta ao caminho legado; padrão usa agenda/sinais transacionais |
| `OPERATIONAL_RECONCILE_INTERVAL_MS` | `3600000` | Conferência de segurança por organização/fase |

A [agenda seletiva](operational-scheduler.md) consulta primeiro metadados e, sem trabalho, retorna `NO_WORK` com uma consulta e sem escritas. Com trabalho, a lease continua protegendo a concorrência e libera em sucesso/falha. O intervalo não altera o serviço externo. Uma consulta a cada cinco minutos ainda pode manter o compute ativo. A migração `20261027180000_selective_operational` deve preceder o backend novo. Não desabilitar prazos de produção indiscriminadamente.

## Validação e publicação

A investigação de 26/10, com a comparação de consumo, o diagnóstico de Scale to zero e as correções conjuntas no site/app, está em [acompanhamento-2026-10-26.md](audits/database-efficiency/acompanhamento-2026-10-26.md).

```powershell
node scripts/test-database-efficiency.cjs
node scripts/test-database-efficiency.cjs --build
# Compilador alternativo suportado pelo Next:
node scripts/test-database-efficiency.cjs --build --webpack
```

O executor usa somente PostgreSQL 18 descartável em loopback e credenciais sintéticas. Nunca apontar o executor ou as fixtures para produção.

Publicar o backend antes do app, pois ele fornece os novos endpoints e o canal de sincronização. O checkpoint completo mantém compatibilidade com versões antigas do mobile. Validar assinatura, reconexão, revogação e uma alteração real em homologação antes de comparar CU-hours em produção. Não reativar o worker mobile descontinuado para tentar corrigir consumo ou filas antigas.

Referências: [Ably React Native](https://ably.com/docs/getting-started/react-native), [token auth](https://ably.com/docs/auth/token), [recuperação](https://ably.com/docs/connect/states), documentação do Next.js instalada em `node_modules/next/dist/docs`.
