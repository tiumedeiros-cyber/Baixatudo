# REA — instalação e uso na metodologia

O REA é o motor de evidência para artefatos empacotados: Electron/ASAR, JavaScript,
web bundle, cenários de navegador, binários nativos e .NET. Nesta skill ele
tem dois papéis:

1. **Ferramenta** (`rea ...`) chamada pelo agente;
2. **Skill oficial** `reverse-engineer-anything`, que ensina o agente a usar as ferramentas
   e os formatos de evidência.

A skill `clonar-programa` não substitui a skill oficial; ela orquestra o processo de clone.
Sempre carregue/consulte `reverse-engineer-anything` antes de escolher comandos específicos
de um alvo.

## Instalação

```bash
node "$S/scripts/install-rea.mjs" --check                      # só diagnostica
node "$S/scripts/install-rea.mjs" --yes --client claude_code   # ou opencode, codex
```

O script faz, nesta ordem:

```bash
npm install -g rea-agents@latest     # só se o comando "rea" não existir (--version fixa a versão)
rea setup --yes --client claude_code --dry-run   # mostra o plano
rea setup --yes --client claude_code             # aplica
rea doctor --skill
```

Sem `--client`, use `--all-detected` (configura todo cliente detectado). Se um cliente aberto
(ex.: Claude Desktop) reescrever a configuração, feche-o ou use `--client <seu-cliente>`. O
script só retorna sucesso quando `identity.skill.state` é `aligned`/`installed`.

`rea setup` instala a skill oficial nos diretórios dos clientes detectados e registra o
servidor MCP. Reinicie o cliente.

Verificação manual:

```bash
rea --version
rea doctor
rea doctor --skill
```

## Ordem obrigatória: abrir antes de observar

Para runtime/UI, o REA exige um alvo aberto antes de qualquer `observe_*`/`capture_*`:

1. abrir o artefato/binário com a ferramenta de abertura (`open_binary` no MCP ou
   `analyze`/`inspect` no CLI);
2. só então chamar `observe_native_ui`, `observe_javascript_runtime`, `capture_*` etc.;
3. fechar a sessão (`close_binary`) ao terminar, para não vazar target/sessão.

Se a mensagem for “No app is open. Ask the user which app to investigate”, quase sempre é
ordem de chamada, não falta de informação do usuário.

## Fluxo para Electron/ASAR

1. Ache o app instalado e o `app.asar` (ver `desktop.md`).
2. Registre caminho + SHA-256.
3. Rode a análise do processo principal:

```bash
rea analyze-javascript-application "<app.asar>" \
  --source-path out/main/index.js \
  --format json > "$W/02-rea/main.json"
```

4. Se o renderer importar, analise também `out/preload/index.js` e os bundles do renderer
   (um `--source-path` por arquivo).
5. Projete views legíveis:

O `inspect-analysis-view` recebe **um JSON de "workflow"** (inline ou arquivo), não o resultado
bruto da análise. Monte o JSON com o `jq` (ou peça à LLM um pequeno script Node):

```bash
jq -c '{source: {kind: "inline", evidence: .}, view: {kind: "summary"}}' "$W/02-rea/main.json" > "$W/02-rea/main-view-input.json"
rea inspect-analysis-view "$W/02-rea/main-view-input.json" --format md > "$W/02-rea/main-view.md"
rea inspect-analysis-view --help
```

6. Gere o ledger de obrigações de reconstrução, quando aplicável:

Os dois comandos abaixo também recebem um JSON de workflow (arquivo ou inline). Veja o formato
com `--schema` antes de usar:

```bash
rea build-reconstruction-obligation-ledger --schema
rea evaluate-reconstruction-coverage --schema
```

O JSON pode ser enorme (centenas de MB). Ele fica em `02-rea/` fora do git; versiona-se o
resumo em Markdown e o hash.

### O que o grafo dá e o que não dá

- Dá: módulos, imports, chamadas, canais IPC estáticos, queries SQL, endpoints, strings.
- Não dá: IPC registrado dinamicamente, `eval`, plugins carregados em runtime, segredos,
  comportamento visual, regras de negócio inferidas.
- Números de nós/arestas são **cobertura estática**, não prova de que a função existe em
  runtime.

## Fluxo para web

### 1. Captura de cenário com Playwright (dentro do REA)

Crie `02-rea/scenario.json`:

```json
{
  "browser": {
    "mode": "launch",
    "executable_path": "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "headless": true
  },
  "start_url": { "url": "https://example.com", "query": [] },
  "environment": {
    "viewport": { "width": 1440, "height": 900, "device_scale_factor": 1 },
    "locale": "pt-BR",
    "timezone": "America/Sao_Paulo",
    "color_scheme": "light",
    "reduced_motion": "reduce",
    "service_workers": "block"
  },
  "actions": [
    { "step_id": "wait", "action": "wait_for_timeout", "duration_ms": 3000 }
  ],
  "capture": {
    "after_each_step": [],
    "at_end": ["screenshot", "dom", "accessibility", "url", "history", "storage"],
    "events": ["console", "page-errors", "network"],
    "network": { "request_body": true, "response_body": false, "header_values": false }
  }
}
```

Rode:

```bash
rea capture-browser-scenario "$W/02-rea/scenario.json" --format json > "$W/01-evidence/web/capture.json"
```

Para clicar/preencher, adicione ações `click`, `fill`, `press`, `select_option`, `check`,
`wait_for` com locators `role`, `test_id` ou `css`. Use `secret` para valores sensíveis
(nunca inline).

### 2. Analisar o bundle

O cenário retém scripts; exporte:

```bash
rea export-web-scripts "<caminho-absoluto-de-$W>/01-evidence/web/capture.json" "<caminho-absoluto-de-$W>/02-rea/web-scripts"
```

Os dois caminhos precisam ser **absolutos**, e a pasta de saída (`web-scripts`) **não pode existir
ainda**: o REA a cria.

Se você já tem um Chrome com CDP:

```bash
rea list-browser-targets "http://127.0.0.1:<porta>" --allowed-origins https://example.com
rea analyze-web-bundle "http://127.0.0.1:<porta>" <targetId> \
  --allowed-origins https://example.com --format json > "$W/02-rea/web-bundle.json"
```

### 3. Comparar versões/capturas

```bash
rea compare-web-captures <captureA.json> <captureB.json> --format md > "$W/05-verification/web-diff.md"
rea compare-web-screenshots <shotA.json> <shotB.json> --format md
```

Use para detectar mudança de layout, rota, texto e chamadas entre a versão congelada e o
clone.

## Evidência canônica

- `rea evidence-export` valida e exporta um bundle canônico.
- `rea evidence-import` importa um bundle local.
- `rea compare` compara dois bundles canônicos.

Mantenha em `01-evidence/` o índice, o hash e o bundle canônico. O JSON bruto pode ficar
fora do versionamento quando for muito grande.

## Erros comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| `rea: command not found` | pacote global ausente | `npm i -g rea-agents` |
| skill não aparece no agente | `rea setup` não rodou ou cliente não reiniciou | rode setup e reinicie |
| análise JS vazia | `--source-path` errado ou ASAR extraído | confira caminho relativo ao root |
| IPC ausente | registro dinâmico/`eval` | complemente com runtime/captura |
| output gigante | grafo completo | use `--filter-output`, views e resumos |
| browser não sobe | executável absoluto inválido | passe o caminho completo do Chrome/Edge |

## Regra de ouro

Não use o REA para “provar” comportamento que você não viu. Use-o para localizar onde
olhar, depois confirme com captura, teste ou execução controlada.
