# Especificação de Arquitetura e Design: Gestão Operacional (SaaS B2B)

**Data de Validação:** 23 de Setembro de 2026  
**Status:** Validado e Aprovado via Processo de Brainstorming  
**Versão:** 1.1.0 (MVP v1, revisão responsiva de UX/UI)

---

## 1. Resumo de Entendimento (Understanding Summary)
* **Objetivo do Produto:** Plataforma SaaS B2B de Gestão e Execução Operacional concebida para responder em tempo real: *“O que está acontecendo na minha operação agora e o que deveria ter acontecido?”*.
* **Público-Alvo e Papéis:**
  * `SUPERADMIN`: Gestão global da plataforma em área isolada (sem acesso operacional automático às organizações).
  * `OWNER`: Controle integral da própria organização.
  * `ADMIN`: Administração operacional e parametrizações globais da empresa.
  * `MANAGER`: Gestão operacional estritamente restrita ao seu escopo de unidades e equipes autorizadas.
  * `EMPLOYEE`: Execução mobile-first focada em "Minhas tarefas", sem sobrecarga gerencial.
* **Restrições Centrais:**
  * Isolamento multi-tenant rígido no backend (`where: { organizationId }` obrigatório).
  * Mobile-first: conteúdo responsivo, alvos de toque >= 44px, safe areas e baixa densidade. Desktop com sidebar lateral a partir de 1024px e grades por contexto.
  * Identidade visual atual: `--brand-900: #164d36`, `--brand-700: #247b56`, superfícies `#ffffff` e `#f5f6f5`, conforme a referência fornecida e `docs/design-system.md`.
  * WCAG 2.2 AA (contraste mínimo de 4.5:1 para texto normal e 3:1 para controles).
  * Auditoria append-only via `ActivityLog`.
* **Não-Objetivos Explícitos (Non-Goals):**
  * Sem score geral de produtividade, gamificação ou pódio de funcionários/equipes.
  * Sem feed social ou chat interno no MVP.
  * Sem IA/LLM ou automação de feriados no MVP.
  * Sem edição livre de perfil cadastral pelo funcionário.
  * Sem dark mode como padrão.

---

## 2. Premissas e Assunções (Assumptions)
1. **Infraestrutura de Banco:** PostgreSQL conectado via `DATABASE_URL` no `.env` (instância de nuvem como Neon, Supabase ou Railway) utilizando Prisma ORM com migrations versionadas.
2. **Entrada Simplificada por PIN:** Identificação inequívoca por `organizationSlug` + `employeeCode` + PIN numérico de 6 dígitos com hashing seguro e proteção contra força bruta.
3. **Tratamento de Rotina Pendente (`pendingPreviousPolicy`):** Suporte aos 3 modos configuráveis: `CREATE_NEW`, `SKIP_IF_PENDING` e `BLOCK_NEW`.
4. **Evidência após 3 Falhas:** O funcionário pode prosseguir e concluir a tarefa, gerando automaticamente uma ocorrência crítica (`TaskOccurrence`) e notificação push imediata aos gestores.
5. **Cálculo de Escopo do Gestor:** Interseção estrita (`AND`) entre as equipes e unidades atribuídas ao `MANAGER`.

---

## 3. Registro de Decisões (Decision Log)

| ID | Tema | Decisão Aprovada | Alternativas Consideradas | Justificativa |
|---|---|---|---|---|
| **D-01** | Banco de Dados | PostgreSQL gerenciado em nuvem via `.env` com Prisma ORM | Instalação local Windows / SQLite em dev | Garante paridade imediata com o ambiente de produção e conformidade com a Seção 11. |
| **D-02** | Arquitetura | Monólito Modular Limpo no Next.js 16 (App Router + RSC + Server Actions) | Microsserviços / Backend separado Fastify | Evita complexidade operacional prematura e mantém separação estrita de Domínio, Aplicação e Infraestrutura. |
| **D-03** | Acesso por PIN | Slug da Organização + Matrícula (`employeeCode`) + PIN de 6 dígitos | Apenas PIN / E-mail corporativo + PIN | Garante desambiguação completa de empresa e funcionário sem expor diretório corporativo. |
| **D-04** | Rotina Pendente | Enum com 3 políticas: `CREATE_NEW`, `SKIP_IF_PENDING` e `BLOCK_NEW` | Sempre criar novo / Encerrar o anterior | Flexibilidade operacional configurável por processo conforme o padrão da empresa. |
| **D-05** | Falha de Evidência | Permite conclusão após 3 falhas com geração de `TaskOccurrence` crítica e push | Bloquear tarefa / Exigir dispensa prévia de gestor | Mantém a fluidez da operação física em campo sem mascarar a falha de conformidade. |
| **D-06** | Escopo MANAGER | Interseção estrita (`AND`) entre unidades e equipes | União (`OR`) / Modo configurável | Elimina o risco de vazamento cruzado de dados entre unidades não autorizadas. |
| **D-07** | UX & Shells | Shells dedicados por papel (Funcionário com 4 abas e sem botão "+"; Gestão com 5 abas) | Shell único responsivo com itens escondidos | Garante foco do trabalhador e previne tentativas acidentais de ações desautorizadas. |
| **D-08** | Validação Inicial | Primeira entrega vertical funcional completa (Login → Tarefa → Evidência → Conclusão auditada) | Implementação horizontal por camadas | Comprova a robustez da arquitetura, autorização e fidelidade visual antes da expansão de módulos. |

