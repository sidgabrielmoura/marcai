# QR automático no localhost — 29/10/2026

## Causa constatada

A interface já iniciava a conexão ao abrir, mas a sessão ficava em STARTING aguardando a indicação SCAN_QR_CODE. A inspeção de leitura encontrou a sessão deste projeto com metadata, HMAC e URL configurados, enquanto o destino público do webhook retornava 404. Assim, a mudança do WAHA não chegava ao backend local nem ao Ably; a atualização manual consultava a sessão diretamente e mostrava o QR.

O usuário confirmou que o teste ocorre em localhost. Foi configurado um Cloudflare Quick Tunnel exclusivamente para POST no caminho de webhooks, com override BASE_URL em `.env.development.local`. O `.env` com a origem pública original foi preservado. Não foi criado polling de status para compensar falhas de entrega.

## Implementação local

- `scripts/dev-whatsapp.cjs`: inicia o túnel, confere o endpoint e configura o override de desenvolvimento; controla encerramento por interface separada de loopback, protegida por chave local não impressa.
- `scripts/lib/whatsapp-webhook-proxy.cjs`: encaminha somente POST `/api/whatsapp/webhooks/{session}`, preservando bytes e headers HMAC, com limite de 256 KiB.
- `npm run dev:whatsapp`: helper que acompanha o `npm run dev` já iniciado.
- `npm run dev:whatsapp:stop`: encerra o helper e restaura a chave anterior no override local.

O executável oficial cloudflared foi baixado para a pasta ignorada `tmp/waha-tunnel/bin`. Não houve instalação global, alteração de DNS do computador nem publicação do restante do site. O helper está rodando em segundo plano para os testes locais e precisa continuar ativo; após encerramento/reinício, deve ser iniciado novamente. A URL do Quick Tunnel é temporária.

## Validação

O teste com servidores sintéticos confirmou preservação exata de UTF-8 e HMAC, rejeição dos demais caminhos/métodos e limite de corpo. A consulta pública sem assinatura chegou ao endpoint correto e retornou 401. A verificação da origem no Next confirmou o override local, e uma rota de tela pelo túnel retornou 404. Nenhum evento válido foi enviado aos registros reais; a configuração de sessão continua sendo aplicada pela action autenticada do proprietário quando ele abre a instância.

Resultado do diagnóstico final: `tunnelConfigured:true`, `nextUsesLocalOverride:true`, `callbackReady:true`, `otherRoutesBlocked:true`. Valores de URLs, chaves, telefones e nomes de sessão não foram expostos no relatório.

Instruções de retomada: [desenvolvimento local](../whatsapp-local-development.md).
