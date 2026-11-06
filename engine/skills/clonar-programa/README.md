<p align="center">
  <img src="assets/cover.png" alt="Clonar Programa com método — skill do Dark Sem Filtro" width="100%">
</p>

# Clonar Programa

**Uma skill para você clonar um site ou programa desktop sem começar do zero.** Ela guia a sua
LLM por um método simples, usando o **REA** e o **Playwright**:

> **evidência → spec → código próprio → paridade**

Feita para a comunidade do [Dark Sem Filtro](https://darksemfiltro.github.io/): você cola um
prompt, responde a cinco perguntas e a LLM conduz o resto.

[![Licença: uso pessoal e não comercial](https://img.shields.io/badge/licen%C3%A7a-uso%20pessoal%20e%20n%C3%A3o%20comercial-f08a66.svg)](LICENSE)
[![Versão](https://img.shields.io/badge/vers%C3%A3o-1.0.0-f08a66.svg)](CHANGELOG.md)

## Tutorial em vídeo

Veja como instalar a skill, responder à entrevista inicial e acompanhar um teste no OpenCode.

<p align="center">
  <a href="https://youtu.be/Fsg7kkCIUFY">
    <img src="assets/tutorial-youtube.jpg" alt="Assistir ao tutorial: PARE DE PAGAR ASSINATURA! Clone seu próprio Studio de Canal Dark" width="800">
  </a>
</p>

**[▶ Assistir ao tutorial completo no YouTube](https://youtu.be/Fsg7kkCIUFY)**

## Instalar em 1 minuto

1. Abra um agente com acesso ao computador (Claude Code, OpenCode ou Codex).
2. Copie o **[prompt de instalação](prompts/INSTALL-LLM.md)** e cole como primeira mensagem.
3. Responda às perguntas. A LLM baixa a skill, instala o que falta e começa. Para a skill ficar
   disponível em **qualquer pasta**, copie-a também para a pasta de skills do seu agente (tabela da
   [instalação manual](#instalação-manual)).

Sem agente? Use o ZIP ou a instalação manual, logo abaixo.

## Instalação via ZIP (sem Git)

Se você não quer usar o Git, baixe o ZIP da release e peça para a LLM instalar o resto:

1. Baixe **`clonar-programa.zip`**:
   https://github.com/darksemfiltro/clonar-programa/releases/latest/download/clonar-programa.zip
   - Se o arquivo vier como **`.rar`** (acontece quando alguém repassa por mensageiro ou
     outro site), extraia com **7-Zip** ou **WinRAR** no Windows, ou com `unar` no macOS e Linux.
2. Extraia numa pasta de sua escolha (o ZIP traz uma pasta raiz `clonar-programa/`), por exemplo `~/clones/clonar-programa` (macOS/Linux) ou
   `D:\clones\clonar-programa` (Windows). Confirme que existe um arquivo `SKILL.md` lá dentro.
3. Abra o agente **dentro dessa pasta** (ou informe o caminho completo).
4. Cole o [prompt de instalação](prompts/INSTALL-LLM.md). Ele confere o ambiente, instala o que
   faltar e faz a entrevista antes de qualquer captura.

Ou, em vez do prompt completo, uma mensagem curta:

```text
Leia o SKILL.md e o prompts/INSTALL-LLM.md desta pasta, rode node scripts/doctor.mjs,
instale o que faltar (pedindo minha permissão) e faça a entrevista de intake. Não comece a
capturar nada sem a minha confirmação.
```

## Instalação manual

Copie a pasta da skill (a que tem o `SKILL.md`) para o diretório de skills do seu agente.
O nome da pasta precisa ser `clonar-programa`.

| Agente | Destino |
|---|---|
| Claude Code | `~/.claude/skills/clonar-programa` |
| OpenCode | `~/.config/opencode/skills/clonar-programa` |
| Codex | `~/.codex/skills/clonar-programa` |
| Gemini CLI | `~/.gemini/skills/clonar-programa` |

Depois, no terminal, dentro da pasta da skill:

```bash
node scripts/doctor.mjs                                          # confere o ambiente
node scripts/install-rea.mjs --check                             # vê se o REA está instalado
node scripts/install-rea.mjs --yes --client claude_code          # instala o REA (ou opencode, codex)
```

E, só se o alvo for um site, na pasta onde você vai trabalhar:

```bash
npm init -y
npm i -D playwright
npx playwright install chromium
```

Reinicie o agente para ele enxergar a skill. Requisitos e detalhes por sistema em
[`references/requisitos.md`](references/requisitos.md).

## O que você ganha

- Uma **entrevista curta** (alvo, nome, pasta, escopo) e um workspace organizado.
- **Captura automática** de sites (`capture-web.mjs`) e de janelas de programas no Windows
  (`capture-desktop.ps1`), com redação de tokens e senhas.
- **Inventário** de programas instalados: hashes, tecnologia, licenças e conteúdo do `app.asar`.
- **Templates** de arquitetura, funcionalidades, plano e verificação.
- **Comparador de comportamento** (`compare-behavior.mjs`) para provar que o clone se comporta
  como o original.
- Orientação para usar o **REA** (análise de bundles, Electron, ASAR e cenários de navegador).

## Fluxo

| Fase | O que acontece | Onde fica |
|---|---|---|
| 0 | cria o workspace | `new-clone.mjs` |
| 1 | congela o alvo (versão, hash, data) | `00-intake/` |
| 2 | captura evidências | `01-evidence/` |
| 3 | reconstrói a arquitetura com o REA | `02-rea/`, `03-spec/` |
| 4 | lista as funcionalidades (P0, P1, P2) | `03-spec/FEATURES.md` |
| 5 | troca os assets por assets próprios | `references/licencas-assets.md` |
| 6 | escreve a spec e o plano | `03-spec/` |
| 7 | implementa e prova a paridade | `04-build/`, `05-verification/` |
| 8 | entrega | `06-delivery/` |

## Uso rápido (sem LLM)

```bash
node scripts/doctor.mjs                                        # confere o ambiente
node scripts/new-clone.mjs --target "https://exemplo.com" --name "Meu Clone"
node scripts/capture-web.mjs --url "https://exemplo.com" --out clones/meu-clone/01-evidence/web --name home
```

Programa desktop (Windows):

```powershell
node scripts/inventory-files.mjs --dir "C:\Program Files\App" --out clones\app\01-evidence\desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-desktop.ps1 -ListWindows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-desktop.ps1 -Title "*App*" -OutDir clones\app\01-evidence\desktop
```

Os scripts de captura web precisam do Playwright na **pasta de trabalho** de onde você os roda
(`npm init -y`, depois `npm i -D playwright`, depois `npx playwright install chromium`; um
comando por linha). Os clones ficam em `clones/` dentro dela.

## Requisitos

- **Node.js 18+** e npm para os scripts da skill. O **REA** exige Node 22.19+ (ou 24.11+, ou 26+): use a versão LTS atual.
- **REA** (`npm i -g rea-agents`) + skill `reverse-engineer-anything`: `node scripts/install-rea.mjs --yes --client <seu-cliente>`.
- **Playwright**, para sites.

Detalhes em [`references/requisitos.md`](references/requisitos.md).

## Uso responsável

A skill pergunta a sua relação com o alvo uma vez, anota e segue; não pede prova nem trava o
fluxo. O caminho padrão é **estudar o comportamento e escrever código e assets próprios**, que
é o mais seguro. A skill não ensina a contornar login, paywall, DRM ou CAPTCHA. Isto não é
aconselhamento jurídico. Veja [`references/legalidade.md`](references/legalidade.md).

## Limitações

O REA gera **evidência**, não um clone pronto. Ele não vê `eval`, IPC dinâmico nem plugins de
runtime, e não recupera o que mora no servidor ou em modelos de IA. Detalhes em
[`references/limitacoes.md`](references/limitacoes.md).

## Guias

- [**GUIA-COMPLETO.md**](GUIA-COMPLETO.md): engenharia reversa, REA, como a skill funciona, passo a passo para web e desktop, dicas e solução de problemas.
- [**GUIA-SEGURANCA.md**](GUIA-SEGURANCA.md): prompt injection, jailbreak e o lado ofensivo da engenharia reversa, só em teoria, com caminhos de estudo e higiene para usar a skill com segurança.

## Estrutura

```
SKILL.md                 instruções para o agente
prompts/INSTALL-LLM.md   prompt de instalação
references/              metodologia, REA, web, desktop, limitações, legalidade, checklists
templates/               modelos de intake, evidência, arquitetura, funcionalidades, plano, verificação
scripts/                 doctor, install-rea, new-clone, capture-web, capture-desktop, inventory-files, compare-behavior
assets/                  capa
GUIA-COMPLETO.md         guia aprofundado
GUIA-SEGURANCA.md        guia teórico de segurança
```

## Licença

Uso pessoal, educacional e não comercial, no nome do **Dark Sem Filtro**. Monetização é
proibida (venda, assinatura, anúncio, curso pago etc.); uso comercial só com autorização por
escrito. Mantenha os créditos nas cópias. Texto completo em [`LICENSE`](LICENSE). REA,
Playwright e Node.js têm as próprias licenças.
