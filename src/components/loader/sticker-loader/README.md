# Loader adesivo Tarefaí

Componente React com SVG transparente, sem imagens externas ou bibliotecas de animação.
O T e o ponto usam os contornos vetoriais da marca, preenchidos com o verde do fundo da referência.

O adesivo começa curvado, encosta pela borda esquerda e cola da esquerda para a direita em 660 ms.
Permanece inteiro por 150 ms, descola da direita para a esquerda em 660 ms e reinicia após 30 ms.
O ciclo completo dura **1,5 segundo**. O verso também é verde e acompanha a mesma dobra, inclusive no ponto.

Abra `preview.html` no navegador para ver o componente em fundos claro e escuro,
com tamanhos de 24 a 280 px. A prévia é independente e funciona sem internet.

```tsx
import { TarefaiStickerLoader } from "@/components/loader/sticker-loader";

<TarefaiStickerLoader size={96} />

// Dentro de um botão:
<TarefaiStickerLoader size={24} label="Salvando" />

// Mais rápido: duração do ciclo completo, limitada a 1.500 ms.
<TarefaiStickerLoader size={128} durationMs={800} />

// Cola uma vez e mantém o ícone inteiro visível.
<TarefaiStickerLoader size={96} loop={false} />
```

Para levar a outro projeto React, copie `sticker-loader.tsx` e `sticker-loader.module.css`
para a mesma pasta e importe o componente diretamente de `./sticker-loader`.
O projeto precisa aceitar CSS Modules, como Next.js e Vite.

Também aceita `className`, `style` e `label`. O tamanho pode ser um número em pixels ou
uma medida CSS, como `"4rem"`. O componente não desenha uma caixa ou fundo.

A preferência por movimento reduzido exibe a marca estática e interrompe a animação.
A animação pausa fora da tela e quando a aba está oculta; todos os observadores e
quadros pendentes são removidos ao desmontar. Cada instância tem identificadores SVG próprios.

Integrado aos carregamentos de rotas, abertura do site, painéis, botões, formulários
e toasts por meio de `LogoLoader` e `Spinner`. A versão React Native está em
`marcai-emp-app/src/ui/sticker-loader.tsx` e usa a mesma geometria e ciclo.
