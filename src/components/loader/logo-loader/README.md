# Animação da logo — 1 segundo

Composição Remotion `LogoLoader`: **60 frames, 60 fps, 737 × 737, fundo transparente, sem áudio**.

- Início totalmente vazio.
- O desenho nasce na ponta inferior esquerda, sobe pela curva, preenche a haste central e segue até a perna direita.
- A partir de 0,65 s, a gota se forma ligada à perna, escorre, afina a conexão e se solta.
- Aos 0,94 s, o desenho já está em sua forma final. Permanece até o fim de 1 s.
- O quadro final usa o próprio SVG fornecido, incluindo o elemento oval presente na gota.

## Abrir a prévia

Abra `Previa_Logo_Loader.html` em um navegador. O arquivo é independente, funciona sem internet e contém um Player do Remotion com repetição, controle de reprodução e câmera lenta.

## Editar no Remotion

Requisitos: Node.js 22 ou superior.

```bash
npm ci
npm start
```

Abra o endereço exibido e selecione `LogoLoader`.

O arquivo `src/Root.tsx` registra a composição. `src/LogoArtwork.tsx` controla o traçado, a conexão e a queda. `public/logo-original.svg` preserva o anexo original. `src/logo-data.ts` contém a mesma imagem incorporada, para permitir o uso sem dependência de um caminho público.

## Integrar em React / Next.js

O componente `src/LoadingLogo.tsx` usa a mesma arte, executa uma vez em 1 segundo e permanece no estado final. Repetição é opcional. Respeita a preferência por movimento reduzido.

Copie `LoadingLogo.tsx`, `LogoArtwork.tsx` e `logo-data.ts` para a mesma pasta de componentes. Instale `remotion@4.0.532` se necessário. Use:

```tsx
import {LoadingLogo} from './LoadingLogo';

<LoadingLogo size={96} />
// Repetir durante o carregamento:
<LoadingLogo size={96} loop />
```

## Exportação opcional

Para MP4, sem transparência:

```bash
npx remotion render src/index.ts LogoLoader logo-loader.mp4
```

A composição e a prévia foram entregues editáveis; não é necessário exportar vídeo para usar `LoadingLogo` na interface.
