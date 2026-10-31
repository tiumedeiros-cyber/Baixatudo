# Editor Studio — SaaS de edição profissional (imagens + vídeos)

Plataforma SaaS completa de edição de mídia no navegador, com landing page de vendas, painel do cliente,
painel administrativo, checkout com reconhecimento de pagamento, editor com timeline profissional e a
ferramenta **Baixa Tudo** integrada (download de vídeos, imagens e áudios).

- **Produção:** https://editor-studio-editor-studio.vercel.app
- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Zustand · three.js · Web Audio · MediaRecorder
- **Backend:** Supabase (PostgreSQL + Auth + Storage) com RLS, Server Actions e Route Handlers
- **Deploy:** Vercel (build automático a partir do GitHub)

## O que está implementado de verdade

| Módulo | Recursos |
|---|---|
| Landing page | Hero, recursos, fluxo, seção Baixa Tudo, planos (dinâmicos do banco), depoimentos, FAQ, CTA, LGPD — responsiva, com menu sanduíche no mobile |
| Autenticação | Supabase Auth (e-mail/senha), middleware de sessão, rotas protegidas, bloqueio de conta |
| Painel do cliente | Visão geral com métricas, projetos, arquivos (upload real p/ Storage com fallback server-side), assinatura, perfil, suporte, atalho para o admin, menu sanduíche e botão sair no mobile |
| Plano por hora | Créditos de tempo (`es_time_credits`), barra de progresso no painel, consumo atômico via RPC com trava por conta + clamp de tempo, pacotes de 1h/5h/10h, aviso e bloqueio ao zerar o saldo, admin libera tempo de teste/bônus |
| Editor Studio | Canvas de preview WYSIWYG, timeline multi-trilha, arrastar/soltar, trim nas bordas, split (C/S), snap, zoom (Ctrl+rolagem), keyframes, undo/redo, autosave 2s, atalhos |
| Mídia | Vídeo, imagem, texto, formas, overlays (vinheta/grão/moldura), objetos 3D WebGL, transições (fade/slide/zoom/wipe/glitch/flash), filtros de cor |
| Áudio | Volume por clipe, mute do áudio original, fades, mixagem Web Audio, SFX/trilhas procedurais (whoosh, riser, impacto, lo-fi, cinematic) |
| Voz | TTS (texto → MP3 salvo no Storage e inserido na timeline) e STT (ditado → legendas + export .srt) |
| Exportação | Render local: MP4 (H.264), MOV (QuickTime), WebM/VP9 até 4K via `MediaRecorder`, GIF animado 480p/12fps codificado quadro a quadro (`gifenc`) e frame em PNG |
| Baixa Tudo | Central de downloads embutida (motor baixartudo.me), vídeo/áudio/foto/GIF, proxy assinado, "salvar na biblioteca" e histórico — sem extensão para instalar |
| Checkout | Stripe (Checkout Session + webhook assinado), Mercado Pago (preferência + webhook), modo demonstração, antifraude por score |
| Admin | Dashboard (MRR, receita, usuários, conversão), usuários, planos, pagamentos, biblioteca de assets, downloads, configurações, logs de auditoria |
| Segurança | RLS em todas as tabelas, RBAC no servidor, rate limiting, HMAC em URLs de download, headers de segurança, idempotência de webhooks, auditoria |

## Estrutura

```
app/
  page.tsx                  landing
  login/ cadastro/          auth
  dashboard/                painel do cliente (+ baixa-tudo)
  studio/[id]/              editor
  checkout/[slug]/          checkout
  admin/                    painel administrativo
  api/
    downloads/              Baixa Tudo (motor + proxy assinado)
    tts/                    texto → áudio
    webhooks/stripe|mercadopago
    bootstrap/              setup inicial do admin (desativar após uso)
    health/                 healthcheck
components/
  studio/                   store, timeline, preview, inspetor, biblioteca, export, áudio, 3D
  dashboard/ downloader/ checkout/ admin/ ui/
lib/                        supabase clients, auth, payments, tts, downloader, utils
supabase/migrations/        schema SQL completo (tabelas es_*)
```

## Banco de dados

Todas as tabelas usam prefixo `es_` (o projeto Supabase é compartilhado com outro app):

`es_profiles`, `es_plans`, `es_subscriptions`, `es_payments`, `es_projects`, `es_assets`,
`es_user_assets`, `es_conversions`, `es_downloads`, `es_audit_logs`, `es_settings`, `es_webhook_events`.

RLS ligado em todas; funções `es_is_admin()`, `es_is_active()`, trigger `es_handle_new_user` cria
perfil + trial automaticamente. Bucket público `media` com política de escrita por pasta do usuário.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | chave pública (anon/publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | usada apenas no servidor (admin, storage, webhooks) |
| `NEXT_PUBLIC_SITE_URL` | sim | URL pública (redirects e webhooks) |
| `APP_SECRET` | sim | HMAC das URLs de download e token do bootstrap |
| `DOWNLOAD_ENGINE_URL` | sim | motor do Baixa Tudo (padrão `https://baixartudo.me`) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | opcional | checkout Stripe real |
| `MERCADOPAGO_ACCESS_TOKEN` | opcional | checkout Mercado Pago (PIX/cartão) |
| `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` | opcional | TTS premium |
| `BOOTSTRAP_ENABLED` | opcional | habilita `/api/bootstrap` (desativar após criar o admin) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | opcional | usados pelo bootstrap |

Sem gateway configurado o checkout roda em **modo demonstração** (registra cobrança e ativa a
assinatura pelo mesmo fluxo), permitindo testar o SaaS de ponta a ponta.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

## Atalhos do editor

`Espaço` play/pause · `C`/`S` dividir no playhead · `Del` excluir · `←/→` 1 frame (`Shift` = 1s)
`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `Ctrl+D` duplicar · `Ctrl + rolagem` zoom da régua · `Home/End` início/fim.

## Avisos legais

A central Baixa Tudo deve ser usada apenas com conteúdo próprio, licenciado ou de domínio público.
Os assets procedurais (sons, transições, formas) são gerados pela própria plataforma.

## Plano por hora (detalhes técnicos)

- Tabela `es_time_credits` (RLS: cada usuário só lê o próprio saldo; escrita só via service_role).
- `es_consume_time(p_seconds)` — `security definer`, `pg_advisory_xact_lock` por usuário, `select ... for update`,
  e desconto limitado ao tempo realmente decorrido desde `es_profiles.time_last_tick` (máx. 120 s por chamada),
  impedindo consumo duplicado com várias abas ou chamadas forjadas.
- `/api/time` (GET saldo, POST heartbeat de 30 s feito pelo editor) e `components/studio/TimeGuard.tsx` (aviso + bloqueio).
- Assinantes (trial/ativo) usam o editor sem consumir horas; sem assinatura o editor exige saldo.
- Admin: `/admin/horas` libera tempo de teste/cortesia por usuário (ou bônus em lote) com auditoria em `es_audit_logs`.
