# Carregamentos com o adesivo Tarefaí

Integração de 19/10/2026 nos projetos `marcai` e `marcai-emp-app`.
O T e o ponto são verdes e transparentes, colam da esquerda para a direita e
descolam no sentido inverso. O ciclo completo permanece em 1.500 ms.

## Site

- `src/components/loader/sticker-loader`: arte e animação SVG.
- `LogoLoader`, `LoadingLogo` e `LogoLoaderPage` mantêm as importações existentes
  e renderizam o novo adesivo. A arte anterior e a sua prévia foram removidas.
- `AppReloadLoader`: abertura/recarregamento do site, com limpeza dos dois timers.
- `src/app/loading.tsx` e os grupos auth, employee, management e superadmin:
  carregamentos de rotas. A navegação e a autorização continuam nos layouts existentes.
- `Spinner`: botões, formulários, pesquisa e demais ações assíncronas compartilhadas.
  Preserva `data-slot="spinner"`, atributos acessíveis e as classes de tamanho.
- Toasts de espera e ícones antigos de ativação de push, conclusão rápida e
  autenticação de dois fatores usam o mesmo `Spinner`.
- Uma regra restrita a `data-platform-loading` permite exibir o SVG interno do
  adesivo enquanto os ícones normais do botão ficam ocultos durante a operação.

Placeholders de texto preservam o espaço do conteúdo enquanto o novo loader
identifica a espera. A preferência por movimento reduzido mantém a marca estática.

## Aplicativo

`marcai-emp-app/src/ui/sticker-loader.tsx` implementa a mesma geometria com
`react-native-svg`, já instalado no app. Não usa DOM, WebView ou bibliotecas novas.
Atualiza os caminhos diretamente, pausa em segundo plano e respeita movimento reduzido.

`Loading`, `Button` e os toasts cobrem telas, consultas, buscas, organização,
detalhes de tarefas/processos, arquivos, paginação e operações. Os cabeçalhos de
atualização de tarefas, histórico e avisos exibem o adesivo; os controles nativos
continuam responsáveis pelo gesto de puxar para atualizar.

A abertura usa `assets/splash-sticker.png` sobre `#F6F8F6` na tela inicial nativa.
Assim que o primeiro layout React está disponível, `AppSplash` oculta a tela
nativa e apresenta a animação. Aguarda a preparação da sessão e um ciclo de
1,5 segundo; com movimento reduzido, dispensa a espera do ciclo.

A imagem que o sistema operacional apresenta antes de carregar o React é
estática. A animação acontece na sequência, na splash React. Alterações de imagem
e configuração da splash nativa exigem um novo binário do app; uma atualização
somente de JavaScript não substitui essa configuração.

## Validação

- TypeScript nos dois projetos e build de produção do site.
- Auditoria visual do superadmin em 1440, 1024, 768, 390 e 320 px.
- Testes de operações assíncronas do superadmin com mutações interceptadas,
  incluindo visibilidade do SVG dentro do spinner; sem escritas reais no banco.
- 51 testes de interface nativa, login e avisos, além de 5 testes do adesivo:
  duração, sentido, contornos, pausa/limpeza e botão acessível durante a espera.
- Revisão dos componentes React Native reais via React Native Web em 320, 390 e
  1024 px, incluindo passagem da splash para a sessão pronta e movimento reduzido.
- Exportação dos bundles Android e iOS com Expo e sincronização dos recursos Android.

Não houve ensaio em aparelho físico. Exportar o bundle e revisar componentes no
navegador não substitui validar a abertura em uma instalação de release.
