# FEATURES — inventário do alvo (por evidência) e prioridade do clone

Legenda: P0 = essenciais; P1 = importante; P2 = polimento. "Não faz" vale para o clone.

## F1. Landing page one-page — P0
- Seções (ordem observada): barra de condição → hero (headline, sub, preço, CTA, micro-nota) →
  selos (pagamento único/vitalício/comunidade) → card "Seu acesso inclui" (9 itens com tags) →
  card "Condição atual" (4 linhas) → 2 marquees de cards de produto → "A diferença na prática"
  (problema + comparativo antes/depois) → "Dentro da plataforma" → "Um arsenal, seis frentes"
  (6 feature cards) → "Bônus inclusos" (6 cards) → "Comunidade VIP" → "Quem já usa"
  (depoimentos) → "Condição atual de acesso" (oferta + CTA + selos + formas de pagamento) →
  Garantia 7 dias → FAQ (9 Q&A) → CTA final (2 botões).
- Estados: estático; scroll. Criterio: todas as seções renderizam mobile-first, texto próprio.

## F2. CTAs de compra — P0
- 4+ botões que apontam para o checkout do funil. No clone: apontam para /checkout.html (demo).
- Critério: clique em qualquer CTA leva ao checkout; âncora "voltar ao topo" não obrigatória.

## F3. Checkout em 2 passos — P0
- Passo 1 "Identificação" (1 de 2): nome completo*, e-mail* (+ erro "já cadastrado" com link de
  login), CPF*, WhatsApp*, checkbox opt-in e-mail, banner "5% off no Pix", botão "Ir para Pagamento",
  nota de privacidade; contador regressivo no topo.
- Passo 2 "Pagamento" (2 de 2): "Voltar"; escolha de forma (Pix/cartão/boleto); resumo do pedido
  (produto, Qtd 1, R$ 27,00, Total); cupom opcional ("Cupom (opcional)" + "Adicionar" + estado
  "Cupom adicionado"); depoimentos prev/next.
- Estados: vazio (campos), inválido (erro por campo), avançar (passo 2), sucesso (pedido demo).
- Validações (contrato próprio, espelhando o observado): nome ≥ 2 palavras; e-mail válido +
  lista de "cadastrados" simulada; CPF com dígitos verificadores; telefone BR 10–11 dígitos.
- Cupom (regra nossa, documentada): CLUBE5 → −R$5,00; expirado EXPIROU → erro; inválido → erro.
- Pix: −5% sobre o total (exibido "De R$X por R$Y").
- Critério: fluxo completo funciona sem rede; refresh mantém rascunho (localStorage — escolha nossa).

## F4. Marquees de produtos — P1
- 2 faixas com auto-loop horizontal, pausa em hover/reduced-motion; conteúdo = catálogo sintético.

## F5. FAQ accordion — P1
- 9 perguntas reescritas; acessível (button + aria-expanded); um aberto por vez (escolha nossa).

## F6. Depoimentos — P1
- Somente SINTÉTICOS e rotulados como fictícios no rodapé da seção. Sem prints reais de terceiros.

## F7. SEO/metas, fontes, cores — P2
- title/description/OG próprios; fontes OFL (Fontsource via npm); paleta própria (alvo não verificado).

## Fora do escopo do clone
- Integração real de pagamento/CRM/e-mail; login de cliente; área de membros; catálogos CPT do
  WordPress; páginas legadas 2019–2020; contagem regressiva "de verdade" com backend.
