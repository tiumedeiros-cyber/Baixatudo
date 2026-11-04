# Ligando o WhatsApp (GOWA) — passo a passo

O painel **nunca** fala direto com o WhatsApp. Quem fala é o **GOWA** (go-whatsapp-web-multidevice,
escrito em Go sobre a biblioteca whatsmeow), um programa que roda no seu PC como um "WhatsApp Web"
sem navegador. O painel só pede ao GOWA: "manda esta mensagem para este número".

```
Painel (Next.js, :3000) ──► worker (npm run worker) ──► POST /api/worker/tick ──► motor de envio
                                                                                     │
                                                              GOWA (:3300) ◄─────────┘  1 mensagem por volta
                                                                 │
                                                                 └─► webhook ─► POST /api/webhooks/wa  (respostas e "lido")
```

> **Aviso honesto.** O GOWA usa o protocolo **não oficial** do WhatsApp. Isso viola os Termos de
> Serviço e **pode banir o número**. O painel reduz o risco (chip dedicado, aquecimento, limites
> diários, intervalo aleatório de 3 a 9 min, horário comercial, parada automática se ninguém
> responde), mas não zera. **Use um chip que você aceite perder.** Nunca o número pessoal.

## Rotina diária: como ligar e desligar

**Ligar (um clique):** duplo clique no atalho **"Ligar JK Prospect X1"** da Área de trabalho (ou em
`Ligar-sistema.bat`, na pasta do projeto). Ele liga só o que ainda não estiver ligado e abre o painel
no navegador. São três janelas:

| Janela | O que é | Se fechar |
|---|---|---|
| Painel (`npm run dev`) | o site em http://localhost:3000 | o site some e o worker e o WhatsApp não conseguem avisar o painel |
| GOWA (`npm run gowa`) | a ligação com o WhatsApp | o sistema não envia nem recebe até religar (não perde nada, reconecta sozinho) |
| Worker (`npm run worker`) | o relógio que envia uma mensagem de cada vez | nada é enviado até religar |

**Desligar:** feche as três janelas. Os dados ficam guardados (Supabase e `gowa\storages`).

**Se preferir ligar à mão**, o terminal precisa estar **na pasta do projeto**. Se ele abrir em outra pasta, o `npm`
diz "Missing script". Em cada janela:

```
cd "caminho/da/pasta/jk-prospect-x1"
npm run dev        (painel)
npm run gowa       (WhatsApp)
npm run worker     (envio)
```

O envio só acontece de segunda a sexta, das 9h às 12h e das 14h às 18h (Fortaleza), e só depois de
você liberar no painel. Fora disso as janelas podem ficar fechadas.

## O que já está pronto e o que falta

| Peça | Estado |
|---|---|
| Motor de envio, fila, trava de segurança, respostas, opt-out | pronto e testado (sem enviar nada) |
| Worker (`npm run worker`) | pronto |
| Webhook que recebe respostas | pronto |
| Script que sobe o GOWA ligado ao painel (`npm run gowa`) | pronto e testado |
| Executável do GOWA (`gowa\whatsapp.exe`) | **instalado** (v9.6.0, passo 2) |
| Chave secreta do Supabase no `.env.local` | **colada**, e o worker já lê o banco com ela (passo 1) |
| Usuário, senha e endereço do GOWA no `.env.local` | **preenchidos** (passo 3) |
| QR code com o chip dedicado | **só você faz** (passo 4) |

Enquanto o QR não for lido, e mesmo depois dele, o painel roda em **simulação e pausado**: aprova,
agenda e "envia" de mentira, sem sair uma mensagem. Só sai de verdade depois do passo 6.

## Passo 1 — Chave secreta do Supabase (já feito)

O worker e o webhook rodam sem você logado, então precisam de uma chave que passe pelo RLS. A sua já
está no `.env.local` (formato `sb_secret_…` conferido) e o worker já leu as configurações do banco
com ela. Se um dia precisar refazer:

1. Supabase → seu projeto `jk-prospect-x1` → **Project Settings → API Keys**.
2. Copie a chave **secret** (começa com `sb_secret_`).
3. Cole em `.env.local`, na linha `SUPABASE_SECRET_KEY=`.

