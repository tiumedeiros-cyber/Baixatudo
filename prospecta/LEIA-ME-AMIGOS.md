# JK Prospect X1: kit de instalação

Painel de prospecção por WhatsApp. Ele **caça negócios locais no Google Maps**, dá nota a cada um, organiza num funil, escreve
a abordagem, **envia uma mensagem de cada vez com todas as travas** e atende as respostas com um agente (regras + IA opcional).
Foi feito para vender sites, mas a estrutura serve para vender qualquer serviço local. O sistema original é do Jonathan Kelvin
(Kelvin Studio); aqui está a cópia para você instalar e adaptar.

> **Leia antes de enviar qualquer coisa.**
> - O envio usa o **GOWA**, que fala com o WhatsApp por um protocolo **não oficial**. Isso viola os Termos de Serviço do WhatsApp e
>   **pode banir o número**. Use um **chip dedicado que você aceite perder**, nunca o seu número pessoal.
> - Você é o responsável por quem abordar. Respeite quem pedir para parar (o sistema já trata "PARE", mas a conduta é sua) e a LGPD.
> - O sistema nasce **pausado e em simulação**: nada sai pelo WhatsApp até você conectar o GOWA **e** liberar o envio nas
>   Configurações do painel. Nenhuma mensagem sai sem a sua aprovação (modo copiloto), a menos que você ligue o contrário.

## 1. Ver funcionando em 2 minutos (sem conta, sem chave)

Precisa de **Node.js 20.9 ou mais novo** (testado com o 22) e do npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem nenhum arquivo de configuração o painel abre em **modo demonstração**: sem login, com uns 120
leads **fictícios** guardados em memória (reiniciar o servidor zera). Dá para testar o Caçador, o funil, a fila, as conversas e
o agente inteiro sem enviar nada.

## 2. Ligar de verdade

### 2.1 Banco e login (Supabase, plano grátis serve)

1. Crie um projeto em https://supabase.com.
2. **SQL Editor > New query**: cole o conteúdo de `supabase/TUDO-EM-UM.sql` e clique em **Run** (uma vez, num projeto vazio).
   São as 7 migrações juntas; as mesmas estão separadas em `supabase/migrations/` para quem prefere `supabase db push`.
3. **Authentication > URL Configuration**: ponha `http://localhost:3000/auth/callback` em *Redirect URLs*.
4. **Project Settings > API Keys**: copie a URL do projeto, a chave **publishable** e a chave **secret**.

### 2.2 O arquivo `.env.local`

Copie `.env.example` para `.env.local` e preencha (cada variável está explicada no próprio arquivo):

| Variável | O que colocar |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | do passo 2.1 |
| `SUPABASE_SECRET_KEY` | a chave **secret** (só no seu PC; nunca no navegador, no git ou na Vercel) |
| `OWNER_EMAIL` | o seu e-mail: só ele entra no painel |
| `SESSION_SECRET`, `WORKER_TOKEN`, `WA_WEBHOOK_SECRET` | invente cada um com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APIFY_TOKEN` | opcional, para o Caçador buscar no Google Maps (https://apify.com, plano grátis dá crédito). Sem ele dá para importar o JSON do Apify |
| `GOWA_URL`, `GOWA_BASIC_AUTH` | passo 2.3 |
| `OPENAI_*`, `GEMINI_*` | opcional, a IA do agente. Sem chave ele trabalha só com as regras (grátis) |

Reinicie o `npm run dev`, abra http://localhost:3000 e clique em **Entrar neste computador**.

### 2.3 WhatsApp (GOWA)

O executável **não vem no zip**. Siga `gowa/LEIA-ME.md` (baixar, renomear para `whatsapp.exe`, definir `GOWA_URL=http://localhost:3300`
e `GOWA_BASIC_AUTH=usuario:senha`) e o passo a passo completo em `docs/WHATSAPP.md`. Depois:

```bash
npm run gowa      # abre o http://localhost:3300 para ler o QR code com o chip dedicado
npm run worker    # o relógio que envia uma mensagem de cada vez
```

### 2.4 Ligar tudo de uma vez (Windows)

Duplo clique em `Ligar-sistema.bat`: abre o painel, o GOWA e o worker, cada um na sua janela. Em Mac/Linux, rode os três comandos
(`npm run dev`, GOWA e `npm run worker`) em três terminais.

## 3. Configure a SUA identidade antes de usar

No painel, **Configurações**: seu nome, marca, como você se apresenta, oferta, público, preço, prazo, política de pagamento,
sua chave Pix e seu WhatsApp. É isso que o agente fala em seu nome. **Enquanto não preencher, as mensagens saem com o nome do
Jonathan**: os padrões do sistema ainda são dos dele.

## 4. Adaptar com o seu Claude Code

Abra esta pasta no Claude Code e peça, por exemplo:

> Leia o CLAUDE.md e o README.md. Quero adaptar o sistema para mim: meu nome é X, minha marca é Y, eu vendo Z na cidade W.
> Troque os padrões, os textos e os testes, e rode `npm run typecheck` e `npm test` no fim.

O `CLAUDE.md` já diz onde está cada coisa (identidade, visual, oferta, cidade e fuso, nota dos leads) e quais regras de
segurança não podem ser quebradas.

## 5. Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | painel em http://localhost:3000 |
| `npm run dev:demo` | painel em modo demonstração na porta 3200, mesmo com o `.env.local` preenchido |
| `npm run worker` | worker de envio (precisa do painel no ar) |
| `npm run gowa` | sobe o GOWA (precisa de `gowa/whatsapp.exe`) |
| `npm run typecheck` / `npm run lint` / `npm test` | conferências |
| `npm run build` / `npm start` | versão de produção (exige Supabase configurado) |

## 6. O que NÃO vem neste zip (de propósito)

As chaves e o banco do Jonathan, a sessão do WhatsApp dele, o executável do GOWA, as conversas e os leads reais (o
`docs/APRENDIZADOS.md` foi trocado por um resumo, e os nomes de leads que apareciam em testes e documentos foram trocados por
nomes fictícios). Você começa com tudo vazio e só com as suas próprias contas.

Mais detalhes: `README.md` (visão geral e segurança), `docs/WHATSAPP.md`, `docs/AGENTE.md`, `docs/MULTI-NUMERO.md`,
`docs/PREVIAS.md` e `docs/VPS-COOLIFY.md` (para deixar rodando num servidor).
