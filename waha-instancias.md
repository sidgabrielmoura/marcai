# Guia — Instâncias (sessões) no WAHA

**Projeto:** [[agentehub-core]]
**Criado em:** 2026-10-28
**Vinculado a:** [[instance-contract]] | [[Agent 004]]

> Como criar e operar uma sessão de WhatsApp no WAHA e o que ele envia de volta a cada acontecimento. Não descreve as rotas do backend — para isso, [[instance-contract]]. Os exemplos usam dados fictícios.

---

## Índice

- [[#Configuração (.env)]]
- [[#Conceitos]]
- [[#Ciclo de vida da sessão]]
- [[#Criar uma sessão]]
- [[#Iniciar, reiniciar, parar]]
- [[#Conectar o WhatsApp (QR code)]]
- [[#Consultar a sessão]]
- [[#Atualizar a configuração]]
- [[#Desconectar e excluir]]
- [[#Webhooks — o que o WAHA envia]]
- [[#Outras chamadas úteis]]
- [[#Armadilhas conhecidas]]

---

## Configuração (.env)

| Variável | Uso |
|---|---|
| `WAHA_BASE_URL` | endereço do servidor WAHA (ex.: `https://waha.exemplo.com`) — prefixo de todas as chamadas abaixo |
| `WAHA_KEY` | chave da API do WAHA, enviada em **toda** chamada no cabeçalho `X-Api-Key` |
| `BASE_URL` | endereço público do backend — é para ele que o WAHA envia os webhooks. Precisa ser alcançável a partir do servidor do WAHA |

Toda chamada:

```
X-Api-Key: <WAHA_KEY>
Content-Type: application/json
```

Sem a chave, o WAHA responde `401`.

---

## Conceitos

- **Sessão** = um número de WhatsApp conectado ao WAHA. É identificada por um **nome** que você escolhe (ex.: `INSTANCE-6AD6D9D15E3120A3E852394A`). O nome é o identificador em todas as chamadas e em todos os webhooks (`session`).
- **Engine**: o WAHA deste projeto roda **NOWEB** (protocolo direto, sem navegador). Algumas opções de config são por engine (`noweb`, `webjs`).
- **Store** (NOWEB): banco local do WAHA com contatos, conversas e mensagens da sessão. Precisa estar ligado para listar contatos e chats.
- **Metadata**: chave/valor livre gravado na sessão e devolvido em todo webhook — útil para saber de que empresa/projeto é a sessão sem consultar o banco.
- **Identificadores de chat**:
  - `5585900000000@c.us` — conta pelo telefone (formato do WAHA);
  - `5585900000000@s.whatsapp.net` — o mesmo, no formato interno do WhatsApp (aparece em `_data`);
  - `12345678901234@lid` — identificador de privacidade, **sem telefone**; o telefone pode vir à parte em `remoteJidAlt`;
  - `...@g.us` — grupo.

---

## Ciclo de vida da sessão

```
STOPPED ──start──► STARTING ──► SCAN_QR_CODE ──(lido no celular)──► WORKING
                                     │                                  │
                                     └──── QR expirou várias vezes ──► FAILED
WORKING ──(desconectado no celular / banido / sem rede longa)──► FAILED ou SCAN_QR_CODE
```

| Status | Significado |
|---|---|
| `STOPPED` | sessão existe mas está parada |
| `STARTING` | subindo |
| `SCAN_QR_CODE` | aguardando o QR code ser lido |
| `WORKING` | conectada, enviando e recebendo |
| `FAILED` | caiu — precisa reiniciar (e, se o celular desconectou, ler o QR de novo) |

Toda mudança de status gera o webhook `session.status`.

---

## Criar uma sessão

```
POST {WAHA_BASE_URL}/api/sessions
```

```json
{
  "name": "INSTANCE-6AD6D9D15E3120A3E852394A",
  "start": true,
  "config": {
    "metadata": {
      "company": "Empresa Exemplo",
      "project": "Atendimento",
      "purpose": "assistant"
    },
    "proxy": null,
    "debug": false,
    "noweb": {
      "store": { "enabled": true, "fullSync": false }
    },
    "webhooks": [
      {
        "url": "https://api.exemplo.com/<rota-de-status>/INSTANCE-6AD6D9D15E3120A3E852394A",
        "events": ["session.status"],
        "retries": { "policy": "constant", "delaySeconds": 1, "attempts": 1 }
      },
      {
        "url": "https://api.exemplo.com/<rota-de-mensagens>/INSTANCE-6AD6D9D15E3120A3E852394A",
        "events": ["message"],
        "retries": { "policy": "constant", "delaySeconds": 1, "attempts": 1 }
      },
      {
        "url": "https://api.exemplo.com/<rota-de-todas-as-mensagens>/INSTANCE-6AD6D9D15E3120A3E852394A",
        "events": ["message.any"],
        "retries": { "policy": "constant", "delaySeconds": 1, "attempts": 1 }
      }
    ]
  }
}
```

| Campo | O que faz |
|---|---|
| `name` | identificador da sessão; único no servidor WAHA |
| `start` | `true` já sobe a sessão (vai para `STARTING` → `SCAN_QR_CODE`) |
| `config.metadata` | devolvido em todo webhook |
| `config.noweb.store.enabled` | liga o store (contatos, chats, mensagens). `fullSync: false` = não baixa o histórico antigo inteiro na conexão |
| `config.webhooks[]` | para onde o WAHA envia cada tipo de evento. Uma sessão pode ter vários; cada um com sua lista de `events` |
| `webhooks[].retries` | nova tentativa se o backend não responder 2xx. `attempts: 1` = sem segunda chance |
| `webhooks[].hmac` *(opcional)* | `{ "key": "<segredo>" }` — o WAHA assina o corpo e envia a assinatura em cabeçalho (`X-Webhook-Hmac`), para o backend recusar chamadas falsas. **Não usado hoje** |

Já existe uma sessão com o mesmo nome → `422`/erro. Por isso, antes de criar, consulte se existe ([[#Consultar a sessão]]).

---

## Iniciar, reiniciar, parar

```
POST {WAHA_BASE_URL}/api/sessions/{name}/start
POST {WAHA_BASE_URL}/api/sessions/{name}/restart
POST {WAHA_BASE_URL}/api/sessions/{name}/stop
```

- `start`: sobe uma sessão `STOPPED`.
- `restart`: para e sobe de novo. Numa sessão já vinculada (`WORKING`), reconecta **sem** pedir QR. É o "tentar de novo" depois de `FAILED`.
- `stop`: para sem desvincular o número; um `start` depois volta sem QR.

---

## Conectar o WhatsApp (QR code)

Com a sessão em `SCAN_QR_CODE`:

```
GET {WAHA_BASE_URL}/api/{name}/auth/qr?format=image
```

- Devolve a imagem do QR (PNG). Para usar direto numa tag `<img>`, converta para base64: `data:image/png;base64,<...>`.
- Fora de `SCAN_QR_CODE` não há QR — espere o webhook `session.status` com `SCAN_QR_CODE` em vez de esperar um tempo fixo.
- O QR **muda a cada ~20 s**. A tela deve buscar de novo enquanto o status continuar `SCAN_QR_CODE`.
- Depois de algumas trocas sem leitura, a sessão vai para `FAILED`: é preciso `restart` para gerar QR novo.
- Lido o QR no celular (WhatsApp → Aparelhos conectados → Conectar aparelho), chega `session.status` com `WORKING` e o `me` preenchido.

---

## Consultar a sessão

```
GET {WAHA_BASE_URL}/api/sessions/{name}
```

```json
{
  "name": "INSTANCE-6AD6D9D15E3120A3E852394A",
  "status": "WORKING",
  "config": { "metadata": { "company": "Empresa Exemplo" }, "webhooks": [ "..." ] },
  "me": { "id": "5585900000000@c.us", "pushName": "Atendimento Exemplo" },
  "engine": { "engine": "NOWEB" }
}
```

- `404` = a sessão não existe nesse WAHA.
- `me` é `null` enquanto não estiver `WORKING`.
- `GET {WAHA_BASE_URL}/api/sessions` lista todas (útil para achar sessões órfãs).

---

## Atualizar a configuração

```
PUT {WAHA_BASE_URL}/api/sessions/{name}
```

Mesmo corpo do POST de criação (`config` completo). Use quando mudar algo que vai na config — principalmente a **URL dos webhooks** (ex.: troca do domínio do backend) ou a metadata. Uma sessão que só é reiniciada continua com a config antiga para sempre.

---

## Desconectar e excluir

```
POST   {WAHA_BASE_URL}/api/sessions/{name}/logout
DELETE {WAHA_BASE_URL}/api/sessions/{name}
```

- `logout`: desvincula o número (some do "Aparelhos conectados" do celular). A sessão continua existindo; para usar de novo, `start` e ler QR.
- `DELETE`: remove a sessão do WAHA (config e store). Para tirar um número do sistema de vez: `logout` e depois `DELETE` — só o logout deixa a sessão ocupando o servidor.

---

## Webhooks — o que o WAHA envia

Todos chegam como `POST` com este envelope:

```json
{
  "id": "evt_01xxxxxxxxxxxxxxxxxxxxxxxx",
  "timestamp": 1792510703849,
  "session": "INSTANCE-6AD6D9D15E3120A3E852394A",
  "event": "message.any",
  "metadata": { "company": "Empresa Exemplo", "purpose": "assistant" },
  "me": { "id": "5585900000000@c.us", "pushName": "Atendimento Exemplo", "lid": "98765432109876@lid" },
  "engine": "NOWEB",
  "environment": { "version": "2026.8.2", "engine": "NOWEB", "tier": "CORE" },
  "payload": { }
}
```

- `session` e `metadata` dizem de qual sessão é o evento.
- `id` é único por evento — serve para ignorar entregas repetidas.
- O backend deve responder **2xx rápido**; processamento demorado vai para fila. Sem 2xx, o WAHA tenta de novo conforme `retries`.

### `session.status` — mudou o status da sessão

```json
{
  "event": "session.status",
  "session": "INSTANCE-6AD6D9D15E3120A3E852394A",
  "me": { "id": "5585900000000@c.us", "pushName": "Atendimento Exemplo" },
  "payload": { "name": "INSTANCE-6AD6D9D15E3120A3E852394A", "status": "WORKING" }
}
```

- `payload.status`: um dos [[#Ciclo de vida da sessão|status]].
- `me` vem `null` quando a sessão não está conectada — **não** apague o telefone/nome salvos por causa disso; guarde o último conhecido.

### `message` — mensagem **recebida** (do contato)

Só o que chega de fora (`fromMe: false`). É o gatilho para a IA responder.

```json
{
  "event": "message",
  "payload": {
    "id": "false_5585911111111@c.us_3EB0AAAAAAAAAAAAAAAA",
    "timestamp": 1792510703,
    "from": "5585911111111@c.us",
    "fromMe": false,
    "body": "Olá, quero saber o horário de vocês",
    "hasMedia": false,
    "media": null,
    "_data": {
      "key": {
        "remoteJid": "5585911111111@s.whatsapp.net",
        "remoteJidAlt": null,
        "fromMe": false,
        "id": "3EB0AAAAAAAAAAAAAAAA"
      },
      "pushName": "Maria"
    }
  }
}
```

| Campo | Uso |
|---|---|
| `payload.id` | id da mensagem — para ignorar duplicadas |
| `from` | quem mandou. Pode ser `@c.us` (com telefone) ou `@lid` (sem telefone) |
| `_data.key.remoteJidAlt` | quando `from` é `@lid`, o telefone pode vir aqui (`...@s.whatsapp.net`) |
| `_data.pushName` | nome que o contato usa no WhatsApp |
| `hasMedia` / `media` | áudio, imagem, documento — `media.url` aponta para o arquivo no WAHA (baixar com o `X-Api-Key`) |

### `message.any` — **toda** mensagem, inclusive as enviadas

Mesmo formato de `message`, mas inclui as que a própria sessão enviou (`fromMe: true`): pela API ou digitadas no celular por uma pessoa.

```json
{
  "event": "message.any",
  "payload": {
    "id": "true_99282514407436@lid_3EB0BBBBBBBBBBBBBBBB",
    "from": "99282514407436@lid",
    "fromMe": true,
    "source": "app",
    "body": "Bom dia! Já te passo os valores",
    "ack": 1,
    "ackName": "SERVER",
    "_data": {
      "key": {
        "remoteJid": "99282514407436@lid",
        "remoteJidAlt": "5585922222222@s.whatsapp.net",
        "fromMe": true,
        "addressingMode": "lid"
      }
    }
  }
}
```

| Campo | Uso |
|---|---|
| `fromMe` | `true` = enviada pela sessão. É assim que se detecta **um humano respondendo pelo celular** (intervenção humana) |
| `source` | `api` (enviada por chamada à API) ou `app` (digitada no celular). Não é 100% confiável após reinício da sessão |
| `ack` / `ackName` | estado de entrega **no momento do evento**: `1 SERVER` (chegou no WhatsApp). A entrega real vem depois, no `message.ack` |
| `_data.key.remoteJid` + `remoteJidAlt` | para quem foi. Se o `remoteJid` virou `@lid` e veio `remoteJidAlt`, o WhatsApp reconheceu a conta. Se ficou `@s.whatsapp.net` sem `lid`, o número pode não existir (ver nono dígito em [[#Armadilhas conhecidas]]) |

### `message.ack` — entrega e leitura *(não assinado hoje)*

Chega quando a mensagem enviada avança: `2 DEVICE` (entregue no aparelho), `3 READ` (lida), `4 PLAYED` (áudio ouvido), `-1 ERROR`. É a única forma de saber se uma mensagem chegou — `message.any` com `ack: 1` só diz que o servidor do WhatsApp aceitou. Para receber, inclua `"message.ack"` em `events` de algum webhook.

---

## Outras chamadas úteis

| Chamada | Para quê |
|---|---|
| `GET /api/contacts/check-exists?phone=5585900000000&session={name}` | confirma se o número tem WhatsApp e devolve o `chatId` **correto** (resolve o nono dígito) |
| `POST /api/sendText` `{ "session", "chatId", "text" }` | envia texto |
| `POST /api/startTyping` / `POST /api/stopTyping` `{ "session", "chatId" }` | mostra/esconde "digitando…" |
| `GET /api/{name}/lids/{lid}` | tenta o telefone de um `@lid` (`pn`); `null` quando o WhatsApp ainda não revelou |
| `GET /api/{name}/contacts/all` · `GET /api/{name}/chats` | contatos e conversas do store (precisa `noweb.store.enabled`) |

---

## Armadilhas conhecidas

- **Nono dígito.** Contas antigas de alguns DDDs existem no WhatsApp **sem** o 9 (ex.: `554184280137`). Enviar para a forma com 9 é aceito (`ack: 1`) mas **nunca entrega**. Antes do primeiro envio, use `check-exists` e envie para o `chatId` devolvido.
- **`@lid` sem telefone.** O telefone de um `@lid` só aparece quando o dono responde a conversa pelo celular conectado; envio pela API, "digitando…" e salvar o contato não revelam.
- **Config congelada.** Reiniciar não atualiza webhooks nem metadata — use `PUT` ao mudar o domínio do backend ([[#Atualizar a configuração]]).
- **Webhook sem assinatura.** Sem `hmac`, qualquer um que conheça o nome da sessão consegue chamar a rota do backend fingindo ser o WAHA.
- **Uma tentativa só.** Com `attempts: 1`, um webhook que chegar com o backend fora do ar (deploy, reinício) se perde.
- **Sessão órfã.** Excluir só com `logout` deixa a sessão no WAHA; use `DELETE`.

---

*Vinculado a: [[agentehub-core]] | [[Agent 004]] | [[instance-contract]] | [[device-contacts]]*