Essa chave só existe no seu PC. Ela **nunca** vai para o navegador nem para o git. Quem tiver essa
chave lê e escreve em todo o banco: não mande por chat e não suba para a Vercel/GitHub.

## Passo 2 — O GOWA (já instalado)

Instalado em 22/10/2026 a partir da página oficial de releases do projeto
(https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases), versão **v9.6.0**:

- arquivo baixado: `whatsapp_9.6.0_windows_amd64.zip` (11,9 MB);
- o SHA-256 do zip bateu com o do `checksums.txt` publicado na mesma release
  (`9db29f35…dfdba5e`). Isso garante que o arquivo veio inteiro; não é uma assinatura do autor;
- o executável (32 MB, **sem assinatura digital do Windows**, normal nesse projeto) está em
  **`gowa\whatsapp.exe`**, e o leia-me do projeto em `gowa\LEIAME-gowa.md`;
- a pasta `gowa/` está no `.gitignore`, porque guarda a sessão do seu WhatsApp (equivale a estar
  logado no seu número): **não copie nem envie essa pasta para ninguém**.

O script `npm run gowa` já sobe o GOWA com as opções mais seguras: escuta só neste computador
(`127.0.0.1`; o padrão dele é a rede inteira), CORS restrito à própria tela, sem guardar mídia dos
leads e sem o endpoint MCP.

> **Porta.** A 3001 está ocupada pelo backend do seu outro projeto ("ATENDIMENTO AUTOMATIZADO"),
> então o GOWA usa a **3300**. Se um dia precisar trocar, mude `--port` e `--cors-allowed-origins` em
> `scripts/gowa-start.ps1` e o `GOWA_URL` no `.env.local`.

> **Tela de controle.** O GOWA baixa sozinho, do GitHub, a tela web onde você lê o QR (projeto
> `aldinokemal/gowa-ui`) e a atualiza de tempos em tempos. É assim que ele funciona por padrão.

Para atualizar o GOWA no futuro: baixe a release nova, confira o `checksums.txt`, pare o GOWA e
troque o `whatsapp.exe`. A sessão (pasta `gowa\storages`) continua valendo.

Se o Windows SmartScreen reclamar na primeira execução, é por o arquivo não ter assinatura digital.

## Passo 3 — Usuário e senha do GOWA (já preenchidos)

No `.env.local` já estão:

```
GOWA_URL=http://localhost:3300
GOWA_BASIC_AUTH=jk:<senha longa gerada>
```

O usuário é `jk`. A **senha é o texto depois do `:`** na linha `GOWA_BASIC_AUTH` do `.env.local`
(abra o arquivo e copie): é ela que o navegador pede ao abrir a tela do GOWA. Foi gerada ao acaso e
não aparece em nenhum outro lugar.

## Passo 4 — Subir o GOWA e ler o QR code

Terminal 1 (painel):

```bash
npm run dev
```

Terminal 2 (GOWA):

```bash
npm run gowa
```

1. Abra http://localhost:3300 (o navegador pede o usuário `jk` e a senha do passo 3).
2. Na tela do GOWA, adicione o aparelho e peça o QR code (o GOWA 9 trabalha com "aparelhos"; com um
   só, ele vira o padrão e o painel não precisa de mais nada).
3. No celular do **chip dedicado**: WhatsApp → Aparelhos conectados → Conectar um aparelho → leia o QR.
4. Pronto: o GOWA fica logado. No painel, o card da automação passa a mostrar o WhatsApp conectado.
   Se o painel mostrar "GOWA no ar, mas nenhum WhatsApp conectado", é só esta etapa que falta.
   (Se um dia houver mais de um aparelho, preencha `GOWA_DEVICE_ID` no `.env.local`.)
5. A sessão fica guardada em arquivos dentro da pasta `gowa\storages` (o script roda de lá), então
   normalmente você não precisa ler o QR de novo ao reiniciar o GOWA.

