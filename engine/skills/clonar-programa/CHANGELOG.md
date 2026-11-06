# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-11-01

Skill para clonar **sites e programas desktop** com REA e Playwright, feita para iniciantes.

### Inclui

- `SKILL.md` com entrevista curta, fases 0 a 8, licença leve (pergunta uma vez, sem trava) e
  padrão "só comportamento".
- Prompt de instalação para colar na LLM (`prompts/INSTALL-LLM.md`).
- Scripts: `doctor`, `install-rea`, `new-clone`, `capture-web` (com redação de segredos e
  `--bodies`), `capture-desktop.ps1` (Windows, UI Automation), `inventory-files` (hashes,
  tecnologia, licenças, conteúdo de `app.asar`, versão dos `.exe`) e `compare-behavior`.
- Templates de intake, evidência, arquitetura, funcionalidades, plano e verificação.
- Referências: metodologia, REA, web, desktop, requisitos, limitações, uso responsável, assets,
  checklists.
- `GUIA-COMPLETO.md`: engenharia reversa, REA a fundo, como a skill funciona e passo a passo.
- `GUIA-SEGURANCA.md`: prompt injection, jailbreak e o lado ofensivo da engenharia reversa, em
  nível teórico, com trilha de estudo.
- Capa baseada na paleta do Dark Sem Filtro.

### Requisitos

- Node.js 18+ para os scripts. O REA exige Node 22.19+, 24.11+ ou 26+.
