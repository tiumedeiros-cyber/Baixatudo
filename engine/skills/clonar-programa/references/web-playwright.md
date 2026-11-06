# Captura web com Playwright

Use quando precisar do primeiro retrato de uma página, de uma área logada ou de testes E2E do
clone. O REA também usa Playwright (`capture-browser-scenario`) para fluxos com cliques; os
dois se complementam (veja [`rea.md`](rea.md)).

## Preparar

Na sua **pasta de trabalho** (a pasta de onde você roda os scripts; os clones ficam em `clones/` dentro dela):

```bash
npm init -y
npm i -D playwright
npx playwright install chromium
```

Alternativa leve: `npm i -D playwright-core` + Chrome/Edge do sistema (`--browser "<caminho>"`).

## O script da skill

```bash
node "$S/scripts/capture-web.mjs" --url "https://exemplo.com" --out "$W/01-evidence/web" --name home
```

| Flag | Efeito |
|---|---|
| `--url` | URL inicial (obrigatória, `http` ou `https`) |
| `--out` | pasta de saída (padrão `./01-evidence/web`) |
| `--name` | prefixo dos arquivos (padrão `page`) |
| `--storage` | `auth.json` salvo pelo `playwright codegen` (área logada) |
| `--bodies` | salva corpos de requisições `fetch`/`xhr` (até 60, redigidos) |
| `--browser` | caminho do Chrome/Edge a usar |
| `--headed` | abre o navegador visível |
| `--timeout` | tempo de navegação em ms (padrão 45000) |

Saídas (`<name>-…`): `full.png`, `viewport.png`, `narrow.png` (390 px de largura; só
redimensiona a janela, não emula celular), `page.html`, `page.txt`, `aria.txt`,
`elements.json` (botões, links, campos, caixas), `network.json` (URL, método, status, tipo,
tamanho), `console.json`, `storage.json` (só nomes e tamanhos), `performance.json`,
`api-bodies.json` (com `--bodies`) e `manifest.json`.

O `manifest.json` guarda URL redigida, data, versões do Playwright e do navegador, avisos e
os hashes dos arquivos. Códigos de saída: 0 ok · 2 uso · 3 Playwright ausente · 4 navegador
não abriu · 5 a página não carregou.

**Redação.** Tokens, JWT, senhas, cookies e parâmetros sensíveis da URL viram `[redacted]`.
É "melhor esforço": confira o HTML e os corpos antes de compartilhar, principalmente em
captura logada (pode haver nome e e-mail da pessoa).

## Área logada

```bash
npx playwright codegen --save-storage="$W/auth.json" "https://exemplo.com/login"
```

Faça o login à mão, feche o codegen e use `--storage "$W/auth.json"`. Use a **sua** conta.
Salve o `auth.json` **dentro do workspace do clone** (`$W`): o `.gitignore` que o `new-clone.mjs`
cria ali já o ignora. Nunca versione esse arquivo.

## Fluxos e estados

O script captura **um estado por execução**. Capture pelo menos: lista vazia; criação
(formulário vazio, erro de validação, sucesso); edição; exclusão; busca sem resultado;
loading e erro de rede; largura de desktop e estreita; teclado e foco. Rode uma vez por
URL/estado (use `--name`) ou monte um cenário com cliques no REA (`capture-browser-scenario`).

## Seletores para os testes do clone

Prefira, nesta ordem: `getByRole(role, {name})`, `getByLabel`/`getByPlaceholder`/`getByText`,
`data-testid`, CSS. Registre o seletor na spec; o clone deve expor os mesmos rótulos.

## SPA, iframe e shadow DOM

- O script espera `networkidle` e cai para `domcontentloaded` (aviso no manifest).
- iframe: `page.frameLocator('iframe…')`. Shadow DOM aberto: o Playwright atravessa.
- WebSocket: o script não captura frames; use o REA ou `page.on('websocket')`.

## Screenshot diff

```bash
npx playwright screenshot --viewport-size=1440,900 "https://alvo" alvo.png
npx playwright screenshot --viewport-size=1440,900 "http://localhost:3000" clone.png
```

Compare com `rea compare-web-screenshots` (ou `pixelmatch`, que você precisa instalar) e
**revise com os olhos**: diferença de fonte e antialiasing não é falha funcional.

## Testes de paridade do clone

Instale o runner na pasta do clone: `npm i -D @playwright/test`.

```js
import { test, expect } from '@playwright/test';

test('cria projeto e vê na lista', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.getByRole('button', { name: 'Novo projeto' }).click();
  await page.getByLabel('Nome').fill('Teste');
  await page.getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByText('Teste')).toBeVisible();
});
```

Rode contra o **clone**. O alvo serve para gerar a expectativa; o teste prova o clone.

## Limites

- Não capture dados de clientes, pagamentos ou conteúdo pago.
- Não contorne CAPTCHA, login ou anti-bot.
- O script não injeta cookies de terceiros e não baixa vídeo.
- Página com muitas imagens gera full-page grande; use `--name` por estado.
