# Revisão de login por dispositivo — 31/10/2026

O login pelo navegador criava uma linha em `web_auth_sessions` sem revogar outras sessões da mesma conta. O controle anterior estava somente em `mobile_sessions`, com exceção para superadmin. Não existia comando Ably de encerramento consumido pelo navegador. Portanto, os dois cookies continuavam autorizados; não era apenas uma tela desatualizada.

A correção substitui sessões web na mesma transação do novo login e serializa pela linha da conta. Isso também cobre dois primeiros logins simultâneos, que não podem ser protegidos apenas pelo lock das sessões anteriores. Após commit, um evento privado por sessão encerra o transporte antigo e navega para o login com o aviso. O canal usa a conexão Ably existente. Abas compartilham somente o controle de revogação, em um contexto que inclui a sessão. Retomada, reconexão e a confirmação da assinatura revalidam autorização, sem polling novo.

A regra web inclui superadmin. Navegador e app nativo preservam ciclos independentes: uma sessão web não revoga uma sessão nativa. O controle nativo também passa pelo lock transacional; notificações/push de desconexão deixaram de ser disparados dentro da transação. Clientes nativos instalados continuam consumindo o push e a validação de acesso/refresh; o novo canal por sessão requer suporte do cliente nativo para recebimento direto.

Validação concluída:

- TypeScript e build de produção com webpack: aprovados.
- Suíte geral em PostgreSQL 18 descartável, incluindo eficiência, sessões, push, WhatsApp e comparação do schema: aprovada.
- Sessões: troca 1 → 2 → 1, concorrência sem sessão prévia, rollback, isolamento, remoção de push e validação com uma query: aprovados.
- Fontes reais do hook e transporte: escopo do token, canal privado, compartilhamento entre abas, desconexão, recuperação e ausência de polling: aprovados.
- Chromium com dois contextos isolados e duas abas de sessão antiga: ambas desconectam com aviso, a sessão nova permanece. Aviso revisado em 1440/1024/768/390px.
- Snapshot do app atualizado somente na direção site → app; `workflow:check`, tipos e 325 testes do app aprovados.
- `git diff --check`: aprovado.

As fixtures de push que precisavam representar sessões legadas simultâneas agora inserem essas linhas diretamente. O executor de banco também passou a preparar a migração de alertas WhatsApp já existente, que faltava no banco descartável.

Todos os testes usaram dados sintéticos e transportes externos simulados, sem banco nem credenciais de produção. A entrega real do Ably em produção depende da publicação e da configuração da hospedagem. Não foi feito deploy. Após publicar, reabrir os navegadores para carregar o cliente atualizado e conferir a troca nos dois sentidos. Não há migração nova de produção nesta correção.
