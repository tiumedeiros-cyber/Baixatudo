# Bibliotecas e APIs gratuitas adotadas (análise)

Revisão dos repositórios indicados — [topics/free](https://github.com/topics/free),
[topics/apis](https://github.com/topics/apis), [public-apis](https://github.com/public-apis/public-apis),
[awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted),
[awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers),
[sindresorhus/awesome](https://github.com/sindresorhus/awesome) e
[free-for-dev](https://github.com/ripienaar/free-for-dev) — com um filtro único: **só entra o que
funciona sem chave paga e sem servidor extra para o cliente**.

## O que entrou no sistema agora

| Fonte | Para que serve | Chave? | Onde aparece |
| --- | --- | --- | --- |
| **Wikimedia Commons** (`commons.wikimedia.org/w/api.php`) | Fotos, ilustrações e artes livres (CC / domínio público) em alta resolução | não | Painel → Recursos grátis → Fotos livres |
| **Internet Archive** (`archive.org`) | Músicas e áudios livres para trilha | não | Painel → Recursos grátis → Músicas |
| **Iconify** (`api.iconify.design`) | +200 mil ícones vetoriais (MIT/Apache/CC), SVG transparente | não | Painel → Recursos grátis → Ícones |
| **Pollinations** (`image.pollinations.ai`) | Geração de imagem por IA (fundo, cenário, produto) sem custo e sem marca d'água | não | Painel → Recursos grátis → Gerar com IA |
| **QR Server** (`api.qrserver.com`) | QR Code para anúncios e vitrines | não | Painel → Recursos grátis → QR Code |
| **Pollinations texto** | Roteiros e legendas dentro do editor | não | já integrado (avatares/roteiro) |
| **Vozes públicas (Edge)** | 84 vozes para narração dos avatares | não | já integrado |

Todos salvam em **Meus arquivos** (storage do usuário) e caem automaticamente na biblioteca do editor.
Cada item mostra licença e autor, e a rota `/api/free` só baixa de hosts conhecidos (não vira proxy aberto).

## O que foi avaliado e não entrou (e por quê)

- **Pexels, Pixabay, Unsplash, Giphy, Tenor, Jamendo, Freesound, remove.bg, DeepAI** — boas APIs, mas
  exigem chave própria/atribuição específica; ficaria `feature morta` sem conta paga. Podem ser ligadas
  depois cadastrando a chave em **Minhas integrações** (mesmo mecanismo da Kie AI).
- **Cobalt / yt-dlp self-hosted** — já temos o motor do **Baixa Tudo** (`baixartudo.me`) integrado.
- **Awesome-selfhosted (n8n, MinIO, Immich, Penpot…)** — exigem VPS. Nada disso melhora o editor do
  usuário final sem custo de infra; o que fazia sentido já está embutido (storage Supabase, render no navegador).
- **awesome-mcp-servers** — é para agentes/IDE, não para o produto.
- **Openverse** — endpoint público recusou as chamadas de teste (bloqueio de bot), então saiu para não
  deixar botão quebrado.
- **Listas `free` / `awesome` genéricas** — serviram de mapa: o que era útil para edição de vídeo/imagem
  já está coberto pelas 5 fontes acima + Baixa Tudo + TTS.

## Integrações pagas opcionais (chave do cliente)

A Kie AI (Kling Motion Control) e a Postiz continuam opcionais e agora podem ser configuradas
**por usuário** em *Painel → Minhas integrações*. O admin decide em *Admin → Configurações → Integrações
de IA*:

- `Usar a minha chave (admin) para os clientes` — liga/desliga a chave da plataforma;
- `Permitir que cada cliente cadastre a própria chave` — liga/desliga chaves de clientes.

Precedência: **chave do cliente → chave da plataforma → desligado**. Sem conflito de créditos.
