# Guia completo: clonar um programa com método

Este guia explica **o porquê** por trás da skill `clonar-programa`: o que é engenharia reversa,
como o REA funciona, como cada fase da skill se encaixa e o que fazer quando algo trava.
O [`SKILL.md`](SKILL.md) é a instrução curta para a LLM; este arquivo é para você entender o
que ela está fazendo e conduzir melhor.

> **Como ler.** Se você é iniciante, leia os capítulos 1, 2 e 4 e vá direto para o 6 (web) ou
> o 7 (desktop). Volte aos outros quando precisar. Os capítulos 3 e 10 são de consulta.

## Sumário

1. [A ideia em 5 minutos](#1-a-ideia-em-5-minutos)
2. [Engenharia reversa: o que é e como pensar](#2-engenharia-reversa-o-que-é-e-como-pensar)
3. [REA a fundo](#3-rea-a-fundo)
4. [Como a skill funciona](#4-como-a-skill-funciona)
5. [Os scripts, um por um](#5-os-scripts-um-por-um)
6. [Passo a passo: clonar um site](#6-passo-a-passo-clonar-um-site)
7. [Passo a passo: clonar um programa desktop](#7-passo-a-passo-clonar-um-programa-desktop)
8. [Escrever uma spec que a LLM consegue implementar](#8-escrever-uma-spec-que-a-llm-consegue-implementar)
9. [Provar a paridade](#9-provar-a-paridade)
10. [Trabalhar bem com a LLM](#10-trabalhar-bem-com-a-llm)
11. [Uso responsável](#11-uso-responsável)
12. [Solução de problemas](#12-solução-de-problemas)
13. [Cola de comandos](#13-cola-de-comandos)
14. [Glossário](#14-glossário)

---

## 1. A ideia em 5 minutos

### O erro comum

Quase todo mundo começa assim: baixa o app, abre os arquivos, cola o código na LLM e pede
"faz igual". Dá três problemas:

- **Não escala.** Código minificado de 4 MB não cabe no contexto e a LLM inventa o que não vê.
- **Não é seu.** Você herda as decisões, os bugs e as dependências de outra pessoa.
- **Não prova nada.** Sem teste, "parece igual" é só impressão.

### O método

A skill troca "copiar" por quatro etapas:

```
EVIDÊNCIA  →  SPEC  →  CÓDIGO PRÓPRIO  →  PARIDADE
 o que eu     o que o     escrito a partir   prova de que
 observei     alvo faz    da spec            se comporta igual
```

1. **Evidência.** Você registra o que o alvo faz e como é feito: screenshots, rede, estrutura,
   arquivos, versão, hash.
2. **Spec.** Você descreve o comportamento em texto: telas, estados, contratos, erros.
3. **Código próprio.** A LLM implementa **a partir da spec**, não a partir do código do alvo.
4. **Paridade.** Testes comparam o clone com o alvo e dizem, funcionalidade por funcionalidade,
   o que está igual, parcial, ausente ou não testado.

### O que a skill faz e o que não faz

| Faz | Não faz |
|---|---|
| Conduz a entrevista e organiza a pasta de trabalho | Clonar sozinha com um clique |
| Captura sites e janelas de programas | Recuperar o que mora no servidor |
| Inventaria arquivos, hashes, tecnologia e licenças | Recuperar modelos de IA em nuvem |
| Orienta o uso do REA para análise profunda | Contornar login, paywall, DRM ou CAPTCHA |
| Dá templates de spec, plano e verificação | Garantir que o clone seja legal de distribuir |
| Compara comportamento do alvo e do clone | Substituir a sua revisão |

### Uma analogia

Pense em recriar a receita de um prato de restaurante. Você não entra na cozinha para roubar o
caderno do chef. Você prova o prato várias vezes, anota ingredientes aparentes, texturas e
tempos, escreve a sua receita e cozinha até um amigo não notar a diferença. A skill é o
caderno de anotações, o roteiro de degustação e o teste cego.

---

## 2. Engenharia reversa: o que é e como pensar

**Engenharia reversa** é descobrir como algo funciona a partir do produto pronto, sem ter o
projeto original. Em software, isso vai de "olhar a tela e anotar o que acontece" até "ler
instruções de máquina de um binário".

### 2.1 Caixa-preta, cinza e branca

| Nível | Você tem | Exemplo | Ferramentas típicas |
|---|---|---|---|
| **Caixa-preta** | só entradas e saídas | usar o site e anotar o que ele responde | navegador, Playwright, capture-web |
| **Caixa-cinza** | o que o programa entrega ao cliente | bundle JavaScript, `app.asar`, tráfego de rede | REA, DevTools, inventário |
| **Caixa-branca** | o código-fonte | um repositório open source | leitura direta; o REA nem é necessário |

A skill trabalha principalmente em caixa-preta e cinza. Se você tem o código-fonte completo
(é seu ou é open source), **não use REA**: leia o repositório. O próprio REA recomenda isso.

### 2.2 Estática e dinâmica

- **Análise estática:** estuda os arquivos **sem executar** o programa. É segura e repetível.
  Mostra módulos, imports, strings, endpoints, consultas SQL.
- **Análise dinâmica:** observa o programa **rodando**: rede, janelas, arquivos abertos,
  chamadas. Mostra o que realmente acontece, inclusive o que é montado em tempo de execução.

Uma não substitui a outra. A estática diz "existe um canal chamado `save-project`". A dinâmica
diz "quando eu clico em Salvar, ele é chamado com este payload". Uma regra do REA resume bem:
**análise estática não prova execução**.

### 2.3 Observado, inferido, não verificado

É a disciplina mais importante do método. Toda afirmação sobre o alvo cai em um destes baldes:

| Balde | Significa | Exemplo |
|---|---|---|
| **Observado** | você viu, com evidência | "POST /api/tasks retorna 201 com `{id, title}`" (captura `home-api-bodies.json`) |
| **Inferido** | conclusão razoável, falta teste | "provavelmente o id é um UUID" |
| **Não verificado** | hipótese | "talvez haja limite de 100 tarefas no plano grátis" |

Só o **observado** vira requisito direto. O **inferido** vira teste. O **não verificado**
fica anotado como pergunta. Isso evita a maior fonte de erro com LLM: a alucinação que
parece plausível.

### 2.4 Onde mora o "cérebro" do alvo

Antes de investir tempo, descubra quanto do produto você consegue enxergar:

| Categoria | Onde está a lógica | Quanto dá para recuperar | Exemplo |
|---|---|---|---|
| **A · local puro** | no programa instalado | muito | editor de texto, calculadora |
| **B · local com dados** | no programa + arquivos do usuário | muito, mas espalhado | app com banco SQLite local |
| **C · cliente fino** | na nuvem; o app só mostra | interface e contrato de API | app que é uma casca de site |
| **D · remoto puro** | no servidor | só o comportamento observável | SaaS tradicional |
| **E · modelo de IA** | em pesos ou serviço remoto | nada do modelo | chat com IA |

Em C, D e E **não existe arquivo para abrir**. O que você consegue é documentar o
comportamento e reconstruir o cliente. Um SaaS de e-mail clonado por esse método terá a
mesma tela e o mesmo fluxo, mas o motor de entrega, de spam e de busca será seu.

### 2.5 O que você consegue ver em cada tipo de alvo

**Site (cliente).** O navegador baixa HTML, CSS, JavaScript e dados. Tudo isso é visível:

- estrutura e texto (DOM, ARIA);
- estilos computados (cores, fontes, espaçamentos);
- chamadas de rede (URL, método, status e, se você capturar, corpo);
- JavaScript empacotado (muitas vezes minificado; às vezes com *source map*);
- armazenamento local (nomes das chaves de `localStorage`, cookies).

Não é visível: código do servidor, banco de dados, regras que só rodam lá, chaves privadas.

**Programa Electron.** É um site embrulhado em um executável. O núcleo fica em
`resources/app.asar`, um arquivo que agrupa o JavaScript do app:

- **main:** processo principal; abre janelas, acessa arquivos, fala com o sistema;
- **preload:** ponte controlada entre o main e a interface;
- **renderer:** a interface (HTML/CSS/JS), como um site;
- **IPC:** mensagens entre renderer e main. É o "contrato" interno do app.

Vantagem: o JavaScript costuma ser legível (às vezes minificado). Electron é onde o REA mais
rende.

#### O `app.asar` em 1 minuto

Você vai ver esse nome muitas vezes neste guia. Ele **não é da skill nem do REA: é do Electron**.

| Pergunta | Resposta |
|---|---|
| O que é? | um arquivo `.asar` junta a pasta inteira do app (JavaScript, HTML, CSS, `package.json`, imagens) em **um arquivo só**. É um formato simples, sem compressão e **sem criptografia**: um cabeçalho em JSON diz onde cada arquivo começa. |
| Onde fica? | normalmente em `resources/app.asar`, ao lado do executável (Windows e Linux), ou em `Contents/Resources/app.asar` (macOS). Alguns apps usam a pasta `resources/app/` em vez do arquivo. |
| Todo programa tem? | **não**. Só os feitos com Electron. Programas em .NET, Qt, Flutter, Tauri ou C++ não têm. |
| Por que importa? | num app Electron, **a lógica do programa está dentro dele**. É a melhor evidência que você consegue sem decompilar nada. |
| O que a skill faz com ele? | o `inventory-files.mjs` lê o cabeçalho e lista o que há dentro (arquivos, imagens, fontes, licenças). Isso alimenta a fase de assets. |
| O que o REA faz com ele? | o comando `analyze-javascript-application` aceita o caminho do `.asar` e reconstrói módulos, imports, canais IPC, endpoints e consultas SQL, **sem executar o app**. |
| Dá para abrir à mão? | sim: a ferramenta oficial `@electron/asar` extrai o conteúdo para uma pasta. Mexa sempre numa **cópia**. |
| Existe proteção? | o Electron tem um "fuse" de integridade que detecta se o `.asar` foi alterado. Isso protege contra adulteração, não esconde o conteúdo. O `inspect-electron-fuses` do REA mostra como o app está configurado. |

Resumindo: se o alvo desktop for Electron, o `app.asar` é o primeiro lugar para olhar. Se não
for, ele nem existe, e a estratégia muda (capítulo 7.6).

**Programa nativo.** `.exe`/`.dll` em C++, Rust, Go, .NET, Delphi... O REA usa motores como
Ghidra, Hopper ou IDA para decompilar. A decompilação é **aproximada**: nomes e comentários
se perdem. Para clonar, você precisa menos do código e mais do comportamento e dos arquivos
que o programa lê e escreve.

### 2.6 Obstáculos que você vai encontrar

| Obstáculo | O que é | O que fazer |
|---|---|---|
| **Minificação** | nomes curtos e sem espaços (`a.b(c)`) | usar o REA para recuperar estrutura; foco em strings e rede, não em ler linha a linha |
| **Source map** | arquivo `.map` que reverte a minificação | se estiver público, ótimo; verifique `//# sourceMappingURL` no final do bundle |
| **Ofuscação** | código embaralhado de propósito | o REA pode não conseguir; use o comportamento observado |
| **Packers e protetores** | executável comprimido/cifrado (VMProtect, Themida) | registre como limite; capture o comportamento |
| **Carga dinâmica** | `eval`, `import()` montado em runtime, plugins | análise estática não vê; use captura em execução |
| **Anti-bot, CAPTCHA** | proteção contra automação | **não contorne**; trabalhe com o que é observável manualmente |
| **Login e paywall** | conteúdo atrás de conta | use a sua conta e anote o limite |

### 2.7 Por que isso não é "copiar"

Estudar como algo funciona é aprendizado. Copiar a expressão (código, imagens, textos, marca)
é outra coisa. O método da skill mantém essa linha: a **spec** descreve comportamento em
palavras, e a implementação sai dela. Se o resultado funciona igual e o código é todo seu, você
reimplementou. Detalhes e cuidados no [capítulo 11](#11-uso-responsável).

---

## 3. REA a fundo

> **Fonte e limites.** Este capítulo vem da leitura do pacote `rea-agents` **6.7.0** e da skill
> oficial `reverse-engineer-anything` (versão "42", 207 ferramentas). A lista de comandos vem
> do código do pacote; **as flags completas de cada comando não foram conferidas aqui**. Para
> qualquer comando, rode `rea <comando> --help`. O pacote não traz a pasta `docs/` que o
> README cita; a documentação completa está no repositório do projeto
> (github.com/morluto/rea).

### 3.1 O que é

REA ("Reverse Engineer Anything") é um pacote npm, `rea-agents`, com licença MIT. Ele reúne
**três peças**:

| Peça | Papel |
|---|---|
| **CLI** (`rea`, também `rea-agents`) | comandos que você ou a LLM rodam no terminal |
| **Servidor MCP** (`rea mcp`) | as mesmas capacidades como ferramentas que um agente chama direto |
| **Skill** `reverse-engineer-anything` | instruções que ensinam o agente a usar as ferramentas com método |

A análise acontece na sua máquina. O agente recebe os **resultados** (evidência), não os
arquivos do alvo.

> **Não confunda.** A skill `clonar-programa` (este repositório) é a **metodologia** de clone.
> A skill `reverse-engineer-anything` é o **manual das ferramentas do REA**. Uma orquestra a
> outra: a nossa decide *o que fazer e em que ordem*; a do REA ensina *como usar cada comando*.

### 3.2 Requisitos

- **Node.js** `^22.19.0`, `^24.11.0` ou `>=26.0.0`. Versões como Node 18 ou 20 **não** servem
  para o REA (os scripts da nossa skill rodam em Node 18+, mas o REA não).
- npm.
- Por alvo, motores externos opcionais. O REA **não instala** Node, npm, Java, Ghidra, IDA,
  JADX, Binwalk nem Unblob; só pode instalar o Hopper, com a sua aprovação.

O que precisa de motor externo e o que não precisa:

| Alvo | Sem motor externo | Precisa de |
|---|---|---|
| JavaScript/Electron (estático) | sim | nada além do Node |
| .NET (estático) | sim | nada |
| Go e Rust | sim (embutido) | nada |
| Cenários de navegador | sim | Playwright (já vem como dependência) e um Chrome/Chromium |
| Nativo profundo (decompilar) | não | Ghidra, Hopper ou IDA |
| SQLite | parcial | Node 24.15+ ou 26+ |
| WebAssembly | parcial | WABT |
| Pacotes de rede (pcap) | parcial | TShark |
| Firmware | não | Binwalk ou Unblob (Linux) |

### 3.3 Instalar e conferir

```bash
npm install --global rea-agents      # ou: npx -y rea-agents@latest <comando>
rea --version
rea doctor --skill                   # confere a skill instalada
rea setup --client claude_code --dry-run   # mostra o plano, não altera nada
rea setup --client claude_code --yes       # aplica
```

Com a nossa skill, o mesmo caminho vira:

```bash
node scripts/install-rea.mjs --check
node scripts/install-rea.mjs --yes --client claude_code
```

O `rea setup` registra o servidor MCP e instala a skill oficial no cliente que você escolher
(`claude_code`, `opencode`, `codex`, `cursor`, `gemini_cli`, `windsurf`...). **Reinicie o
agente depois**, senão ele não enxerga as ferramentas novas.

Sinais de que deu certo: `rea doctor --skill --format json` mostra
`identity.skill.state` igual a `aligned` ou `installed`.

### 3.4 Formatos de saída

Os comandos aceitam `--format toon|json|yaml|md|jsonl` (o padrão é TOON, um formato compacto
pensado para LLM) e `--json`. Outras opções úteis, herdadas do framework de CLI do REA:

| Opção | Para quê |
|---|---|
| `--json` / `--format json` | saída para guardar em arquivo ou processar |
| `--format md` | relatório legível |
| `--schema` | mostra o JSON Schema da entrada do comando |
| `--filter-output a,b.c` | recorta só os campos que interessam |
| `--token-limit N`, `--token-offset N` | pagina saídas grandes |
| `--full-output` | devolve o envelope completo |

### 3.5 O modelo de evidência

É o coração do REA. Cada ferramenta devolve um registro de **evidência** com:

- um `evidence_id` (identificador estável);
- o resultado normalizado;
- a **autoridade** (de onde veio a informação: parser, decompilador, execução);
- as **limitações** e a **cobertura** (o que foi e o que não foi examinado);
- os **unknowns** (o que ficou sem resposta).

Duas regras que a skill oficial ensina ao agente, e que valem para você também:

1. Toda conclusão separa **observação**, **inferência** e **unknown**, citando os IDs.
2. Análise estática não prova execução, e **cobertura parcial não permite concluir ausência**.
   "Não achei" não é "não existe".

Outros conceitos:

- **Evidência retida.** Respostas grandes ficam guardadas e você recebe uma referência
  (`retained-evidence` com `evidence_id`). Fechar a sessão de um binário limpa essas
  referências, então **exporte antes**.
- **Resumo primeiro.** A prática recomendada é pedir `detail: "summary"` e depois abrir só a
  parte que interessa com `inspect-analysis-view`, em vez de despejar o resultado inteiro.
- **Unknowns.** Dá para registrar uma pergunta em aberto, atualizá-la e só marcá-la como
  resolvida com evidência observada que a sustente.
- **Comparar e exportar.** `evidence-export` valida e exporta evidência canônica;
  `evidence-import` importa; `compare` compara dois pacotes. Comparações só afirmam
  equivalência ou ausência quando as páginas comparadas são completas e compatíveis.
- **Ledger de obrigações de reconstrução.** `build-reconstruction-obligation-ledger` gera uma
  lista determinística do que seria preciso reconstruir, e
  `evaluate-reconstruction-coverage` avalia essa cobertura de forma estrita. Servem para
  medir "o quanto do alvo eu já cobri" sem depender de impressão.

### 3.6 Mapa de comandos por tema

São mais de 100 comandos. Você raramente usa mais que 10. A tabela agrupa por assunto
(`rea <comando> --help` para detalhes):

| Tema | Comandos principais | Para quê |
|---|---|---|
| **Ambiente** | `setup`, `doctor`, `update`, `uninstall`, `capabilities`, `providers` | instalar, diagnosticar e listar motores |
| **Visão geral** | `analyze`, `inspect`, `search`, `xrefs`, `decompile`, `function`, `instructions`, `trace` | olhar um binário ou app e aprofundar |
| **JavaScript/Electron** | `analyze-javascript-application`, `recover-javascript-sources`, `trace-application-feature`, `trace-javascript-semantics`, `compare-application-versions`, `compare-source-to-bundle`, `inspect-electron-fuses`, `list-electron-targets`, `capture-electron-scenario` | reconstruir app JS/Electron sem executar; comparar versões |
| **Web / navegador** | `capture-browser-scenario`, `analyze-web-bundle`, `export-web-scripts`, `inspect-web-page`, `list-browser-targets`, `capture-web-screenshot`, `compare-web-captures`, `compare-web-screenshots`, `trace-web-module-imports`, `discover-webmcp-tools` | capturar e analisar sites |
| **Rede** | `inspect-web-network-capture` (HAR, SAZ, mitmproxy, qlog), `inspect-pcap-capture`, `inspect-pcap-client` | analisar tráfego já gravado |
| **Nativo** | `inspect-pe-resources`, `inspect-go-binary`, `inspect-rust-binary`, `inspect-wasm-artifact`, `inspect-sqlite-database`, `read-bytes`, `search-bytes` | binários, recursos, bancos, WASM |
| **.NET** | `inspect-managed-artifact`, `inspect-managed-members`, `inspect-managed-native-boundaries`, `project-managed-application-graph` | assemblies .NET sem carregar o código |
| **Evidência** | `evidence-export`, `evidence-import`, `compare`, `inspect-analysis-view`, `inspect-evidence-bundle`, `build-reconstruction-obligation-ledger`, `evaluate-reconstruction-coverage` | guardar, comparar e medir cobertura |
| **Pacotes e firmware** | `inspect-artifact`, `extract-artifact`, `inspect-firmware-regions` | instaladores e imagens |

Para esta skill (**web e desktop**), os comandos centrais são:

| Quando | Comando |
|---|---|
| Visão rápida de um app instalado | `analyze <caminho>` |
| App Electron / JavaScript | `analyze-javascript-application <pasta ou app.asar>` |
| Ver só um recorte do resultado | `inspect-analysis-view` |
| Segurança do Electron (fuses) | `inspect-electron-fuses` |
| Rodar um fluxo no navegador | `capture-browser-scenario <cenario.json>` |
| Analisar o bundle de um site | `analyze-web-bundle` |
| Exportar os scripts capturados | `export-web-scripts <captura.json> <pasta>` |
| Comparar duas capturas | `compare-web-captures`, `compare-web-screenshots` |
| Guardar e comparar evidência | `evidence-export`, `evidence-import`, `compare` |

### 3.7 Exemplos que funcionam

**Analisar um app Electron** (comando exato da documentação do REA):

```bash
rea analyze-javascript-application "C:/caminho/resources/app.asar" --json > app-evidence.json
```

**Ver só o resumo**, em vez de abrir o JSON inteiro (que pode ter centenas de MB):

```bash
jq -c '{source: {kind: "inline", evidence: .}, view: {kind: "summary"}}' app-evidence.json > app-view.json
rea inspect-analysis-view app-view.json
```

> O `jq` é uma ferramenta à parte (ferramenta de linha de comando para JSON). Se não tiver,
> peça à LLM para montar o `app-view.json` com um pequeno script Node.

**Rodar um cenário de navegador** (com cliques):

```json
{
  "browser": { "mode": "launch", "executable_path": "C:/Program Files/Google/Chrome/Application/chrome.exe", "headless": true },
  "start_url": { "url": "https://exemplo.com", "query": [] },
  "environment": {
    "viewport": { "width": 1440, "height": 900, "device_scale_factor": 1 },
    "locale": "pt-BR", "timezone": "America/Sao_Paulo",
    "color_scheme": "light", "reduced_motion": "reduce", "service_workers": "block"
  },
  "actions": [ { "step_id": "wait", "action": "wait_for_timeout", "duration_ms": 3000 } ],
  "capture": {
    "after_each_step": [],
    "at_end": ["screenshot", "dom", "accessibility", "url", "history", "storage"],
    "events": ["console", "page-errors", "network"],
    "network": { "request_body": true, "response_body": false, "header_values": false }
  }
}
```

```bash
rea capture-browser-scenario cenario.json --format json > 01-evidence/web/capture.json
rea export-web-scripts 01-evidence/web/capture.json 02-rea/web-scripts
```

Nas `actions`, além de `wait_for_timeout`, há `click`, `fill`, `press`, `select_option`,
`check` e `wait_for`, com localizadores por `role`, `test_id` ou `css`. **Valores sensíveis
vão em `secret`, nunca escritos no arquivo.**

### 3.8 As regras da skill oficial do REA

Resumo do que a skill `reverse-engineer-anything` manda o agente fazer. Conhecer ajuda você a
perceber quando a LLM saiu do trilho:

1. **Use o REA só quando a pergunta depende de um artefato entregue** (binário, pacote,
   bundle, runtime passivo). Para código-fonte completo, use ferramentas normais de leitura.
2. **Não rode diagnóstico antes de toda investigação.** Se as ferramentas já aparecem, vá
   direto ao alvo.
3. **Se faltarem ferramentas:** `doctor`, depois `setup --dry-run`, **mostrar o plano**, obter
   aprovação, `setup --yes`, reiniciar. Sem repetir o setup em loop.
4. **Escolha pelo tipo de alvo:** ASAR ou pasta JS → `analyze-javascript-application`;
   .NET → `inspect-managed-artifact`; HAR/SAZ → `inspect-web-network-capture`; nativo →
   abrir o binário e usar ferramentas focadas.
5. **Antes de inspecionar o main de um Electron, rode `inspect-electron-fuses`.**
6. **Se você disse só "meu app", a LLM deve perguntar qual.** Ela nunca escolhe um app de
   exemplo por conta própria.
7. **Resumo primeiro.** Depois, só as views necessárias. Não repetir chamada idêntica.
8. **Resposta truncada?** Use `inspect-analysis-view` ou `evidence-export`; não interprete o
   preview truncado.
9. **Sessão nativa aberta tem de ser fechada** (`close_binary`).
10. **Nunca:** afirmar execução a partir de análise estática; ampliar o alvo ou as ações de
    runtime sem pedir; tratar pseudocódigo decompilado como código-fonte original; concluir
    ausência com cobertura parcial.

**Armadilhas conhecidas:**

- A mensagem "No app is open" quase sempre é **ordem de chamada**: no MCP, abra o alvo antes de
  observar e feche no fim.
- O modo `connect` do `capture-browser-scenario` **navega** para a URL inicial e pode apagar o
  estado da página aberta. Use uma janela só para isso.
- Não misture captura passiva e captura de cenário no mesmo alvo ao mesmo tempo.
- `observe-native-calls` **executa** o programa (usa LLDB, macOS). Não é análise estática.
- `capture-native-ui-scenario` e `observe-native-ui` são **só macOS**. No Windows, use o
  `capture-desktop.ps1` da nossa skill.
- O approval do seu cliente (ex.: Codex) é independente do `rea doctor`.

### 3.9 Onde o REA ajuda e onde não ajuda

**Ajuda muito:**
- reconstruir o mapa de um app Electron: módulos, imports, canais IPC, SQL, endpoints;
- achar rotas e chamadas de API dentro de um bundle de site;
- comparar duas versões de um app para ver o que mudou;
- guardar a evidência de forma reproduzível.

**Ajuda pouco ou nada:**
- regras de negócio que ficam no servidor;
- IPC e plugins registrados dinamicamente ou via `eval`;
- código ofuscado ou protegido por packer;
- "como a interface parece": isso é com captura e inspeção visual;
- provar que uma função existe em tempo de execução (isso exige observação dinâmica).

---

## 4. Como a skill funciona

### 4.1 A estrutura do repositório

```
SKILL.md                 o que a LLM lê ao ser ativada
GUIA-COMPLETO.md         este guia
README.md                apresentação e instalação
prompts/INSTALL-LLM.md   prompt que instala tudo e faz a entrevista
references/              páginas de aprofundamento que a LLM abre sob demanda
templates/               modelos copiados para a pasta de trabalho do clone
scripts/                 as ferramentas (Node e PowerShell)
assets/                  capa
```

### 4.2 Como a LLM usa a skill

1. **Ativação.** O `SKILL.md` começa com um bloco (`name` e `description`). A LLM lê só a
   `description` para decidir se deve carregar a skill. Frases como "clonar", "engenharia
   reversa", "REA", "feature parity" a ativam.
2. **Instruções.** Depois de ativada, ela lê o `SKILL.md` inteiro: entrevista, fases, regras.
3. **Aprofundamento sob demanda.** O `SKILL.md` tem uma tabela "o que ler quando". A LLM abre
   `references/rea.md` só quando precisa dos comandos do REA, e assim por diante. Isso poupa
   contexto.
4. **Ação.** Ela roda os scripts, preenche os templates e escreve a spec e o código.

Por isso o `SKILL.md` é curto e direto, e o detalhe vive em `references/`.

### 4.3 O workspace do clone

Cada clone ganha uma pasta numerada, criada por `new-clone.mjs`:

```
meu-clone/
  00-intake/INTAKE.md          quem, o quê, escopo, versão congelada
  01-evidence/                 capturas (web/ ou desktop/), índice e hashes
  02-rea/                      saídas do REA (grafos e views; ficam fora do git)
  03-spec/REA.md               arquitetura observada
  03-spec/FEATURES.md          funcionalidades e critérios de aceite
  03-spec/CLONE-PLAN.md        stack, marcos, riscos
  04-build/                    o código do clone (só código seu)
  05-verification/             testes, matriz de comportamento, relatório
  06-delivery/                 README final, créditos, PROVENANCE.md
```

Os números mostram a **ordem do trabalho**. Duas regras de ouro:

- **Nunca misture `01-evidence/` com `04-build/`.** Evidência é do alvo; build é seu.
- **`02-rea/` pesa.** Os JSON do REA passam de centenas de MB. O `.gitignore` do clone já os
  ignora; versione só o índice, os hashes e os resumos.

### 4.4 As fases em detalhe

#### Fase 0: workspace

`new-clone.mjs` cria as pastas e copia os templates. Se a pasta já existir, **nunca
sobrescreve** nada; com `--force` só completa o que falta.

#### Fase 1: congelar o alvo

Objetivo: tornar a investigação **repetível**. Anote no `INTAKE.md`:

| Campo | Web | Desktop |
|---|---|---|
| Identificação | URL exata e data | caminho e versão do programa |
| Integridade | (a data basta) | SHA-256 do executável ou do `app.asar` |
| Contexto | idioma, viewport, conta usada (sem senha) | sistema, arquitetura |

No Windows, `inventory-files.mjs` já coleta versão dos `.exe` e hashes. Sem isso, três meses
depois você não sabe se o alvo mudou ou se o seu clone está errado.

#### Fase 2: capturar evidência

Veja os capítulos 6 e 7. A regra: **capture o que você precisa para escrever a spec**, não "tudo
que der". Cada captura vira uma linha no `EVIDENCE-INDEX.md`, com ferramenta, data, caminho e
limites.

#### Fase 3: arquitetura

Preenche o `03-spec/REA.md`. A estrutura sugere camadas (interface, processo principal, dados,
integrações) e, para cada **superfície** (rotas, IPC, API, eventos), uma tabela com entrada,
saída e evidência. Marque cada linha como observada, inferida ou não verificada.

#### Fase 4: funcionalidades

Preenche o `FEATURES.md`. Cada linha é um **comportamento verificável**, não um botão.

| Ruim | Bom |
|---|---|
| "Botão Salvar" | "Salvar com título vazio mostra o erro 'Informe um título' e não grava" |
| "Tela de login" | "Login com senha errada 3 vezes bloqueia por 30 s e mostra o tempo restante" |

Priorize em **P0** (sem isso não serve), **P1** (importante) e **P2** (polimento). Anote
também o que o alvo **não** faz. Isso impede a LLM de inventar recursos.

#### Fase 5: assets

Lista de imagens, ícones, fontes, áudio e textos do alvo. Por padrão **troque por algo
seu ou livre**. O inventário e o `licencas-assets.md` guiam isso.

#### Fase 6: spec e plano

A spec descreve o comportamento; o plano (`CLONE-PLAN.md`) define stack, mapa
"componente do alvo → componente nosso", marcos M0 a M3 e riscos. Veja o
[capítulo 8](#8-escrever-uma-spec-que-a-llm-consegue-implementar).

#### Fase 7: implementar e verificar

Constrói em `04-build/` na ordem: esqueleto do P0 → contratos e erros → P1 → polimento. Cada
marco termina com demo, testes e critério de saída. Veja o [capítulo 9](#9-provar-a-paridade).

#### Fase 8: entrega

README de uso, arquitetura do clone, créditos, `PROVENANCE.md` (se você copiou algo), o que
ficou de fora e próximos passos.

### 4.5 Os marcos

| Marco | Entrega | Pergunta que responde |
|---|---|---|
| **M0 esqueleto** | uma tela, um fluxo, persistência real, um teste | "A base técnica aguenta?" |
| **M1 P0 completo** | todos os fluxos essenciais | "Já serve para o caso principal?" |
| **M2 P1** | o que é importante, mas não essencial | "Já substitui o alvo no dia a dia?" |
| **M3 polimento** | visual, microinterações, desempenho, acessibilidade | "Parece e se sente igual?" |

Um fluxo completo de ponta a ponta vale mais que vinte telas estáticas.

---

## 5. Os scripts, um por um

Todos ficam em `scripts/`. `$S` é a pasta da skill.

### `doctor.mjs`: confere o ambiente

```bash
node "$S/scripts/doctor.mjs"            # texto
node "$S/scripts/doctor.mjs" --json     # para ferramentas
node "$S/scripts/doctor.mjs" --strict   # código 1 se faltar algo obrigatório
```

Checa Node 18+, npm, Git, REA (versão 6.7+ e se o Node serve para ele), a skill do REA,
Playwright **na pasta atual**, Chrome/Edge, PowerShell (no Windows) e se todos os arquivos da
skill estão presentes. Não instala nada. `[OK]` está pronto, `[!!]` é recomendado e `[XX]` é
obrigatório.

### `install-rea.mjs`: instala o REA e a skill oficial

```bash
node "$S/scripts/install-rea.mjs" --check                       # só diagnostica
node "$S/scripts/install-rea.mjs" --yes --client claude_code    # aplica
node "$S/scripts/install-rea.mjs" --yes --all-detected          # todo cliente detectado
```

Extras: `--version 6.7.0` fixa a versão do pacote; `--dry-run` mostra o plano; `--force`
reinstala a skill. Mostra sempre o plano do `rea setup` antes de aplicar e valida o nome do
cliente.

### `new-clone.mjs`: cria o workspace

```bash
node "$S/scripts/new-clone.mjs" --target "https://exemplo.com" --name "Meu Clone" --dir clones/meu-clone
```

Detecta se o alvo é **web** (URL) ou **desktop** (caminho), cria as pastas, copia os
templates, gera `README.md` e `.gitignore` (segredos e evidência pesada). Recusa APK/IPA.

### `capture-web.mjs`: retrato de uma página

```bash
node "$S/scripts/capture-web.mjs" --url "https://exemplo.com" --out "$W/01-evidence/web" --name home
```

| Flag | Efeito |
|---|---|
| `--storage auth.json` | usa a sessão salva (área logada) |
| `--bodies` | guarda corpos de `fetch`/`xhr` (até 60, redigidos) |
| `--browser "<caminho>"` | usa um Chrome/Edge específico |
| `--headed` | mostra o navegador |
| `--timeout 45000` | tempo de navegação em ms |

O que salva (prefixo `<name>-`): `full.png`, `viewport.png`, `narrow.png`, `page.html`,
`page.txt`, `aria.txt`, `elements.json`, `network.json`, `console.json`, `storage.json`,
`performance.json`, `api-bodies.json` (com `--bodies`) e `manifest.json`.

**Redação automática.** Tokens, JWT, `Bearer`, senhas, campos `hidden`, `csrf` e parâmetros de
URL como `token` ou `code` viram `[redacted]`. Rotas de SPA (`#/rota`) são mantidas. É
"melhor esforço": **sempre revise** antes de compartilhar, principalmente em capturas
logadas, que podem trazer nome e e-mail.

**Códigos de saída:** 0 ok · 2 uso · 3 sem Playwright · 4 navegador não abriu · 5 página não
carregou. O `manifest.json` registra versões do Playwright e do navegador, avisos e o hash de
cada arquivo.

**Limite importante:** captura **um estado** por execução. Para fluxos com cliques, use o
cenário do REA ou rode uma vez por estado (`--name lista-vazia`, `--name erro-validacao`...).

### `capture-desktop.ps1` (Windows)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" -ListWindows
powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" -Title "*Calculadora*" -OutDir "$W/01-evidence/desktop"
```

Você **precisa escolher** a janela (`-Title`, `-ProcessName` ou `-Hwnd`); sem isso o script só
lista as janelas e sai com código 3. Ele restaura a janela se estiver minimizada, percorre a
árvore de **UI Automation** (tipo de controle, nome, `AutomationId`, posição, padrões) e salva
`window.png` pelo `PrintWindow` (só a janela). `-ScreenCopy` adiciona uma cópia da tela, que
pode incluir outras janelas por cima. Saída: `ui-tree.json`, `capture-meta.json`, `window.png`.

### `inventory-files.mjs`: inventário do programa instalado

```bash
node "$S/scripts/inventory-files.mjs" --dir "C:/Program Files/App" --out "$W/01-evidence/desktop"
```

Percorre a pasta e gera `inventory.json`, `inventory.csv` e `licenses.txt`. Registra:

- tamanho, extensão e SHA-256 de cada arquivo (hash em streaming, até 200 MB por arquivo);
- **tecnologia** por pistas: Electron, .NET, Python, CEF, Qt, WebView2, Flutter, Java, Unity,
  Tauri;
- **arquivos de licença** (`LICENSE*`, `NOTICE*`, `THIRD-PARTY*`, `LICENSES.chromium.html`);
- **versão e fabricante** dos `.exe` na raiz (Windows);
- o **conteúdo de cada `app.asar`** (`asar-1.json`): lista de arquivos, imagens, fontes e
  áudio embutidos. O `.asar` é só o "zip" do JavaScript do app Electron; o script lê o
  cabeçalho dele, não executa nada.

Por padrão pula `node_modules`; use `--include-node-modules` se precisar.

### `compare-behavior.mjs`: o juiz da paridade

```bash
node "$S/scripts/compare-behavior.mjs" --expected alvo.json --actual clone.json \
  --ignore criadoEm,'$.casos[].id' --out 05-verification/diff.json
```

Compara dois JSON campo a campo. `--tolerance 0.001` aceita diferença numérica pequena;
`--ignore` descarta campos que mudam sozinhos. Saída **0** = igual, **1** = divergência,
**2** = erro (JSON inválido, arquivo ausente ou nada para comparar; use `--allow-empty` se for
de propósito).

---

## 6. Passo a passo: clonar um site

Exemplo fictício: um gerenciador de tarefas em `https://exemplo-tarefas.com`. Substitua pelo
seu alvo.

### 6.1 Preparar

Escolha uma **pasta de trabalho**, onde o Playwright fica instalado e de onde você roda os
scripts. Os clones ficam em `clones/` dentro dela. Em `<SKILL>`, use o caminho da pasta da skill.
Os comandos abaixo funcionam no PowerShell, no macOS e no Linux (um por linha):

```bash
node <SKILL>/scripts/doctor.mjs
mkdir meu-trabalho
cd meu-trabalho
npm init -y
npm i -D playwright
npx playwright install chromium
node <SKILL>/scripts/new-clone.mjs --target "https://exemplo-tarefas.com" --name "Tarefas" --dir clones/tarefas
```

A partir daqui, rode tudo **de dentro de `meu-trabalho`**.

### 6.2 Preencher o intake

Exemplo de trecho do `00-intake/INTAKE.md`:

```markdown
- Alvo: https://exemplo-tarefas.com   · Data: 2026-10-31
- Conta usada: conta própria de teste (sem senha aqui)
- Modo: só comportamento (código e assets próprios)

### P0
1. Criar, editar e concluir tarefas
2. Listar com filtro (todas / pendentes / concluídas)
3. Login e sessão

### Fora do escopo
- Pagamento e compartilhamento
```

### 6.3 Capturar os estados principais

```bash
node <SKILL>/scripts/capture-web.mjs --url "https://exemplo-tarefas.com" --out clones/tarefas/01-evidence/web --name home
node <SKILL>/scripts/capture-web.mjs --url "https://exemplo-tarefas.com/login" --out clones/tarefas/01-evidence/web --name login
```

Para a área logada, salve a sessão **dentro do workspace do clone** (o `.gitignore` dele já
ignora o `auth.json`):

```bash
npx playwright codegen --save-storage=clones/tarefas/auth.json "https://exemplo-tarefas.com/login"
# faça login à mão, feche a janela
node <SKILL>/scripts/capture-web.mjs --url "https://exemplo-tarefas.com/app" --storage clones/tarefas/auth.json --bodies --out clones/tarefas/01-evidence/web --name app-lista
```

`--bodies` registra as respostas de API. É a **melhor fonte para os contratos**: nomes de
campos, tipos e formatos de erro. Nunca versione o `auth.json`.

**Estados que costumam faltar** (capture todos): lista vazia, formulário com erro de
validação, sucesso, exclusão com confirmação, busca sem resultado, erro de rede, sessão
expirada. Para simular erro de rede no DevTools, use a aba Network com "Offline".

### 6.4 Ler a captura

Abra os arquivos nesta ordem:

1. `home-viewport.png` e `home-narrow.png`: o visual em desktop e em tela estreita.
2. `home-aria.txt`: a árvore de acessibilidade. É a "estrutura semântica" da página, ótima
   para a LLM entender a interface sem o HTML bagunçado.
3. `home-elements.json`: botões, links e campos, com texto, rótulo, tipo e posição.
4. `home-network.json`: o que a página chamou. Procure por `fetch`/`xhr` e por domínios de
   terceiros (analytics, pagamento, autenticação).
5. `app-lista-api-bodies.json`: o formato real dos dados.

**Exemplo de contrato extraído de `api-bodies.json`:**

```markdown
### GET /api/tasks?status=pending   (observado: app-lista-api-bodies.json)
200 → { "items": [ { "id": "uuid", "title": "string", "done": false, "createdAt": "ISO-8601" } ],
        "total": 12 }
401 → { "error": "unauthorized" }
Inferido: ordenação por createdAt decrescente (não confirmado).
```

### 6.5 Capturar o visual (design tokens)

Em vez de "parece azul", extraia valores reais com o Playwright:

```js
// tokens.mjs, rode na pasta onde o Playwright está instalado
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://exemplo-tarefas.com');
const tokens = await page.evaluate(() => {
  const pick = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, font: s.fontFamily,
             size: s.fontSize, weight: s.fontWeight, radius: s.borderRadius, padding: s.padding };
  };
  return { body: pick('body'), h1: pick('h1'), button: pick('button'), input: pick('input') };
});
console.log(JSON.stringify(tokens, null, 2));
await browser.close();
```

Isso vira uma tabela de design na spec (cores, fontes, raio, espaçamento). Lembre: **fontes e
logos têm licença**. Use equivalentes livres (Google Fonts) e identidade própria.

### 6.6 Ir mais fundo com o REA (opcional)

Quando a interface depende muito de JavaScript. Salve o cenário do capítulo 3.7 em
`clones/tarefas/02-rea/scenario.json` e rode, de dentro de `meu-trabalho`. O `export-web-scripts`
exige caminhos **absolutos** e uma pasta de saída que **ainda não existe**:

```bash
rea capture-browser-scenario clones/tarefas/02-rea/scenario.json --format json > clones/tarefas/01-evidence/web/capture.json
rea export-web-scripts "<caminho-absoluto>/clones/tarefas/01-evidence/web/capture.json" "<caminho-absoluto>/clones/tarefas/02-rea/web-scripts"
rea analyze-javascript-application "<caminho-absoluto>/clones/tarefas/02-rea/web-scripts" --json > clones/tarefas/02-rea/web-bundle.json
```

O último comando aponta o analisador de JavaScript para a pasta dos scripts exportados. Não
testei essa combinação aqui: confira com `rea analyze-javascript-application --help` e, se a
entrada não servir, use `analyze-web-bundle` (que captura e analisa o bundle direto do site).

Se a página expõe um `.map` (source map) público, a estrutura original aparece quase inteira.
Isso é útil para **entender**; ainda assim, escreva o seu código a partir da spec.

### 6.7 Escrever spec, plano e implementar

Siga os capítulos 8 e 9. Para a implementação, uma boa stack inicial para quem está começando é
uma que a LLM domina e que você consegue rodar: por exemplo, React ou Vue com Vite no front e,
se precisar de persistência, SQLite ou um arquivo JSON local.

---

## 7. Passo a passo: clonar um programa desktop

### 7.1 Achar onde o programa está

| Sistema | Onde olhar |
|---|---|
| Windows | `%LOCALAPPDATA%\Programs\<nome>`, `%PROGRAMFILES%\<nome>`, `%PROGRAMFILES(X86)%\<nome>` |
| Dados do usuário | `%APPDATA%\<nome>`, `%LOCALAPPDATA%\<nome>`, `C:\ProgramData\<nome>` |
| Registro | `HKCU\Software\<nome>`, `HKLM\Software\<nome>`, chave `Uninstall` |
| macOS | `/Applications/<nome>.app`, `~/Library/Application Support/<nome>` |
| Linux | `/opt/<nome>`, `~/.config/<nome>`, `~/.local/share/<nome>` |

Atalho no Windows: clique com o botão direito no atalho → "Abrir local do arquivo".

### 7.2 Descobrir a tecnologia

Rode o inventário e leia o campo `stack` do `inventory.json`. Também dá para deduzir pelos
arquivos:

| Pista | Tecnologia |
|---|---|
| `resources/app.asar`, `electron.exe` | Electron |
| `*.deps.json`, `hostfxr.dll` | .NET |
| `python3*.dll`, `site-packages` | Python empacotado |
| `libcef.dll`, `chrome_elf.dll` | CEF/Chromium |
| `Qt5Core.dll`, `Qt6Core.dll` | Qt |
| `WebView2Loader.dll` | WebView2 (interface web dentro de um app nativo) |
| `flutter_windows.dll` | Flutter |
| `*.jar`, `jvm.dll` | Java |
| `UnityPlayer.dll` | Unity (jogo) |
| `tauri.conf.json` | Tauri |
| `AppxManifest.xml` em `WindowsApps` | MSIX/UWP (Microsoft Store) |

**A tecnologia define a estratégia.** Electron, WebView2 e Tauri têm interface web: você captura
como um site e analisa o JavaScript. Qt, Flutter e nativos exigem mais observação da interface.

### 7.3 Registrar a identidade do programa

```bash
node "$S/scripts/inventory-files.mjs" --dir "<pasta>" --out "$W/01-evidence/desktop"
```

Anote no intake a versão, o SHA-256 e o sistema. No PowerShell, o hash de um arquivo
específico: `Get-FileHash "<exe>" -Algorithm SHA256`.

### 7.4 Capturar a interface (Windows)

```powershell
# 1) liste as janelas e ache a do programa
powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" -ListWindows
# 2) capture
powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" -ProcessName "meuapp" -OutDir "$W/01-evidence/desktop"
```

A **árvore UIA** é o equivalente desktop do `aria.txt`: lista de botões, campos, menus, com
nome e posição. Capture **uma vez por tela e estado** (muda `-OutDir` a cada vez).

> **Quando a árvore vem vazia.** Apps da Microsoft Store (UWP/MSIX) minimizados ou suspensos
> expõem zero controles. O script tenta restaurar a janela e repetir, e avisa com código 2. Se
> persistir, abra a janela à mão, deixe-a visível e rode de novo. A janela visível desses apps
> costuma pertencer ao `ApplicationFrameHost`, com PID diferente do app; por isso o script
> procura por título, processo ou HWND.

macOS e Linux: use a API de acessibilidade do sistema (AXUIElement no macOS, AT-SPI no Linux).
O REA tem `capture-native-ui-scenario`, **só no macOS**.

### 7.5 Electron: abrir o `app.asar`

```bash
rea analyze-javascript-application "<pasta>/resources/app.asar" --json > "$W/02-rea/app.json"
```

Para entender a estrutura, comece pelo **inventário do ASAR** (`asar-1.json`) e olhe:

- `package.json` dentro do ASAR (nome, versão, dependências, ponto de entrada);
- pastas como `out/main`, `out/preload`, `out/renderer` ou `dist/`;
- o que é imagem e fonte (`assets` no JSON).

**O que mapear para a spec:**

| Camada | O que procurar | Vira na spec |
|---|---|---|
| Janelas | `new BrowserWindow`, tamanho mínimo, menus, bandeja | layout e comportamento da janela |
| IPC | `ipcMain.handle('canal')`, `ipcRenderer.invoke('canal')` | contratos internos (canal, entrada, saída) |
| Dados | `app.getPath('userData')`, SQLite, JSON, `electron-store` | persistência e migrações |
| Rede | `fetch`, `axios`, `WebSocket`, domínios | integrações externas |
| Atualização | `electron-updater` | fora do escopo, em geral |
| Segurança | `contextIsolation`, `nodeIntegration`, *fuses* (`inspect-electron-fuses`) | só registro |

Use `inspect-analysis-view` para ler o resultado por partes. **Não** peça à LLM para ler o JSON
inteiro.

### 7.6 Programa nativo ou .NET

- **.NET:** `rea inspect-managed-artifact <dll-ou-exe>` e `inspect-managed-members` mostram tipos
  e métodos **sem carregar o código**. O resultado costuma ser bem legível.
- **Nativo (C++, Delphi...):** o REA usa Ghidra, Hopper ou IDA. A decompilação é aproximada e
  pesada: um binário grande pode estourar o tempo de importação do Ghidra (~5 min). Nesses
  casos, **foque em strings, recursos (`inspect-pe-resources`) e comportamento observado**.
- **Go e Rust:** `inspect-go-binary` e `inspect-rust-binary` funcionam sem motor externo.
- **Programas da Microsoft Store:** ficam em `C:\Program Files\WindowsApps` com permissão
  restrita. Copie o binário para uma pasta de trabalho para analisar, anote hash e caminho
  original, e apague a cópia ao final.

### 7.7 Dados que o programa guarda

- **SQLite** (`*.db`, `*.sqlite`): abra uma **cópia**. `sqlite3 arquivo.db ".schema"` mostra as
  tabelas. Registre o esquema na spec; **nunca** copie os dados do usuário.
- **JSON/YAML de configuração:** versione amostras sem dados pessoais.
- **Logs:** úteis para descobrir nomes de eventos e mensagens de erro; remova dados pessoais.

### 7.8 Observar o programa rodando

Com o programa aberto numa **VM ou conta separada**, o que vale registrar:

| O que | Ferramenta no Windows |
|---|---|
| Arquivos abertos e criados | Process Monitor (Sysinternals) |
| Conexões de rede | `netstat -ano`, Resource Monitor, ou um proxy (mitmproxy) |
| Processos filhos | Gerenciador de Tarefas, Process Explorer |
| Chamadas de API (apps com interface web) | DevTools do próprio Electron, se habilitado |

Faça isso para responder perguntas específicas ("onde ele salva meus projetos?", "para qual
servidor ele chama?"), não como varredura geral.

### 7.9 Limites a declarar

Anote na spec, em vez de esconder: licenciamento por servidor, login obrigatório, anti-cheat,
conteúdo cifrado, atualização assinada. Eles são **resultado** da investigação.

---

## 8. Escrever uma spec que a LLM consegue implementar

A spec é o documento mais valioso do projeto. Uma boa spec permite que a LLM implemente sem ver
o código do alvo.

### 8.1 Princípios

1. **Comportamento, não implementação.** "Ao enviar o formulário com título vazio, mostrar o
   erro e manter o foco no campo" em vez de "chama `validate()` no `onSubmit`".
2. **Concreto e testável.** Cada critério de aceite vira um teste.
3. **Estados completos.** Inicial, carregando, vazio, sucesso, erro, sem permissão, offline.
4. **Marque a certeza** (observado, inferido, não verificado).
5. **Inclua o que o alvo não faz.**

### 8.2 Modelo de uma funcionalidade P0

```markdown
### F-03 · Concluir tarefa
Ator: usuário logado
Pré-condições: existe ao menos 1 tarefa pendente na lista
Entrada: clique na caixa de seleção da tarefa
Passos: 1) usuário marca a caixa  2) a tarefa recebe estilo "riscado" imediatamente
        3) cliente envia PATCH /api/tasks/{id} { "done": true }
Estados: sucesso (2xx) mantém riscado; erro (5xx/rede) desfaz o estilo e mostra "Não foi
         possível salvar. Tente de novo." por 4 s
Saída e persistência: campo done=true; contador de pendentes diminui em 1
Teclado: Espaço alterna a caixa quando focada
Limites: não é possível reabrir tarefa arquivada
Aceite: (a) marcar → riscado em < 100 ms; (b) recarregar a página mantém o estado;
        (c) com rede desligada, o estilo volta e a mensagem aparece
Evidência: app-lista-api-bodies.json (PATCH), captura "erro-rede"
Certeza: observado (a, b); inferido (c, falta teste manual)
```

### 8.3 Contratos de dados

Para cada endpoint ou canal IPC, escreva:

```markdown
PATCH /api/tasks/{id}
Request:  { "done": boolean }              (obrigatório)
Response: 200 { "id": "uuid", "done": boolean, "updatedAt": "ISO-8601" }
Erros:    401 { "error": "unauthorized" } · 404 { "error": "not_found" } · 422 { "error": "invalid" }
```

### 8.4 Máquinas de estado

Para fluxos com vários estados (login, upload, pagamento), desenhe em texto:

```
deslogado --(enviar credenciais)--> autenticando
autenticando --(200)--> logado
autenticando --(401)--> deslogado + erro "Senha incorreta"
autenticando --(5xx/rede)--> deslogado + erro "Sem conexão"
logado --(token expira)--> deslogado + aviso "Sessão expirada"
```

### 8.5 Um README do clone claro

No final, quem abrir o `06-delivery/README.md` deve entender em um minuto: o que é, como rodar,
o que foi inspirado em outro produto, o que ficou de fora e quais as licenças das dependências.

### 8.6 O plano

No `CLONE-PLAN.md`, escolha uma stack que você consiga **rodar e depurar**. Para cada
componente do alvo, uma linha: "tela de lista → `TaskList.tsx`", "API `/tasks` → módulo
`tasks` com SQLite". Liste os riscos (ex.: "WebSocket do alvo não capturado") e o que **não** será
feito.

---

## 9. Provar a paridade

"Parece igual" não é teste. A paridade se prova com camadas:

| Camada | O que verifica | Como |
|---|---|---|
| **E2E** | fluxos de ponta a ponta | Playwright contra o **clone** |
| **Contrato** | formato de API/IPC | comparar JSON do alvo e do clone |
| **Comportamento** | saídas para entradas iguais | `compare-behavior.mjs` |
| **Visual** | aparência | screenshot diff + olho humano |
| **Estado** | vazio, erro, loading, offline | casos dedicados |
| **Acessibilidade** | teclado, foco, rótulos | teste de teclado + ARIA |
| **Desempenho** | tempo de abertura e de ação | medir nos dois |

### 9.1 Teste E2E do clone

```bash
npm i -D @playwright/test
```

```js
import { test, expect } from '@playwright/test';

test('conclui tarefa e mantém ao recarregar', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.getByLabel('Nova tarefa').fill('Comprar café');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await page.getByRole('checkbox', { name: 'Comprar café' }).check();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Comprar café' })).toBeChecked();
});
```

Rode contra o **clone**. O alvo só serve para gerar a expectativa. Prefira seletores por
`role` e rótulo: eles também forçam o clone a ser acessível.

### 9.2 Matriz de comportamento (`compare-behavior`)

Gere o mesmo arquivo para o alvo e para o clone, com o mesmo roteiro:

```json
{ "casos": [
  { "entrada": { "titulo": "" },      "saida": { "status": 422, "erro": "invalid" } },
  { "entrada": { "titulo": "Café" },  "saida": { "status": 201, "done": false } }
] }
```

```bash
node scripts/compare-behavior.mjs --expected alvo.json --actual clone.json \
  --ignore id,createdAt --out 05-verification/diff.json
```

**Normalizar é dívida visível.** Cada campo em `--ignore` (datas, ids gerados) entra na tabela
"Campos ignorados" do `VERIFICATION.md`, com o motivo.

### 9.3 Screenshot diff

```bash
npx playwright screenshot --viewport-size=1440,900 "https://alvo" alvo.png
npx playwright screenshot --viewport-size=1440,900 "http://localhost:3000" clone.png
```

Compare com `rea compare-web-screenshots` ou `pixelmatch`. **Defina o limiar antes** (por
exemplo, no máximo 2% de pixels diferentes) e **olhe**: diferença de antialiasing e de fonte
não é falha funcional.

### 9.4 Fuzz e diferencial (opcional, para quem quer ir fundo)

Gere sequências aleatórias de ações (com uma semente fixa), execute no alvo e no clone, e
compare os resultados. Divergências viram casos de teste. Registre a semente no
`VERIFICATION.md` para repetir.

### 9.5 O relatório honesto

Cada funcionalidade recebe um status:

| Status | Significa |
|---|---|
| **igual** | comportamento e resultado iguais |
| **parcial** | o caminho principal funciona; faltam estados ou limites |
| **ausente** | não implementado |
| **não testado** | sem evidência |

Cada teste recebe **passou / falhou / não testado**. Um relatório com "não testado" em 30%
vale mais que um com tudo "passou" sem prova.

### 9.6 Armadilhas clássicas

- Testar com o alvo aberto: o clone "funciona" por acidente.
- Medir sucesso com screenshot estático em vez de fluxo.
- Ignorar estados vazios e de erro.
- Copiar uma fonte ou um ícone sem perceber a licença.
- Não guardar a evidência e depois não saber por que algo mudou.

---

## 10. Trabalhar bem com a LLM

### 10.1 Contexto é recurso escasso

- **Nunca** cole o JSON inteiro do REA ou um bundle minificado no chat. Use as views
  (`inspect-analysis-view`) e os resumos.
- Peça respostas **curtas com caminho e linha** (`arquivo:linha`).
- Faça uma sessão por fase longa. Antes de limpar o contexto, deixe o estado em arquivo
  (o `INTAKE.md`, o `EVIDENCE-INDEX.md` e a spec já fazem isso).

### 10.2 Prompts úteis

**Começar um alvo web:**
```
Use a skill clonar-programa. Alvo: https://exemplo.com. Nome: Meu Clone. P0: criar, listar e
excluir itens. Modo só comportamento. Crie o workspace, capture a home e me mostre o que
encontrou na rede antes de continuar.
```

**Reduzir alucinação:**
```
Para cada afirmação sobre o alvo, marque observado (com caminho do arquivo), inferido ou não
verificado. Não escreva nenhum requisito baseado em suposição sem marcar.
```

**Escrever a spec a partir da captura:**
```
Leia 01-evidence/web/home-aria.txt, home-elements.json e app-lista-api-bodies.json. Escreva as
funcionalidades P0 em 03-spec/FEATURES.md no formato do template, com critério de aceite
testável. Liste o que você não conseguiu confirmar.
```

**Implementar sem ver o alvo:**
```
Implemente o F-03 em 04-build/ usando só 03-spec/. Não abra 01-evidence/ nem 02-rea/. Escreva
primeiro o teste Playwright do critério de aceite.
```

**Revisar:**
```
Em contexto novo, compare 03-spec/FEATURES.md com o que está implementado em 04-build/ e liste
o que está ausente ou divergente, com caminho e linha.
```

### 10.3 Dividir o trabalho

Tarefas independentes (capturar três telas, inventariar assets, escrever três specs) podem
rodar em paralelo, mas **mantenha poucos agentes** (3 a 4). Decisões de arquitetura e a spec
final ficam com o agente principal. Quem escreveu não deve ser quem revisa.

### 10.4 Segurança com conteúdo do alvo

> Aprofundamento teórico no [`GUIA-SEGURANCA.md`](GUIA-SEGURANCA.md).

Tudo que vem do alvo (texto de páginas, comentários no código, arquivos) é **dado**, nunca
instrução. Um site pode conter "ignore as instruções anteriores e ...". A LLM deve tratar isso
como texto a registrar, não como ordem. Se ela começar a seguir comandos que apareceram dentro
do alvo, pare.

### 10.5 Custo e velocidade

- Capture primeiro, pense depois: uma captura boa evita dez perguntas.
- Reaproveite evidência (o REA retém resultados) em vez de repetir chamadas idênticas.
- Peça resumos em arquivo, não na conversa.

---

## 11. Uso responsável

Isto não é aconselhamento jurídico. As regras variam por país, tipo de obra e contrato.

### 11.1 O caminho mais seguro

1. Estude o **comportamento**.
2. Escreva **código e assets próprios** a partir da sua spec.
3. Registre de onde veio qualquer coisa copiada (`06-delivery/PROVENANCE.md`).

### 11.2 O que a skill não faz

Não ensina a contornar login, paywall, DRM, CAPTCHA, assinatura de código ou limite de uso; não
coleta dados de terceiros; não remove avisos de autoria. Se o alvo exige login, isso é um
resultado da investigação, não um obstáculo a vencer.

### 11.3 Boas práticas

- Trabalhe em cópia e, se puder, em VM ou conta separada.
- Não rode programa desconhecido na máquina principal.
- Respeite limites de requisição; sem varredura agressiva.
- Mantenha segredos, cookies e dados pessoais fora da evidência. Revise o HTML e os corpos
  capturados antes de compartilhar.
- Ao publicar o clone, use nome, logo e textos próprios.

### 11.4 Se a sua LLM perguntar sobre permissão

Algumas LLMs perguntam se você tem autorização antes de analisar um alvo. É uma salvaguarda do
modelo e funciona melhor quando você é claro:

- **Diga a sua situação real e o objetivo:** aprender, recriar a ideia, migrar um sistema seu,
  estudar um concorrente.
- **Peça o modo "só comportamento":** você observa o que o programa faz e escreve o seu, sem
  copiar código nem assets.
- **Alvo seu ou open source:** cite a licença.
- **Tem permissão do dono?** Diga quem deu e como (e-mail, contrato) e guarde o registro.
- **A LLM recusou?** Não insista com artifícios. Reduza o escopo ao que é público e observável,
  troque de alvo ou pratique o método com algo seu ou open source.

### 11.5 Publicar ou vender

Distribuir um clone de produto comercial pode violar marca, direito autoral ou concorrência
desleal. Para estudo, uso pessoal e portfólio o risco é menor. Para publicar ou vender,
consulte um advogado.

---

## 12. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `Playwright não encontrado` (saída 3) | rodou fora da pasta com `npm i -D playwright` | `cd` para a pasta do clone; `npm i -D playwright && npx playwright install chromium` |
| `Não foi possível abrir o navegador` (saída 4) | Chromium não instalado | `npx playwright install chromium` ou `--browser "<chrome.exe>"` |
| `A página não carregou` (saída 5) | rede, bloqueio, tempo curto | confira o `manifest.json` (`warnings`); aumente `--timeout`; teste a URL no navegador |
| A página pede CAPTCHA ou bloqueia robô | proteção anti-automação | **não contorne**; capture manualmente o que é público ou troque de alvo |
| `networkidle falhou` no aviso | SPA que nunca fica ociosa | normal; o script usa `domcontentloaded` |
| `aria.txt` vazio | Playwright antigo (`ariaSnapshot` pede 1.49+) | `npm i -D playwright@latest` |
| Muitos `[redacted]` no HTML | redação automática pegou texto parecido com token | normal; o original não é guardado; use `--name` e revise |
| `rea: command not found` | REA não instalado ou fora do PATH | `node scripts/install-rea.mjs --yes --client <cliente>`; abra um terminal novo |
| REA não roda | Node antigo | REA exige Node 22.19+, 24.11+ ou 26+; atualize pela LTS |
| A LLM não vê as ferramentas do REA | cliente não reiniciado | reinicie o agente após o `rea setup` |
| `rea setup --all-detected` falha | um cliente aberto reescreve a configuração | feche o cliente ou use `--client <nome>` |
| "No app is open" no REA | ordem de chamada | abra o alvo antes de observar; feche no fim |
| Saída do REA gigantesca | pediu o resultado completo | use `detail: "summary"` e `inspect-analysis-view`, ou `--filter-output` |
| Árvore UIA vazia (código 2) | janela minimizada/suspensa (UWP) | traga a janela para a frente e rode de novo |
| `capture-desktop` lista janelas e sai (código 3) | você não escolheu a janela | use `-Title`, `-ProcessName` ou `-Hwnd` |
| Screenshot desktop cortado | escala da tela ≠ 100% | o script já corrige o DPI; atualize a skill |
| Ghidra estoura o tempo | binário grande (> ~5 MB) | registre o limite; use strings, recursos e comportamento |
| `Nada para comparar` (compare-behavior, código 2) | duas matrizes vazias ou tudo ignorado | revise `--ignore`; `--allow-empty` só se for intencional |
| `compare-behavior` falha em campos que mudam | datas, ids gerados | `--ignore campo` e registre no `VERIFICATION.md` |
| `new-clone` diz "pasta já existe" | pasta não vazia | use `--force` (só cria o que falta, nunca sobrescreve) |
| Teste do clone passa "sem querer" | alvo ainda aberto, ou cache | feche o alvo e limpe o armazenamento do navegador |

---

## 13. Cola de comandos

```bash
# Ambiente
node scripts/doctor.mjs
node scripts/install-rea.mjs --check
node scripts/install-rea.mjs --yes --client claude_code

# Começar
node scripts/new-clone.mjs --target "https://exemplo.com" --name "Meu Clone" --dir clones/meu-clone

# Web
npx playwright codegen --save-storage=clones/meu-clone/auth.json "https://exemplo.com/login"
node scripts/capture-web.mjs --url "https://exemplo.com" --out clones/meu-clone/01-evidence/web --name home
node scripts/capture-web.mjs --url "https://exemplo.com/app" --storage clones/meu-clone/auth.json --bodies --out clones/meu-clone/01-evidence/web --name app

# Desktop (Windows)
node scripts/inventory-files.mjs --dir "C:/Program Files/App" --out clones/app/01-evidence/desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-desktop.ps1 -ListWindows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-desktop.ps1 -Title "*App*" -OutDir clones\app\01-evidence\desktop

# REA
rea --version
rea doctor --skill
rea analyze-javascript-application "<app.asar>" --json > 02-rea/app.json
rea capture-browser-scenario 02-rea/scenario.json --format json > 01-evidence/web/capture.json
rea export-web-scripts "<abs>/01-evidence/web/capture.json" "<abs>/02-rea/web-scripts"   # caminhos absolutos; pasta de saída inexistente
rea compare-web-captures capA.json capB.json --format md

# Verificação
node scripts/compare-behavior.mjs --expected alvo.json --actual clone.json --ignore id,criadoEm --out diff.json
npx playwright test
```

---

## 14. Glossário

| Termo | Significado |
|---|---|
| **Alvo** | o site ou programa que você está estudando |
| **ARIA / árvore de acessibilidade** | descrição semântica da interface (botões, campos, títulos) |
| **ASAR** | arquivo que agrupa o JavaScript de um app Electron |
| **Bundle** | JavaScript empacotado de um site ou app, geralmente minificado |
| **Caixa-preta / cinza / branca** | quanto do interior você enxerga |
| **Contrato** | formato combinado de entrada e saída de uma API, canal ou arquivo |
| **Decompilação** | reconstruir código aproximado a partir de um binário |
| **E2E** | teste de ponta a ponta, simulando o uso real |
| **Electron** | tecnologia que empacota um site como programa desktop |
| **Evidência** | registro com fonte, data, ferramenta e limites |
| **Feature parity** | o clone faz tudo o que o alvo faz |
| **Fuses (Electron)** | chaves de segurança embutidas no executável do Electron |
| **HAR** | arquivo com o registro de tudo que o navegador pediu à rede |
| **HWND** | identificador de uma janela no Windows |
| **IPC** | comunicação entre processos (no Electron, entre interface e processo principal) |
| **MCP** | protocolo para um agente chamar ferramentas externas |
| **Minificação** | encurtar nomes e remover espaços do código para reduzir tamanho |
| **MSIX / UWP** | formato de apps da Microsoft Store |
| **Observado / inferido / não verificado** | grau de certeza de uma afirmação |
| **P0 / P1 / P2** | prioridades: essencial, importante, polimento |
| **Paridade** | grau de igualdade de comportamento entre alvo e clone |
| **Provider (REA)** | motor externo usado pelo REA, como Ghidra ou Hopper |
| **Redação** | trocar segredos por `[redacted]` antes de guardar |
| **REA** | Reverse Engineer Anything: CLI, servidor MCP e skill para análise |
| **Source map** | arquivo que liga o código minificado ao original |
| **Spec** | descrição escrita do comportamento esperado |
| **SPA** | site de página única que troca o conteúdo sem recarregar |
| **UIA** | UI Automation, a API de acessibilidade do Windows |

---

*Guia da skill Clonar Programa, do Dark Sem Filtro. Uso pessoal, educacional e não comercial
(veja [`LICENSE`](LICENSE)). O conteúdo sobre o REA reflete a versão 6.7.0; confirme flags e
novidades em `rea <comando> --help` e no repositório oficial do projeto.*
