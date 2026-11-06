# Adaptação do último commit mobile para o web

Referência congelada: `marcai-emp-app@210a9f3beda262fd3b9bde29de4b297c8f0cb0eb`, merge de 04/11/2026. Recorte: diff contra o primeiro pai `d1af652ec8b1acce784fef603612bca88e210e08`. O commit do primeiro pai altera somente metadados de exportação. Base web: `da1a6e48a93db3cb73b2eba7c0817fcd8234399d`.

## Plano e rastreabilidade

| Alteração mobile incorporada pelo merge | Adaptação web |
| --- | --- |
| `6d92cbd`: avisos compactos, duas linhas de título/mensagem, hora/ontem/data, ponto não lido e dupla confirmação verde | Central do colaborador com cartão clicável, mesmos estados, filtros de largura inteira e ação discreta de leitura em lote; preservar paginação e autorização |
| `ad16406`, `9f42508`: estado dos avisos claro, permissão/registro resumidos, teste e preferências, retorno só com seta | Tela autenticada de estado das notificações; textos adaptados às permissões do navegador; teste limitado à própria sessão |
| `57a6e59`, `ffe2378`, `fbedb9f`: períodos distribuídos e opção selecionada verde; opções repetidas não colidem | Seletores do colaborador e login, além da opção selecionada do filtro de tipo no quadro, sem modificar os componentes globais ou superadmin |
| `ff990cb`, `0f4055e`: placeholder sem pergunta repetida, notas de 1 a 5 ocupando toda a largura | Formulário compartilhado entre página e drawer, com rótulos acessíveis, booleanos e escolhas verdes |
| `0fdf049`, `9e6b182`: galeria em grade de 96 px e visualizador escuro com fotos/vídeos, estados, motivo, contador, navegação e zoom | Mesmo componente para comprovações e respostas; miniaturas de 288 px e imagem de até 1600 px; vídeo só carrega ao abrir; arquivos locais com URLs temporárias e descarte |
| `937a18b`, `656d9d8`: mapa de localização com precisão e atalho externo | MapLibre GL JS, estilo Liberty/OpenFreeMap, 160 px, marcador verde, círculo de precisão, zoom de 12 a 18 e atribuição preservada |
| `4954457`: histórico como linha do tempo, segundos e expansão | Três eventos iniciais, ponto mais recente verde, nomes traduzidos, fuso da tarefa e “Ver tudo”/“Ver menos” nos dois detalhes |
| `8b9154d`, `ceff5f5`: impedimento em folha inferior e botão com contorno/ícone vermelho | Mesmos quatro motivos com ícones, aviso de encerramento, texto de 3–1000 caracteres, cancelar, erro local e bloqueio durante envio |
| `405217c`: origem `tarefai.com` e compatibilidade com links anteriores | Atualizar origem pública padrão do web; preservar emissores JWT e identificadores de credenciais existentes |
| Configuração EAS, criptografia App Store, dependências React Native, cache criptografado e compartilhamento nativo | Exclusivos do binário mobile; equivalentes web usam APIs de navegador e rotas autenticadas existentes |

## Limites e validação

Backend canônico permanece no web. Não copiar `backend-overlay` para o site. Mutações mantêm autorização, rodada, recibos e DTOs existentes. Nenhum polling ou refresh global novo. Dados e capturas de teste devem ser sintéticos, em ambiente isolado.

## Implementação concluída

Os componentes novos estão em `src/presentation/components/mobile/`: `employee-segments`, `employee-filters`, `employee-task-form`, `employee-notice-list`, `notification-status`, `media-gallery`, `location-card`, `task-timeline` e `impediment-sheet`. Página e drawer da tarefa usam os mesmos componentes. Os estilos ficam isolados em `src/app/employee-updates.css`; a extensão opcional de backdrop no Sheet não modifica seus consumidores existentes.

O domínio público padrão passou a `https://tarefai.com` nos metadados, sitemap, robots, requisições internas de tarefas e links de push. WebAuthn permite também a origem antiga quando explicitamente configurada. Passkeys continuam vinculadas ao RP de seu domínio de cadastro; credenciais existentes não são convertidas entre domínios. Os emissores JWT existentes permanecem intactos.

O backend mobile foi atualizado somente por `--refresh-from-source`, na direção canônica web → snapshot: 229 arquivos verificados. O checkout tinha diferenças de fim de linha que impediam a verificação dos hashes; os bytes foram restaurados ao hash já registrado antes do refresh, sem alterar o conteúdo lógico. A fixture SQL de testes recebeu o mesmo tratamento, conferindo o hash de proveniência existente. Nenhuma migração foi executada fora do banco descartável de testes.

Os testes antigos do app foram ajustados para inspecionar o formulário compartilhado, os cartões compactos e a regra já existente de uma única sessão entre web/mobile. Não houve alteração de código nativo do app.

## Resultados

| Verificação | Resultado |
| --- | --- |
| TypeScript web | Aprovado |
| TypeScript mobile com dependências do lockfile instalado | Aprovado |
| Suíte mobile completa, execução sequencial | 325 testes aprovados, zero falhas |
| Revalidação direcionada da área do colaborador | 44 testes aprovados, incluindo o cartão de aviso de processo |
| `npm run workflow:check` | Regras e 229 arquivos do snapshot conferem |
| `npm run test:mobile-web:contracts` | Quatro grupos aprovados: sessão/limite de teste push, entrega restrita sem ler instalações nativas, rodada anterior sem query adicional e anexos autorizados/legados |
| `npm run test:mobile-web:ui` | Dez grupos aprovados; login real, vídeo MP4 sintético, zoom, navegação, cancelamento de download ao trocar contexto, impedimento com erro e bloqueio durante envio, mapa com marcador centralizado, avisos e foco sem novo registro |
| Revisão visual | Capturas em 320, 390 e 1440 px; sem overflow ou erros de execução |
| `node scripts/test-database-efficiency.cjs` | Suíte completa aprovada: domínio, operacional, workflows, histórico, custo, agenda seletiva, sessões, push, WhatsApp e schema |
| Build de produção isolado (`--build --webpack`) | Aprovado na versão final; worker MapLibre emitido como módulo independente no pacote de produção |

Capturas e relatório de navegador ficam em `tmp/mobile-web-parity/`; os logs do banco/build ficam em `tmp/database-efficiency/`. Esses diretórios são ignorados pelo Git. A verificação de navegador requer Chrome e FFmpeg disponíveis no ambiente. Usa ações simuladas e arquivos sintéticos; tiles públicos do OpenFreeMap são carregados sem credenciais. A entrega real de push e o comportamento em aparelhos físicos dependem da publicação e da configuração de permissões do dispositivo.

Referências de integração: [MapLibre/Next.js e configuração do worker](https://maplibre.org/maplibre-gl-js/docs/), [estilo Liberty do OpenFreeMap](https://openfreemap.org/quick_start/), [miniaturas de vídeo Cloudinary](https://cloudinary.com/documentation/video_manipulation_and_delivery#generating_video_thumbnails).
