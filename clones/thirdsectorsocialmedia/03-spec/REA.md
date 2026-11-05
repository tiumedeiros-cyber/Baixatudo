# REA — arquitetura reconstruída (observado / inferido / não verificado)

Sem REA no sandbox (Node abaixo do mínimo e sem acesso a nodejs.org). Reconstrução por inspeção
das evidências de 01-evidence. O alvo é um **funil de vendas one-page**, não um sistema multi-tela.

## Observado (tem evidência)
- CMS: WordPress (sitemaps Yoast, /wp-content/uploads/, Elementor thumbs, webp-express).
- Home = landing page única com ~12 seções (hero → oferta → marquees → problema → features →
  bônus → comunidade → depoimentos → condição de preço → garantia → FAQ → CTA final).
- Conversão: todos os CTAs apontam para `seguro.thirdsectorsocialmedia.com/r/<TOKEN>`, que
  redireciona para `/checkout?skipToCheckout=1&tokenReference=<TOKEN>` — checkout hospedado na
  Yampi (2 passos: Identificação → Pagamento), com contador regressivo, cupom, Pix -5%,
  validação de e-mail duplicado com opção de login, depoimentos no passo 2.
- Preço único R$27; garantia 7 dias; formas Pix/cartão/boleto.
- Páginas legadas (2019–2020) de produto antigo ("Clube Digital PRO" de artes/flyers) ainda indexadas.
- Catálogos em CPT (plugins, templates, packs) com taxonomias nicho/segmento/funcionalidade.

## Inferido (plausível, sem prova direta)
- Página construída com Elementor; marquees são carrosséis auto-loop; FAQ é accordion.
- /r/<TOKEN> é um redirecionador interno para rastrear a origem da venda.
- "E-mail já cadastrado" implica conta na plataforma de checkout (login/link).

## Não verificado (limitações do sandbox)
- Cores, fontes, espaçamentos, layout exato (sem CSS/screenshots).
- Regras de cupom, máscaras de CPF/WhatsApp, comportamento pós-pagamento (e-mail de acesso).
- Existência/conteúdo de páginas legais (política de privacidade) fora do checkout.

## Canais e dados (para o clone)
- Sem backend no clone: formulário do checkout é simulado (demo), validação no cliente.
- Nenhum dado real trafega para terceiros. Cupom: regra própria documentada em FEATURES.md.
