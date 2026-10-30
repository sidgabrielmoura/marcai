# Webhooks WhatsApp no localhost

O WAHA remoto não consegue entregar webhooks diretamente a localhost. No desenvolvimento, use um túnel HTTPS que encaminhe somente `POST /api/whatsapp/webhooks/{session}` para o Next local. A comunicação em tempo real continua sendo webhook → backend → Ably → modal; não há polling do status para compensar uma URL inacessível.

## Inicialização

1. Inicie o site com `npm run dev`.
2. Tenha o executável oficial `cloudflared` em `tmp/waha-tunnel/bin/cloudflared.exe` (Windows), `tmp/waha-tunnel/bin/cloudflared` (outros sistemas) ou defina `CLOUDFLARED_PATH` com seu caminho. Consulte os [downloads oficiais](https://developers.cloudflare.com/tunnel/downloads/).
3. Em outro terminal, execute `npm run dev:whatsapp` e mantenha o processo ativo.
4. Depois da confirmação `ready:true`, abra a instância como proprietário. A action aplica automaticamente a URL do túnel à sessão WAHA com PUT e inicia/reinicia a conexão conforme o estado. O evento de QR pronto chega ao backend local e é encaminhado pelo Ably.

O script usa `NEXT_PUBLIC_APP_URL` para encontrar o servidor local e exige uma origem HTTP de loopback. O endereço temporário é salvo apenas como `BASE_URL` em `.env.development.local`, que o Next prioriza no desenvolvimento. O `.env` com a origem de produção permanece intacto. O arquivo local não deve ser versionado. Se o Next não recarregar o novo arquivo automaticamente, reinicie apenas o servidor de desenvolvimento e reabra a instância.

O helper filtra a saída do cloudflared e não imprime a URL ou segredos. O encaminhador preserva os bytes originais do corpo e os cabeçalhos HMAC; a autenticação e as regras de negócio continuam no backend. Caminhos de telas, actions e outras APIs ficam bloqueados no túnel. Há limite de 256 KiB para o corpo.

A validação espera a rota remota responder com a rejeição de assinatura esperada, antes de gravar a origem local. Quando o resolvedor do computador não encontra o hostname temporário, o helper consulta DNS público e valida HTTPS com o nome e o certificado originais; não altera DNS do sistema, arquivo hosts ou validação TLS. A confirmação final foi `callbackReady:true`, `nextUsesLocalOverride:true` e `otherRoutesBlocked:true`, sem executar um webhook válido ou alterar registros do banco.

## Encerramento e retomada

Use `npm run dev:whatsapp:stop` para encerrar o helper e restaurar o valor anterior da chave no arquivo de desenvolvimento. Ctrl+C no terminal do helper também encerra o túnel. O controle de encerramento escuta em outra porta de loopback, não encaminhada pelo túnel, e exige um token local que não é impresso.

Um Quick Tunnel tem URL temporária: ao iniciar outro, a URL pode mudar. O helper atualiza o override local; ao abrir a instância, a action atualiza os webhooks do WAHA. Depois de encerrar o processo ou reiniciar o computador, inicie novamente o helper. Em produção use a origem pública estável do backend.

## Verificação

`npm run test:whatsapp:tunnel` usa servidores sintéticos de loopback e verifica preservação do corpo UTF-8/HMAC, encaminhamento exclusivo de POST no caminho permitido, bloqueio das demais rotas e limite de tamanho. Não usa o banco ou as credenciais do projeto.

O comportamento de URLs temporárias segue a [documentação de Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
