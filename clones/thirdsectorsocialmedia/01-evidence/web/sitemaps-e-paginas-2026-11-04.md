# Captura — Sitemaps e páginas do WordPress

- Ferramenta: fetch_page; data: 2026-11-04
- /sitemap.xml -> redireciona para /sitemap_index.xml (Yoast SEO)

## sitemap_index.xml (observado)
- post-sitemap.xml (2018) — blog antigo
- page-sitemap.xml (última modif. 2026-08-15) — páginas ativas
- plugins-sitemap.xml (2025-12), templates-sitemap.xml (2026-04), packs-sitemap.xml (2026-01) — custom post types (catálogos)
- category-sitemap.xml (2018), author-sitemap.xml (2025)
- _funcionalidade-, _nicho-, _segmento-sitemap.xml — taxonomias dos CPTs
Conclusão: WordPress + Yoast; existem catálogos de plugins/templates/packs, mas a home é LP one-page.

## page-sitemap.xml (chunk 0 de 8 — amostra)
- Páginas reais amostradas: /pacote-templates-flyers/ (2020), /clube-digital-pro-cursos-templates-e-ferramentas-para-construir-um-negocio-online-de-sucesso-2/ (2024)
- O mapa inclui muitas URLs de /wp-content/uploads/ (sitemap com imagens) e uso de webp-express.

## /pacote-templates-flyers/ (chunk 0 de 3 — LEGADO)
- Título: "SUPER PACOTES EXCLUSIVOS ... - Clube Digital PRO | Cursos, Templates e Ferramentas..."
- Estilo 2019/2020: "CLUBE PREMIUM PARA DESIGNERS...", grid de boxes/packs por nicho, CTA linkando para bit.ly externo.
- Interpretação: identidade anterior do domínio ("terceiro setor social media" -> clube de artes). Não faz parte do funil ativo da home.

## Stack observado (indícios)
- WordPress + Elementor (uploads/elementor/thumbs), webp-express, Yoast.
- Checkout fora do WP: subdomínio seguro.thirdsectorsocialmedia.com apontando para plataforma Yampi.
- Link do CTA da home usa curto interno /r/<TOKEN> que redireciona para /checkout?tokenReference=...
