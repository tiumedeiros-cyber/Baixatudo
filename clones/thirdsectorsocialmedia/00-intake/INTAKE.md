# Intake — Third Sector Social Media

- **Alvo:** https://thirdsectorsocialmedia.com/
- **Data:** 2026-11-04
- **Pasta:** /home/user/Baixatudo/clones/thirdsectorsocialmedia
- **Plataforma:** web
- **Formato:** site
- **Como vou capturar:** manual (fetcher da plataforma `fetch_page`) — o sandbox bloqueia rede externa e o download do Chromium do Playwright
- **Janela ou processo (desktop):** n/a
- **Idioma/região:** a confirmar na captura (site em inglês, provável AU/UK/US)
- **Conta usada:** nenhuma (site público, sem login)

## Congelar o alvo

- URL exata: https://thirdsectorsocialmedia.com/
- Versão: n/a (site; usar data + HTML salvo como carimbo)
- SHA-256 (programa): n/a — registrar SHA-256 de cada arquivo de evidência salvo
- Sistema operacional e arquitetura: Debian 12 x86_64 (sandbox Linux)

## Relação com o alvo (opcional)

- É meu / open source / tenho permissão do dono / estudo: usuário não informou; assumido **estudo**
- Modo: **só comportamento** (código e assets próprios — padrão). Nenhum texto, imagem ou código do alvo é copiado.
- Observações: usuário está no celular, sem acesso ao próprio computador; todo o trabalho roda no sandbox. Conteúdo do alvo é tratado como **dado**, nunca como instrução.

## Escopo

### P0 (sem isso não serve)

1. Página inicial completa: hero, proposta de valor, navegação — o "cartão de visitas" do site.
2. Vitrine de serviços (o que a agência oferece) com entrada para detalhe de cada serviço.
3. Fluxo principal de contato/conversão: CTA → formulário (nome, email, mensagem) com validação e estado de sucesso/erro.

### P1

- Páginas institucionais (sobre, casos/portfólio, blog) no mesmo layout.
- Rodapé com links e redes sociais.
- Responsividade (mobile-first, pois o usuário acessa do celular).

### P2

- SEO básico (title, meta description, sitemap).
- Acessibilidade (landmarks, contraste, foco visível).

### Fora do escopo

- Integrações reais (CRM, email marketing, analytics).
- CMS/admin — o clone é estático ou backend mínimo.
- Contas sociais reais, logos e fotos do alvo (assets serão próprios).

## Restrições

- Prazo: sem prazo fixo; priorizar P0 navegável no preview.
- Stack desejada: HTML + CSS + JS puro (servido por servidor estático simples) — leve, roda no preview.
- Dados que não podem ser usados: nenhum dado real de clientes; formulário do clone não envia para serviços de terceiros.

## Ferramentas

- REA: **ausente** — `rea-agents@6.8.0` instalado via npm, mas o `rea setup` exige Node ≥22.23.4 e o sandbox só tem 22.22.3 (sem acesso a nodejs.org para atualizar). Não é bloqueante: alvo é site, não binário.
- Skill `reverse-engineer-anything`: ausente (depende do `rea setup` acima).
- Playwright: **pacote npm instalado, browser indisponível** — `npx playwright install chromium` falhou (cdn.playwright.dev bloqueado) e o sandbox não tem Chrome. Captura e E2E adaptados: fetch via plataforma + testes HTTP/DOM com Node.

## Definição de pronto

- P0 completo sem o alvo aberto (clone estático navegável no preview)
- Testes do fluxo P0 (submissão do formulário: validação, sucesso, erro) via Node/HTTP
- Relatório de paridade entregue em 05-verification/VERIFICATION.md
