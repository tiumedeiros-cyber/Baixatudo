# Prospecta — painel na nuvem (grátis) e WhatsApp no seu PC

Este guia é o caminho que **este** pacote já está seguindo: o **painel** roda na nuvem (Vercel, plano grátis) e o
**WhatsApp (GOWA) + worker** continuam no seu computador, porque um programa que fica logado no WhatsApp precisa de
uma máquina sempre ligada — e não dá para fazer isso na Vercel.

Nenhum passo abaixo custa dinheiro. Tudo é plano grátis: Vercel Hobby, Supabase Free e o GOWA (programa livre).

---

## 1. O que já está no ar

| Peça | Onde | Estado |
|---|---|---|
| Código do painel | repositório `tiumedeiros-cyber/Baixatudo`, pasta `prospecta/` | ✔ publicado |
| Deploy do painel | Vercel, projeto **prospecta** (raiz `prospecta`) | ✔ build e deploy OK |
| Banco + login | Supabase, região São Paulo | ⏳ pendente (cota do plano grátis) |

Endereço do painel: **https://prospecta-editor-studio.vercel.app**

> Enquanto o banco não estiver ligado, o painel publicado mostra uma mensagem de configuração incompleta — isso é
> proposital: o sistema **recusa abrir sem login** quando está em produção. Ele nunca cai no modo demonstração na
> nuvem.

---

## 2. Ligar o banco (Supabase) — 5 minutos

1. Abra https://supabase.com/dashboard e crie o projeto (plano **Free**, região **South America (São Paulo)**).
   E-mail do dono: o seu. Guarde a senha do banco no gerenciador de senhas.
2. **SQL Editor → New query**: cole todo o conteúdo de `prospecta/supabase/TUDO-EM-UM.sql` e clique em **Run**.
   (São as 7 migrações juntas; rode uma vez, num projeto vazio.)
3. **Authentication → Sign In / Providers**: desligue *Allow new users to sign up* (só você entra).
4. **Authentication → Users → Add user → Create new user**: coloque **o seu e-mail** e uma senha forte
   (marque *Auto Confirm User*). É com esse e-mail e senha que você entra no painel publicado.
5. **Project Settings → API Keys**: copie a **URL do projeto**, a chave **publishable** (a pública, antiga "anon")
   e a chave **secret** (a privada, `sb_secret_…`).

### Variáveis na Vercel

Vercel → projeto **prospecta** → Settings → Environment Variables (marque os três ambientes):

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | `https://SEU-REF.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | a chave publishable |
| `SUPABASE_SECRET_KEY` | a chave **secret** (só existe no servidor — nunca vai ao navegador) |
| `OWNER_EMAIL` | o e-mail que você criou no passo 4 |
| `SESSION_SECRET` | invente: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `WORKER_TOKEN` | invente: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `WA_WEBHOOK_SECRET` | invente outro igual ao de cima |
| `SITE_URL` | `https://prospecta-editor-studio.vercel.app` (usado no link das prévias enviadas aos leads) |
| `APIFY_TOKEN` | opcional: busca no Google Maps (apify.com, tem crédito grátis) |

Depois de salvar, faça **Redeploy** (Deployments → ⋯ → Redeploy) para o painel pegar as variáveis.

> **Atenção:** assim que o painel estiver publicado, o botão "Entrar neste computador" **não funciona** — ele só vale
> em localhost. Na nuvem você entra com **e-mail e senha** (passo 4). É assim de propósito: quem abrir o endereço sem
> sua senha não vê nada.

---

## 3. WhatsApp no seu PC (quando quiser enviar)

O painel publicado pode tudo, menos falar direto com o WhatsApp. Quem fala é o **GOWA**, no seu computador:

1. Baixe o GOWA (Windows) em https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases
   (a versão conferida é a **9.6.0**) e coloque o executável em `prospecta/gowa/whatsapp.exe`.
2. Na pasta `prospecta`, crie o `.env.local` a partir do `.env.example` e preencha **só** o que o PC precisa:

```
WORKER_TOKEN=o-mesmo-valor-que-voce-colocou-na-Vercel
WA_WEBHOOK_SECRET=o-mesmo-valor-que-voce-colocou-na-Vercel
SUPABASE_URL=https://SEU-REF.supabase.co
SUPABASE_SECRET_KEY=a-chave-secret
GOWA_URL=http://localhost:3300
GOWA_BASIC_AUTH=usuario:senha-que-voce-inventa
PANEL_URL=https://prospecta-editor-studio.vercel.app
```

3. `npm install` (uma vez) e depois, em duas janelas:

```bash
npm run gowa     # abre http://localhost:3300 para ler o QR code do chip dedicado
npm run worker -- --url=https://prospecta-editor-studio.vercel.app
```

O worker **não** precisa que o painel esteja rodando no seu PC: ele conversa com o painel publicado. O GOWA avisa o
painel de cada resposta pelo webhook (`PANEL_URL/api/webhooks/wa`).

> ⚠️ O GOWA usa o protocolo **não oficial** do WhatsApp: isso viola os Termos de Serviço e **pode banir o número**.
> Use um **chip dedicado que você aceite perder**. O sistema nasce pausado e em simulação: nada sai até você liberar
> nas Configurações do painel, e cada mensagem passa por aprovação (modo copiloto).

---

## 4. Primeiro acesso

1. Abra https://prospecta-editor-studio.vercel.app → entre com **e-mail e senha** do Supabase.
2. Vá em **Configurações** e troque os dados do autor pelos seus: nome, marca, apresentação, oferta, preço, prazo,
   Pix e WhatsApp. **Enquanto não trocar, as mensagens saem com o nome do autor original.**
3. No **Caçador**, digite cidade e nicho (ex.: "Joaçaba" + "barbearia") — precisa de `APIFY_TOKEN`, ou importe o JSON
   exportado do Apify.
4. Funil → Fila → Conversas: aprove os leads, revise cada mensagem e só então libere o envio.

---

## 5. Custos, limites e cuidados

- **Vercel Hobby**: grátis para uso pessoal; limite de uso comercial pela licença Hobby e cota mensal de execução.
  O `SUPABASE_SECRET_KEY` fica só nas variáveis do servidor (nunca no navegador).
- **Supabase Free**: 2 projetos por organização, 500 MB de banco. Projetos grátis **pausam sozinhos após ~1 semana**
  sem uso — basta abrir o dashboard e restaurar (Restore) quando for usar.
- **Apify**: só gasta se você usar o Caçador; o teto por busca (padrão US$ 1,00) vem nas Configurações.
- **IA do agente**: opcional. Sem chave, o agente responde só com as regras do playbook (grátis). Com Gemini grátis
  ou OpenAI paga, a IA reescreve as respostas, com a trava que confere preço, prazo, link e Pix.

## 6. Manutenção

- Deploy novo: qualquer push na branch `arena/e6b237c7-baixatudo` (o projeto está ligado a ela) gera deploy automático.
- Atualizar o sistema para o `main` depois que esta branch for mesclada: Vercel → Settings → Git → Production Branch.
- O `.env.local` e a pasta `gowa/storages` **nunca** vão para o Git: a sessão do WhatsApp equivale a estar logado no
  número.
