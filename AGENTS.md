<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Contrato de consultas, cache e tempo real

Antes de alterar acesso ao banco, APIs, Server Actions, notificações, cache, foco ou reconexão, leia [docs/database-access-architecture.md](docs/database-access-architecture.md) e [docs/database-cost-controls.md](docs/database-cost-controls.md). Preserve autorização por requisição, escopos e idempotência. Use invalidação por família e DTOs das mutações; não reintroduza polling, replay por evento saudável ou refresh global indiscriminado. O backend deste repositório é canônico: atualize o snapshot do app apenas na direção site → app. Mantenha documentação e testes de custo atualizados.

## Contrato de interface do superadmin

Antes de alterar ou criar telas, componentes, formulários ou estilos da área `/superadmin`, leia e siga integralmente `docs/SUPERADMIN_LAYOUT.md`.

Reutilize os componentes de `src/presentation/components/superadmin/superadmin-ui.tsx` e os estilos isolados de plataforma. Não duplique a navegação principal, não reintroduza cartões altos por registro e não altere o design das áreas de gestão ou colaboradores por efeito colateral. Preserve ações, permissões, filtros e auditoria. Execute o checklist do documento, incluindo revisão visual em desktop e mobile, antes de finalizar.
