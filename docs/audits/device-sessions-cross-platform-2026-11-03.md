# Revisão de login por dispositivo cross-platform (web e mobile) — 03/11/2026

## Contexto

Na implementação inicial de 31/10/2026, a restrição de sessão única por conta separava os ciclos de vida por plataforma (`web` em `web_auth_sessions` e `native` em `mobile_sessions`). Cada login revogava apenas as sessões anteriores da sua respectiva plataforma. Como consequência, uma conta podia manter um celular conectado no aplicativo móvel (`marcai-emp-app`) e um computador no navegador web simultaneamente, violando a regra de negócio de estritamente um dispositivo ativo por conta.

## Correção Implementada

1. **Revogação unificada no banco**:
   Em `src/infrastructure/security/device-sessions.ts`, a função `replaceDeviceSessions` agora revoga incondicionalmente tanto em `web_auth_sessions` quanto em `mobile_sessions` para o `user.id`, dentro da mesma transação `deviceLoginTransaction`.
2. **Serialização transacional**:
   A proteção de concorrência com `lockDeviceLogin(tx, user.id)` serializa qualquer tentativa de login concorrente, seja ela originada no browser (Next.js auth) ou no aplicativo móvel (`src/application/mobile/security.ts:issue`).
3. **Disparo duplo de desconexão**:
   - Para sessões web revogadas: publicação Ably `session:revoked` no canal privado `user:${userId}:session:${sessionId}`, provocando o encerramento dos transportes e o redirecionamento com aviso no navegador (`/login?reason=session-replaced`).
   - Para sessões mobile revogadas: envio de push FCM com `type: "SESSION_REVOKED"` para os tokens de instalação nativos ativos, além da rejeição imediata com HTTP 401 `SESSION_REVOKED` nas próximas requisições e refreshes de token.
4. **Alinhamento do backend canônico e snapshot**:
   O backend em `marcai` permanece canônico. O snapshot verificado em `marcai-emp-app` foi sincronizado e validado via `sync-employee-backend.mjs`.

## Validação Concluída

- `scripts/verify-device-sessions.cjs`:
  - 8 verificações unitárias cobrindo revogação cross-platform, despacho de ambos os transportes (Ably e FCM), isolamento de canais por sessão e sem polling.
- `scripts/verify-device-sessions-database.ts`:
  - Teste de banco em PostgreSQL 18 descartável:
    - Login nativo revoga sessão browser ativa (`decryptSession` retorna `null`).
    - Login browser revoga sessão nativa ativa (requisição mobile e refresh de token falham com `SESSION_REVOKED`).
    - Logins simultâneos cross-platform deixam estritamente 1 credencial ativa.
- `scripts/verify-device-sessions-browser.cjs`:
  - Teste em Chromium com múltiplos contextos isolados e aviso responsivo em 1440/1024/768/390px.
- Suíte geral de eficiência de banco (`scripts/test-database-efficiency.cjs`):
  - Todas as 13 suítes aprovadas.
- Sincronização de snapshot em `marcai-emp-app`:
  - 218 arquivos idênticos ao canônico (`--refresh-from-source`).
