# Loader compartilhado

`LogoLoader`, `LoadingLogo`, `LogoLoaderPage` e `AppReloadLoader` usam o novo
`TarefaiStickerLoader`: T e ponto verdes, fundo transparente, colagem da esquerda
para a direita e descolagem no sentido inverso, em um ciclo de 1,5 segundo.

As importações existentes continuam funcionando. A antiga arte de traçado e gota
foi removida. Botões, toasts e operações usam a mesma animação pelo `Spinner`.

Veja as propriedades e a prévia em `../sticker-loader/README.md`.
