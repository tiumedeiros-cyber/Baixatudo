# Requisitos e instalação

O jeito mais fácil é colar o prompt de [`prompts/INSTALL-LLM.md`](../prompts/INSTALL-LLM.md)
na sua LLM. Este arquivo é para instalar na mão.

## Onde baixar

- Skill: https://github.com/darksemfiltro/clonar-programa
- ZIP: https://github.com/darksemfiltro/clonar-programa/releases/latest/download/clonar-programa.zip
- REA: https://www.npmjs.com/package/rea-agents

Sem Git: baixe o ZIP e extraia. Dentro dele há a pasta `clonar-programa/`; confirme que existe um `SKILL.md` nela. Se vier `.rar`,
extraia com 7-Zip/WinRAR (Windows) ou `unar` (macOS/Linux).

## Obrigatórios

| Requisito | Versão | Como instalar |
|---|---|---|
| Node.js | 18+ para os scripts; **22.19+ / 24.11+ / 26+ para o REA** (use a LTS atual) | Windows: `winget install OpenJS.NodeJS.LTS` · macOS: `brew install node` · Linux: pacote da distro ou NodeSource |
| npm | vem com o Node | — |

```bash
node --version
npm --version
```

Se o `npm install -g` pedir administrador no Windows, defina um prefixo de usuário:
`npm config set prefix "$env:APPDATA\npm"`.

## Recomendados

### REA + skill `reverse-engineer-anything` (para programas empacotados e bundles)

```bash
node scripts/install-rea.mjs --check
node scripts/install-rea.mjs --yes --client claude_code    # ou opencode, codex
```

Equivale a `npm install -g rea-agents@latest` + `rea setup --yes --client <cliente>`. Clientes
comuns: `claude_code`, `opencode`, `codex`, `cursor`, `gemini_cli`, `windsurf`. Versão mínima
testada: **6.7**. O REA exige Node 22.19+, 24.11+ ou 26+. Reinicie o agente depois.

### Playwright (para sites)

Na sua **pasta de trabalho** (a pasta de onde você roda os scripts; os clones ficam em `clones/` dentro dela):

```bash
npm init -y
npm i -D playwright
npx playwright install chromium
```

Alternativa leve: `npm i -D playwright-core` e usar o Chrome/Edge do sistema
(`--browser "C:\Program Files\Google\Chrome\Application\chrome.exe"`). Rode os scripts
`capture-web.mjs` a partir dessa pasta de trabalho.

### Git

Opcional. Útil para versionar o clone.

## Para captura desktop

- **Windows:** PowerShell 5.1 (já vem no sistema) para `capture-desktop.ps1`.
- **macOS / Linux:** veja [`desktop.md`](desktop.md).

## Conferir tudo

```bash
node scripts/doctor.mjs            # texto
node scripts/doctor.mjs --json     # para ferramentas
node scripts/doctor.mjs --strict   # sai com erro se faltar algo obrigatório
```

## Espaço, tempo e segurança

- Reserve de 2 GB (alvo pequeno) a 20 GB (alvo grande) para capturas, grafos e builds.
- Um app pequeno pode levar horas; um grande, dias.
- Use VM ou conta separada para rodar programa desconhecido.
- Grafos do REA podem ter centenas de MB: deixe-os fora do git e versione resumos e hashes.
