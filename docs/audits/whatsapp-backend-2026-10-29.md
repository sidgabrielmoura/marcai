# WAHA + Ably — validação de 29/10/2026

## Entrega

Implementação no backend canônico `marcai`, preservando o componente `WhatsAppInstances` e os contratos das quatro actions existentes. O estudo completo de `waha-instancias.md` precedeu o código. O proprietário confirmou o canal privado por organização/unidade/instância e autorizou HMAC e consulta técnica exclusivamente para esclarecer a assinatura ausente no documento.

O contrato detalhado, nomes das rotas, configuração, limites e comportamento de recuperação estão em [whatsapp-instances-backend.md](../whatsapp-instances-backend.md). A implementação usa client WAHA único, serviços da aplicação, repositório Prisma, routes/actions finas e o `Ably.Rest` existente. Não utiliza outro backend para receber callbacks.

## Evidência

- `node scripts/test-database-efficiency.cjs`: geração e tipos, domínio, operacional, regressões, histórico, eficiência, agendador seletivo, push, WAHA e comparação de schema aprovados. PostgreSQL 18 descartável em loopback; credenciais externas indisponíveis nesse executor.
- `node scripts/test-database-efficiency.cjs --build --webpack`: geração, TypeScript e build aprovados.
- Verificação do componente e hook reais em 1200 px e 390 px, com SDK/transportes simulados: inscrição antes da conexão, renovação de QR, transição WORKING removendo QR, revisão antiga descartada, reconexão sem continuidade reconciliando uma vez, conexão saudável sem nova consulta, limpeza ao ocultar/fechar, máscara de telefone e salvamento condicional aprovados.
- Aplicativo: snapshot site → app conferido (211 arquivos), workflow e tipos aprovados, 322 testes aprovados. A fixture mínima de manutenção foi atualizada para a projeção da tabela de recibos, incluindo testes de preservação das pendências e limite de 500 registros por lote.
- Servidor local real: GET do token, GET do snapshot e POST do webhook sem credenciais/assinatura responderam 401. Essas verificações não usaram sessão autenticada nem acionaram o WAHA.
- `git diff --check`: aprovado.

## Migração

Depois da apresentação do schema e dos testes, `20261029020000_whatsapp_webhooks` foi aplicada com Prisma migrate deploy no banco configurado no `.env`. Era a única migração pendente. Consultas de metadados e projeções LIMIT 0 confirmaram os sete novos campos da instância e a tabela de recibos sem consultar registros pessoais. O schema foi validado; nenhum reset foi usado.

## Estado da configuração e limite da validação

As variáveis WAHA, a chave Ably e o segredo utilizado na derivação HMAC estão presentes, sem divulgação de valores. Inicialmente `BASE_URL` estava ausente e a origem alternativa `NEXT_PUBLIC_APP_URL` ainda não era HTTPS público. Durante a validação final, `BASE_URL` foi configurada com uma origem HTTPS pública. A consulta sem autenticação à nova rota de token nesse domínio terminou em HTTP 404, após um redirecionamento HTTPS canônico; portanto, as novas rotas ainda precisam ser publicadas nesse backend. A mesma rota no servidor local real retorna 401 com o contrato esperado. Nenhum endereço ou segredo foi divulgado nos resultados.

Não houve pareamento de telefone, criação/remoção de sessões reais no WAHA nem envio de mensagem real nesta entrega. O recebimento remoto e a transição final após escanear QR exigem publicação/origem pública e o celular do proprietário. Abrir/conectar/atualizar uma instância existente aplica a nova config de webhooks assinados com PUT.

## Atualização: modal e transição após escanear QR

O modal de conexão foi separado em um componente de apresentação, com contexto da instância/unidade, status compacto, QR centralizado, instrução curta e ações no rodapé sempre visível. Revisão visual em 1200, 390 e 320 px cobriu QR, conexão ativa, carregamento, desconexão, erro e nomes longos, incluindo viewport baixo. As callbacks de conectar, atualizar e desconectar continuam nas actions existentes.

Foi reproduzida em teste uma condição em que a sessão ficava WORKING durante a busca do QR e o provedor recusava a imagem; antes, isso retornava erro de conexão apesar do pareamento concluído. Agora o serviço prioriza o estado confirmado e reconcilia uma vez a sessão somente se o QR falhar ou desaparecer. Os cenários de imagem recusada e 404 retornam WORKING com QR nulo; erro real enquanto continua SCAN_QR_CODE continua sendo informado. Não houve nova migração.

O cliente acompanha a revisão confirmada por instância e descarta falhas de transporte ou respostas de QR antigas após uma confirmação WORKING mais recente, preservando erros de autorização. A verificação em navegador, com componente e hook reais e transporte simulado, confirmou a conexão ativa sem falso alerta quando uma chamada de QR atrasada termina em erro, em desktop e mobile. A suíte WAHA com PostgreSQL descartável e tipos passou.
