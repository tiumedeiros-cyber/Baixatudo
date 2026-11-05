# VERIFICATION — relatório de paridade (honesto, por funcionalidade)

Fontes: `node --test` (14/14 ✓), `compare-behavior.mjs` (38 valores, 0 diferenças — `parity/diff.json`),
evidências em `01-evidence/`. Legenda: **igual / parcial / ausente / não testado**.

| # | Funcionalidade | Status | Observações |
|---|---|---|---|
| F1 | LP one-page, 14 seções na ordem observada | **parcial** | Estrutura e hierarquia iguais; copy 100% reescrita (modo só comportamento); visual é reinterpretação — não havia CSS/screenshots do alvo. |
| F2 | CTAs → checkout | **igual** | Todos os CTAs apontam para o checkout (teste `CTAs da home levam ao checkout` ✓). |
| F3 | Checkout 2 passos | **igual (superfície) / parcial (regras)** | Labels, botões, ordem, estados "Cupom adicionado", erro "E-mail já cadastrado!…faça login.", banner 5% Pix, resumo, garantia 7 dias, contador 00:07:00 — paridade 38/38. Regras de cupom/validação (CPF com dígito verificador, máscaras, rascunho localStorage) são **contrato próprio**, não verificado no alvo. |
| F4 | Marquees duplos | **parcial** | Auto-loop, pausa em hover e prefers-reduced-motion; velocidade/direção são escolhas nossas (alvo não medido). |
| F5 | FAQ 9 perguntas | **igual** | Quantidade e conteúdo equivalente (reescrito); accordion exclusivo = escolha nossa. |
| F6 | Depoimentos | **ausente (por decisão)** | Não replicamos prints/pessoas reais; só cards sintéticos rotulados como fictícios. |
| F7 | SEO/metas, fontes OFL, acessibilidade básica | **parcial** | skip-link, aria-live no resumo, :focus-visible, contraste AA no tema escuro. |
| — | Pixel diff / multi-navegador / mobile real | **não testado** | Sandbox sem browser (Playwright não pôde baixar Chromium; rede restrita). Rodar `npx playwright test` num ambiente com rede para fechar isso. |
| — | Fluxo pós-pagamento (e-mail de acesso) | **não verificado** | Fora do observável sem comprar; clone termina na tela de sucesso demo. |

## Testes executados
- `node --test 05-verification/logic.test.mjs 05-verification/site.test.mjs` → **14/14 passam** (validações, máscaras, cupom, totais Pix, countdown, HTTP/HTML do site, ausência de CDN externo).
- Paridade de matriz: `compare-behavior.mjs --expected parity/target.json --actual parity/clone.json` → **PASS**.

## Definição de pronto do INTAKE
- P0 navegação sem o alvo aberto: ✓ (servidor estático local).
- Contratos e erros com teste: ✓ (logic.test.mjs).
- Evidência indexada com data + hash: ✓ (EVIDENCE-INDEX.md).
- Relatório honesto: este arquivo.
