# Design system — Marcai

Atualização de UX/UI: setembro de 2026. Esta versão substitui a antiga identidade azul e o layout desktop com navegação no topo. A referência visual fornecida pelo usuário é a base: sidebar clara, cartões brancos sobre cinza suave, verde profundo e hierarquia discreta.

## Paleta

| Uso                    | Valor     |
| ---------------------- | --------- |
| Verde profundo / marca | `#164d36` |
| Verde de ação          | `#247b56` |
| Verde de apoio         | `#62b894` |
| Fundo dos painéis      | `#f5f6f5` |
| Superfície             | `#ffffff` |
| Fundo externo desktop  | `#e9ece9` |
| Texto principal        | `#1c2420` |
| Texto secundário       | `#58665e` |
| Bordas                 | `#e7ece8` |

Cores âmbar e vermelho ficam reservadas a avisos e erros. Um único cartão principal recebe destaque verde. Os tokens e aliases são definidos em `src/app/globals.css`; a composição responsiva está em `src/app/workspace.css`.

## Estrutura responsiva

- Mobile primeiro: conteúdo com margens de 18px, navegação inferior por papel, safe area, ações de pelo menos 44px e formulários legíveis sem zoom forçado.
- Desktop a partir de 1024px: moldura branca, sidebar de 210–220px, topbar com busca e organização, conteúdo flexível. Limite externo de 1600px.
- Dashboard: quatro indicadores; atividade, pendências e tarefas; equipes e progresso. Os gráficos usam os dados reais do recorte, sem valores ilustrativos.
- Superadmin: visão geral, organizações e auditoria; tabela no desktop e cartões no mobile. Não oferece acesso automático a uma organização.
- Tarefas: tabela no desktop, cartões no mobile e quadro kanban com rolagem própria.
- Formulários: uma coluna no celular; distribuição por seção em telas amplas. Janelas modais limitadas à altura da viewport, com rolagem, foco controlado e Escape.

## Tipografia e componentes

A família da aplicação é **Geist Sans variável**, incluída localmente em `src/app/fonts` e carregada com `next/font/local`. O arquivo fornece pesos reais de 100 a 900; a interface utiliza 500–800 e não depende de downloads do Google Fonts. A licença acompanha a fonte.

| Papel                                   | Tamanho             | Peso    | Entrelinha |
| --------------------------------------- | ------------------- | ------- | ---------- |
| Título da página                        | 30–40px, responsivo | 800     | 1,15       |
| Título de seção                         | 22px                | 700     | 1,3        |
| Título de cartão                        | 18px                | 700     | 1,35       |
| Indicador numérico                      | 34–44px, responsivo | 800     | 1,1        |
| Texto comum                             | 15px                | 500     | 1,6        |
| Rótulos e ações                         | 14–15px             | 600     | 1,45–1,5   |
| Texto de apoio                          | 13px                | 500     | 1,5        |
| Legendas de gráficos e navegação mobile | 12px                | 500–600 | 1,45       |
| Campos no mobile                        | 16px                | 500     | 1,5        |

Os tokens `--type-*` e `--weight-*` em `globals.css` são a fonte de verdade. Use `text-[length:var(--type-body)]` (ou o token correspondente) nos componentes: a indicação `length:` evita que o utilitário `cn` confunda tamanho com cor de texto. Títulos têm espaçamento entre letras levemente negativo; parágrafos mantêm espaçamento natural. Números de indicadores usam algarismos tabulares. Não reduza textos essenciais abaixo de 13px para fazê-los caber: permita quebra de linha ou ajuste a composição.

As regras abrangem autenticação, seleção de organização, área do colaborador, gestão e superadmin, além de formulários, tabelas, filtros, menus, modais, erros e estados vazios. Cartões mantêm raio de 18px e botões primários arredondados.

### Escrita da interface

Use português claro e capitalização de frase: “Criar tarefa”, “Salvar alterações”, “Permissão de acesso”. Prefira instruções curtas, verbos concretos e descrições que expliquem a próxima ação. Reserve termos técnicos para campos que realmente precisam deles. Preserve avisos de exclusão definitiva e descreva o comportamento real de cada ação. Nomes, títulos e conteúdos cadastrados pelo usuário não são reescritos.

Componentes compartilhados em `src/presentation/components/shared`:

- `AppShell`: navegação e contexto por papel; `ManagementShell` e `EmployeeShell` são adaptadores.
- `PageHeader`: título responsivo, descrição e ações que quebram linha sem truncar o título.
- `Modal`: composto com o Dialog do shadcn/ui, com foco, backdrop, Escape e conteúdo rolável limitado à altura da tela.
- `FilterSheet`: filtros com aplicar/limpar; painel inferior no mobile e janela central no desktop.
- `Brand`, `Card`, `StatusBadge`, `PriorityBadge`, `SegmentedControl`, `EmptyState`.

A busca global encontra páginas e encaminha buscas textuais à central de tarefas. Atalho: Ctrl/Cmd+K. Estados ativos usam `aria-current` ou `aria-pressed`; formulários têm nomes acessíveis; animações respeitam movimento reduzido; zoom do navegador é permitido.

## Cuidados para futuras telas

Use a mesma estrutura e os tokens sem introduzir uma nova paleta. Preserve permissões e escopo no servidor. Separe informação primária, contexto e ações. Mostre estados vazios, erros e carregamento. Valide 390px, 768px, 1024px e 1440px, incluindo títulos longos, formulários e filtros. Ao imprimir relatórios, o shell de navegação não deve aparecer.