Use o **WhatsApp Business** no chip dedicado (perfil comercial com nome, foto e descrição passa mais
confiança para quem recebe).

### Aquecimento do chip (não pule)

O WhatsApp desconfia de número novo que sai mandando mensagem para desconhecido. Antes de ligar o envio:

- 7 a 14 dias com o chip ativo: conversar com amigos e família, entrar em grupos, receber respostas.
- Foto, nome e recado preenchidos.
- Nos primeiros dias de envio, deixe o teto em **8/dia** (é o padrão do painel) e só suba depois de
  ver as pessoas respondendo.

## Passo 5 — Worker

Terminal 3:

```bash
npm run worker
```

A cada 20 segundos ele chama o painel. Cada chamada envia **no máximo uma** mensagem e só se passar
por todas as travas: automação despausada, janela de horário (seg–sex, 09–12 e 14–18, horário de
Fortaleza), teto do dia, intervalo mínimo, número não está na lista de "PARE". No terminal ele
mostra o que está acontecendo, por exemplo `pausado`, `nada na fila`, `simulou um envio (nada saiu)`
ou `MENSAGEM ENVIADA`.

## Passo 6 — Primeiro envio real, com cuidado

O painel nasce **pausado** e em **simulação**. Para enviar de verdade, nesta ordem:

1. Painel → **Fila** → *Preparar lote de hoje* → leia os rascunhos, edite o que quiser e **Aprove** poucos (2 ou 3). (O lote só pega leads que você marcou como *Qualificado* no Caçador.)
2. Deixe o worker rodando em simulação e confira no terminal que ele "simula" no horário certo.
3. **Configurações → Envio real**: digite `ENVIAR` para sair da simulação. O painel só deixa se o GOWA
   estiver conectado, e ao ligar o envio real ele **pausa** a automação de propósito.
4. Painel → **Comando** → *Retomar automação*. A primeira mensagem sai dentro da janela de horário.
5. Fique olhando o primeiro dia. O botão **PAUSAR TUDO** do Comando é o freio de mão e vale na hora.

Sinais para parar e esfriar o chip por alguns dias: várias falhas seguidas (o painel já pausa sozinho
na terceira), ninguém respondendo, aviso de "conta com restrição" no celular.

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| Worker mostra `painel indisponível` | O `npm run dev` (ou `npm start`) precisa estar no ar na porta 3000 |
| Worker mostra `erro 401` | `WORKER_TOKEN` diferente entre o worker e o painel: reinicie os dois |
| Worker mostra `sem WhatsApp: …` | GOWA fora do ar ou sem QR lido. Abra http://localhost:3300 |
| Worker mostra `Falta SUPABASE_SECRET_KEY` | Passo 1 |
| Falha `GOWA respondeu 500: no LID found for 55…` | O celular está registrado no WhatsApp **sem o 9** depois do DDD (comum fora de SP/RJ), mas o painel guardou **com o 9**. Desde 23/10 o envio descobre sozinho a forma registrada (consulta o GOWA com e sem o 9) e a resposta casa com a conversa nas duas formas. Se a falha voltar, o painel pausa sozinho depois de 3 seguidas |
| Painel mostra "ENVIO REAL" e **PAUSADA** depois de falhas | Foi a trava de segurança (3 falhas seguidas). Corrija a causa (veja a mensagem no card) e clique em **Retomar automação** |
| Respostas não aparecem no painel | O GOWA tem de ser iniciado por `npm run gowa` (ele registra o webhook com a assinatura correta) |
| Lead respondeu "PARE" | O número já entrou na lista de bloqueio sozinho; nenhuma mensagem sai mais para ele |
| Resposta de contato "@lid" não casa com lead | O WhatsApp às vezes esconde o telefone; o painel ignora esses casos em vez de adivinhar |

## Ver o que o GOWA oferece

Com ele rodando, a documentação das rotas fica em http://localhost:3300 (interface web) e no
[repositório](https://github.com/aldinokemal/go-whatsapp-web-multidevice). O painel só usa quatro
rotas: `/app/status`, `/send/message`, `/send/chat-presence` ("digitando…") e `/user/check`.