---

## 4. Arquitetura Detalhada

### 4.1 Estrutura de Pastas e Módulos
```
src/
├── app/                      # Rotas e páginas Next.js App Router (RSC)
│   ├── (auth)/               # Login, PIN, recuperação e seleção de organização
│   ├── (employee)/           # Shell e rotas do funcionário (Minhas tarefas, Detalhe, Histórico, Conta)
│   ├── (management)/         # Shell da gestão (Visão geral, Tarefas, Processos, Unidades, Equipes)
│   ├── (superadmin)/         # Área administrativa isolada da plataforma
│   └── globals.css           # Tokens CSS obrigatórios da paleta e Tailwind v4
├── domain/                   # Camada de Domínio Pura (zero dependência externa)
│   ├── entities/             # Entidades ricas e tipos
│   ├── rules/                # Invariantes de estado, cálculo de SLA e matriz de escopo
│   └── events/               # Definições de eventos de domínio
├── application/              # Casos de Uso (Use Cases) e Orquestração
│   ├── use-cases/            # StartTask, SubmitEvidence, CompleteTask, SwitchOrganization, etc.
│   └── security/             # Pipeline de autorização server-side
├── infrastructure/           # Persistência e Integrações
│   ├── database/             # Prisma Client singleton
│   ├── repositories/         # Implementações concretas de acesso a dados
│   ├── security/             # Hashing Argon2id/bcrypt, cookies e tokens de sessão
│   └── outbox/               # Despacho transacional de eventos
├── presentation/             # Componentes de UI e Server Actions
│   ├── actions/              # Server Actions seguras validadas com Zod
│   ├── components/
│   │   ├── mobile/           # Shells responsivos, cards compactos, bottom sheets
│   │   └── ui/               # Componentes shadcn/ui estilizados com os tokens
└── lib/                      # Utilitários globais (cn, formatação de datas com timezone)
```

### 4.2 Pipeline de Execução Segura (Server-Side Pipeline)
Toda requisição/mutação segue os 9 passos da Seção 13.1:
1. `auth()`: Validação da sessão criptografada em cookie HttpOnly.
2. `resolveActiveOrganization()`: Resolução da organização ativa via servidor.
3. `validateMembership()`: Checagem do `OrganizationMember` e status ativo.
4. `resolveOperationalScope()`: Interseção estrita `AND` de Unidades e Equipes.
5. `authorizeAction()`: Avaliação contra a matriz (Recurso × Ação × Papel × Escopo).
6. `validateInput()`: Schema Zod estrito com rejeição de campos desconhecidos.
7. `executeUseCase()`: Transação atômica no PostgreSQL com concorrência protegida.
8. `auditLog()`: Registro append-only em `ActivityLog`.
9. `publishEvents()`: Registro de evento em Outbox pós-commit.

---

## 5. Roteiro de Execução da Etapa 1 e 2
1. **Configuração da Fundação Técnica:**
   * Dependências: `@prisma/client`, `prisma`, `zod`, `bcryptjs` (ou `argon2`).
   * Configuração de variáveis de ambiente (`.env.example`).
   * Centralização dos tokens visuais CSS no `src/app/globals.css`.
2. **Modelagem Físico-Relacional (`prisma/schema.prisma`):**
   * Modelos do baseline com chaves estrangeiras, `UNIQUE(organizationId, userId)` e índices de performance.
   * Criação do seed com 2 organizações completamente isoladas, unidades, equipes, tarefas em múltiplos estados e usuários de teste.
3. **Caminho Vertical Funcional:**
   * Autenticação e tela de seleção de organização ativa.
   * Interface mobile de "Minhas tarefas" com filtros de tempo.
   * Detalhe da tarefa: Início explícito → Validação de evidência → Conclusão auditada.
   * Visão geral de gestão com indicadores reais do recorte.
