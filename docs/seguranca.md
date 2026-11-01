# Revisão de segurança — 01/11/2026

Teste feito contra a produção (https://editor-studio-one.vercel.app) sem sessão,
tentando abusar de cada rota pública, mais inspeção do banco (RLS) e do código.

## O que foi atacado e o resultado

| Tentativa | Resultado |
| --- | --- |
| `GET /api/free/proxy?u=http://169.254.169.254/latest/meta-data/` (SSRF para metadata da nuvem) | **bloqueado** — "Endereço não permitido" (lista branca de hosts) |
| `GET /api/free/proxy?u=<host qualquer>` | **bloqueado** — só Wikimedia, Archive, Iconify, Pollinations, QR, Art/LoC/Met |
| `GET /api/downloads/stream?u=fake&s=invalido` (link de download forjado) | **bloqueado** — "Assinatura inválida" (HMAC) |
| `GET /dashboard` e `GET /admin` sem sessão | **redireciona** para `/login?next=…` |
| `GET /api/motion/callback?job=<id>` sem token | **bloqueado** — exige assinatura HMAC (novo) |
| `GET /api/bootstrap` sem token | **bloqueado** — token comparado em tempo constante (novo) |
| Webhook Mercado Pago com corpo forjado | não confia no corpo: busca o pagamento na API do MP com o nosso token e ignora duplicados |
| Webhook Stripe | valida `Stripe-Signature` (HMAC + janela de 5 min) |
| Ler dados de outro usuário via API anon do Supabase | **bloqueado** por RLS (`user_id = auth.uid()` em todas as tabelas `es_*`) |

Verificação de RLS no banco: as 15 tabelas `es_*` estão com RLS ligado; as
políticas cobrem só o próprio usuário (`auth.uid()`) ou administrador
(`es_is_admin()`). `es_webhook_events` não tem política para `public` — só a
service role escreve.

## O que foi corrigido nesta rodada

1. **Callback de animação exigia nada.** Qualquer pessoa com um id de tarefa
   podia disparar chamadas ao provedor pago. Agora a URL de callback é assinada
   com HMAC (`signPayload`) e a rota recusa sem assinatura (401).
2. **`/api/free/proxy` era um proxy de banda ilimitada.** Agora: 120 req/min por
   IP, só `image/*`, `audio/*` e `video/*` (nada de HTML/JS de terceiros) e
   limite de 12 MB por arquivo.
3. **`/api/free/qr` e `/api/health/tools`** ganharam limite por IP (QR consome
   CPU; health bate em seis serviços externos).
4. **`/api/health/tools`** (novo diagnóstico) só devolve metadados — nunca o
   conteúdo dos arquivos.
5. **`/api/bootstrap`**: comparação do segredo agora é em tempo constante
   (`safeEqual`), para não vazar o token por diferença de tempo.
6. **Otimizador de imagens do Next** (`/_next/image`) estava aberto para
   qualquer host (`hostname: '**'`) — podia ser usado como proxy SSRF. Lista
   fechada para os hosts que realmente usamos.
7. **Cabeçalhos**: além de HSTS, `X-Frame-Options`, `nosniff` e
   `Referrer-Policy`, agora vão `Content-Security-Policy`
   (`frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`)
   e `Cross-Origin-Opener-Policy`. A CSP não restringe `script-src` de propósito:
   o editor usa WebAssembly e workers (Whisper, ffmpeg), e uma regra mais dura
   quebraria a ferramenta.

## Recomendações que dependem de você (não são código)

1. **Desligar o bootstrap** depois do setup: hoje `BOOTSTRAP_ENABLED=true` na
   Vercel. Desative quando não estiver usando.
2. **Senha do admin**: a conta usa `ADMIN_PASSWORD` do ambiente. Troque por uma
   senha longa e única; o painel não guarda senha em texto.
3. **Chaves de IA por usuário**: continuam criptografadas no banco
   (AES-256-GCM com `APP_SECRET`); se rotacionar `APP_SECRET`, as chaves antigas
   precisam ser cadastradas de novo.
4. **Rate limit é por instância** (memória). Com muito tráfego simultâneo, o
   limite real é maior que o configurado. Para blindagem séria, usar Upstash
   Redis — é gratuito no plano inicial.
