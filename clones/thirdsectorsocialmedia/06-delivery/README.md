# Clone de estudo — "Clube Digital Pro" (alvo: thirdsectorsocialmedia.com)

Clone **só de comportamento**: mesma estrutura de funil, copy e assets 100% próprios.
Material didático, não afiliado ao alvo, sem cobrança real.

## Rodar
```bash
cd 04-build/site
python3 -m http.server 8000 --bind 0.0.0.0   # ou: npx serve .
```
Abrir `/` (landing) e `/checkout.html` (checkout demo).

## Estrutura do workspace
- `00-intake/INTAKE.md` — entrevista e restrições do ambiente.
- `01-evidence/` — capturas da home, do checkout e dos sitemaps (fetch_page; SHA-256 indexados).
- `03-spec/` — `REA.md` (arquitetura observado/inferido/não verificado), `FEATURES.md`, `CLONE-PLAN.md`.
- `04-build/site/` — o clone (HTML + CSS + JS puro; fontes OFL locais; sem CDN).
- `05-verification/` — `node --test` (14/14) e paridade de matriz `compare-behavior.mjs` (38/38, `parity/diff.json`).
- `06-delivery/` — este README + `PROVENANCE.md`.

## Fluxo principal (P0)
Home → CTA → Checkout passo 1 (nome/e-mail/CPF/WhatsApp; erro de e-mail cadastrado com link de
login; banner −5% Pix; contador 07:00) → passo 2 (Pix/cartão/boleto, cupom CLUBE5/EXPIROU, resumo,
total) → tela de sucesso demo (pedido fictício). Rascunho salvo em localStorage.

## O que ficou de fora
Pagamentos reais, área de membros, catálogos CPT do WordPress, páginas legadas 2019–2020,
pixel diff com navegador (indisponível no sandbox — ver VERIFICATION.md).

## Testar
```bash
node --test 05-verification/logic.test.mjs 05-verification/site.test.mjs
node ../../clonar-programa/scripts/compare-behavior.mjs \
  --expected 05-verification/parity/target.json --actual 05-verification/parity/clone.json
```
