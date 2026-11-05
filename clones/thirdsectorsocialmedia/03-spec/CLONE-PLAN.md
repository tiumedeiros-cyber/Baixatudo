# CLONE-PLAN — como o clone será feito (stack e marcos próprios)

## Stack
- Site estático: HTML + CSS + JS puro (ESM), sem framework, sem build.
- Lógica de validação/preço isolada em `logic.js` para testar em Node (`node --test`).
- Fontes OFL via @fontsource (instaladas do npm do sandbox). Imagens: SVGs próprios, gerados aqui.
- Servido localmente para preview (http.server bind 0.0.0.0). "Compra" é DEMO: sem rede externa.

## Mapa alvo → clone
| Componente do alvo | Componente nosso |
|---|---|
| LP WordPress/Elementor (home) | index.html seções equivalentes, copy 100% reescrita |
| Marquees de cards | .marquee CSS + duplicação por JS, pausa em hover/reduced-motion |
| FAQ | details/summary + JS (um aberto por vez) |
| CTA -> /r/TOKEN -> Yampi | CTA -> checkout.html (demo interna) |
| Yampi checkout 2 passos | checkout.html passo 1/2 com estados vazio/erro/sucesso |
| Validação e-mail duplicado | lista simulada ["test@test.com"] no logic.js |
| Cupom Yampi | regra própria CLUBE5/EXPIROU em logic.js |
| Pix -5% | desconto calculado em logic.js, exibido no resumo |
| Contador "Oferta termina em" | countdown 07:00 no cliente (demo, reinicia a cada visita) |
| Depoimentos prints reais | cards sintéticos rotulados "fictícios" |
| Selo formas de pagamento | SVG próprio pix/cartão/boleto |
| Página legacy /pacote-templates-flyers/ | não clonada (fora do escopo) |

## Marcos
- M0 esqueleto: index com todas as seções + checkout com 2 passos navegáveis. (esta fase)
- M1 contratos/erros: validações, cupom, Pix, estados vazio/erro/sucesso, rascunho localStorage.
- M2 P1: marquees, FAQ acessível, depoimentos, responsivo fino.
- M3 polimento: metas/OG, reduced-motion, contraste, testes de paridade + relatório.

## Riscos
- Sem CSS/screenshots do alvo: visual é reinterpretação, não réplica pixel — declarado no relatório.
- Comportamentos não observáveis (pós-pagamento, e-mail de acesso): fora; nada é inventado como "igual".
