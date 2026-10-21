# Auditoria do mapa do superadmin

## Causas encontradas e correções

- O CSS obrigatório do Leaflet não era carregado. As imagens dos mapas ficavam fora de posição, como na captura enviada. O componente agora importa o CSS, acompanha o tamanho do contêiner e mantém o enquadramento das unidades ao mudar de largura.
- O resolvedor de endereço simulava precisão: usava pontos fixos de avenidas, deslocamentos artificiais e uma posição padrão em São Paulo para entradas desconhecidas. Esses comportamentos foram removidos. O nome de uma avenida também podia ser confundido com o município.
- A interface criava uma sede virtual para organizações sem unidades e assumia plano e classificação de matriz sem confirmação no cadastro. Agora mostra somente unidades existentes e os dados de assinatura cadastrados. Cadastros sem localização aparecem como pendências.
- Unidades próximas ou no mesmo município se encobriam. O agrupamento acompanha a escala do mapa e preserva todas as unidades. Clicar no círculo numerado aproxima até separar os pontos distintos. Quando há coordenadas coincidentes, os pinos se abrem em leque, com linhas de ligação ao ponto de referência; isso muda somente a posição visual para seleção, sem alterar coordenadas ou cadastros.
- Clicar em um pino individual abre um popup de uma unidade, com identificação e situação da empresa, endereço, precisão da localização, pessoas/unidades, plano, cadastro e ações de navegação. O cabeçalho e as ações permanecem acessíveis; o corpo pode rolar em telas pequenas. Enter/Espaço ativam os marcadores e fechar os detalhes devolve o foco ao pino.
- A busca por filial/cidade e os filtros agora selecionam as unidades correspondentes. O contexto de organização e os filtros recebidos pela URL podem ser removidos; trocar a situação no diálogo não fica preso ao subconjunto carregado inicialmente.
- Falhas de carregamento têm aviso e nova tentativa. Os popups usam texto, sem interpolar nomes ou endereços como HTML. A atribuição do OpenStreetMap permanece visível.

## Conferência do banco conectado

Consulta somente de leitura: **6 organizações e 10 unidades**. Os dez endereços coincidem com as entradas de `scratch/seed-locations.ts`, e há organizações explicitamente nomeadas como teste. São registros de demonstração persistidos no banco, não uma lista de empresas inventada no componente. O script de seed não foi executado nesta auditoria.

| Organização | Unidades | Referências municipais |
| --- | ---: | --- |
| Empresa Piloto Teste | 2 | Curitiba/PR |
| Alpha Varejo & Operações | 3 | São Paulo/SP e Campinas/SP |
| Beta Serviços Integrados | 2 | Rio de Janeiro/RJ e Niterói/RJ |
| Org Teste Retenção mv6typz2 | 1 | Belo Horizonte/MG |
| Org Teste Retenção mv6u2tb3 | 1 | Florianópolis/SC |
| Org Teste Retenção mv6u610c | 1 | Porto Alegre/RS |

As **6 empresas e 10 unidades estão representadas**, com oito referências municipais distintas. O número de marcadores visíveis muda conforme o zoom e a largura da tela; um marcador numerado representa todas as unidades de seu grupo. A verificação compara os IDs de cada unidade do banco com os IDs efetivamente presentes nos marcadores, sem duplicações ou perdas.

**Nenhuma das 10 unidades tem coordenadas explícitas cadastradas.** O modelo `Location` guarda endereço em texto, sem campos de latitude/longitude. O mapa indica claramente o uso de centros municipais aproximados, tanto na legenda quanto nos detalhes. Não é possível afirmar que esses pontos sejam os imóveis das empresas.

O catálogo local de municípios é limitado e não substitui um serviço de geocodificação. Endereços desconhecidos, incompletos ou sem município reconhecido permanecem sem pino e entram na lista de pendências. Para localizar os imóveis com precisão será necessário cadastrar coordenadas verificadas ou integrar geocodificação de endereços. Coordenadas explicitamente informadas no texto do endereço são preservadas e validadas.

## Validação

Resultado: 14 testes de dados aprovados; mapa e popup aprovados nas cinco larguras, sem erros do navegador e com os cadastros preservados. A revisão de interação verificou zoom no grupo, abertura em leque, seleção de cada unidade com Espaço, fechamento com Escape e retorno do foco. Typecheck, build e teste de ações assíncronas aprovados. A auditoria inicial das demais áreas aprovou 42 telas/interações.

- `node --import tsx --test scripts/verify-superadmin-map-data.test.ts`: 14 casos, incluindo endereço desconhecido, cidade confundida com avenida, coordenadas inválidas/zero, unidade inexistente, busca, agrupamentos, zoom de expansão e separação visual sem alterar coordenadas.
- `TAREFAI_UI_BASE_URL=http://localhost:3001 npx tsx scripts/verify-superadmin-map.ts`: auditoria de leitura no navegador, com capturas em 1440, 1024, 768, 390 e 320px; compara todos os IDs, verifica CSS/tiles carregados, filtros, detalhes, contexto, navegação, estado vazio e recuperação de falha da rede. Confere que os registros de organizações e unidades não mudaram.
- `npm run typecheck` e `npm run build`: verificações da aplicação.
- `npm run test:superadmin:ui` e `npm run test:superadmin:async`: regressões do contrato de interface. Use a mesma variável de endereço; as mutações do teste assíncrono são interceptadas antes de chegarem ao servidor.

Em PowerShell, defina primeiro `$env:TAREFAI_UI_BASE_URL='http://localhost:3001'`. Essa porta foi usada porque a 3000 pertence a outro projeto local.

As capturas e a conferência detalhada por empresa ficam em `tmp/map-review/`, incluindo `report.json`, `map-1440.png`, `map-390.png`, `popup-1440.png`, `popup-390.png`, `expanded-nearby-1440.png`, `expanded-same-point-1440.png` e `expanded-popup-1440.png`. Os estilos novos têm escopo do mapa do superadmin; não alteram as áreas de gestão ou colaboradores.

Correção aplicada no código local, sem publicação ou alteração dos cadastros.
