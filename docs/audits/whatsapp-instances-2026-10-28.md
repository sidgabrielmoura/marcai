# Instâncias e alertas WhatsApp — 28/10/2026

Atualização posterior: o backend com webhooks assinados e Ably está descrito na [validação de 29/10/2026](whatsapp-backend-2026-10-29.md); os resultados abaixo registram a entrega inicial.

## Resultado

A página `/management/settings` permite ao proprietário criar uma instância por unidade ativa, com nome e status inicial `PENDING` (aguardando primeira configuração). A criação é local; abrir o gerenciamento inicia a conexão no WAHA e permite obter o QR code, atualizar o status e desconectar. A atualização é explícita, sem consultas periódicas. O QR fica somente em memória na interface.

Os destinatários são configurados por conta, com até cinco números normalizados e distintos. O limite é validado no servidor e centralizado para futura integração com planos. Instâncias, destinatários e regras de alerta são exclusivos de `OWNER`; cada ação autentica e verifica a organização novamente. A interface não recebe a chave do WAHA nem identificadores remotos de sessão.

O envio usa a sessão `WORKING` da unidade da tarefa ou execução e os destinatários da mesma organização. Sem unidade ativa, instância conectada ou destinatários, não há envio. Não há fallback para a sessão de outra unidade. Os filtros existentes de eventos, prioridade, marco e horário continuam sendo aplicados; esta entrega não adiciona um agendador de repetição.

## Configuração e publicação

- Credenciais canônicas: `WAHA_BASE_URL` e `WAHA_KEY`, somente no servidor; aliases anteriores continuam aceitos.
- A consulta autenticada de leitura ao servidor configurado retornou HTTP 200. Não foram criadas sessões reais nem enviadas mensagens reais durante a validação.
- Aplicar `prisma/migrations/20261028210000_whatsapp_instances/migration.sql` antes de publicar o backend. Na validação inicial, a migração foi aplicada apenas ao PostgreSQL descartável dos testes. Após o relato de tabelas/coluna ausentes, as migrações `20261028190000_push_session_binding` e `20261028210000_whatsapp_instances` foram aplicadas ao banco configurado no `.env` com `prisma migrate deploy`. O status confirmou schema atualizado; consultas de metadados e projeções sem registros confirmaram as duas tabelas, `session_id` e sua chave estrangeira. Um destinatário individual legado válido é preservado na migração.
- A instalação WAHA precisa suportar as sessões nomeadas usadas pelas unidades. Autenticar a API não comprova a licença/capacidade para criar várias sessões.
- Após publicar, o proprietário deve criar a instância, abrir seu gerenciamento, escanear o QR code e atualizar o status até confirmar `Conectada`.

As rotas e o formato base64 do QR seguem a [documentação oficial de sessões do WAHA](https://waha.devlike.pro/docs/how-to/sessions/).

## Verificação

- `node scripts/test-database-efficiency.cjs --whatsapp-only`: geração Prisma, TypeScript, testes de ações/envio e comparação do schema aprovados em PostgreSQL 18 descartável (`127.0.0.1:56433`). Inclui bloqueio de administradores, isolamento de unidade/conta, criação pendente sem chamada remota, limite e duplicatas de destinatários, QR, desconexão, auditoria e envio simulado aos cinco números pela sessão correta.
- `node scripts/test-database-efficiency.cjs --build --webpack`: tipos e build aprovados.
- Interface exercitada com componentes reais e transporte simulado em 1200 px e 390 px: criação, cartão pendente, modal de QR e limite de destinatários aprovados. O pareamento real ainda depende do celular do proprietário.
- Snapshot do backend sincronizado na direção site → app: 208 arquivos conferidos; workflow e tipos aprovados, 322 testes do aplicativo aprovados.
- Nenhum teste usou o banco de produção ou realizou envio real pelo WAHA.
