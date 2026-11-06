# Assets, créditos e proveniência

## A regra prática

O caminho padrão é **trocar** o que o alvo tem por algo seu. Copiar só vale quando a licença
permite e você sabe qual é. Na dúvida, recrie. Ninguém vai pedir prova de licença aqui; a ideia
é você ter um registro simples do que usou.

## Inventário de assets

Rode, para programas instalados:

```bash
node scripts/inventory-files.mjs --dir "<pasta-do-programa>" --out "$W/01-evidence/desktop"
```

Ele lista arquivos, hashes, licenças encontradas (`licenses.txt`) e o conteúdo do `app.asar`
(`asar-1.json`, com imagens, fontes e áudio). Para sites, use `*-network.json` (filtre por
`image`, `font`, `media`).

Preencha uma tabela simples (no `EVIDENCE-INDEX.md` ou `06-delivery/`):

| Item | Origem | Pode copiar? | O que fiz |
|---|---|---|---|
| ícone de salvar | site do alvo | não sei | recriei com Lucide |
| fonte Inter | Google Fonts (OFL) | sim | usei, com crédito |
| texto da home | site do alvo | não | reescrevi |

## O que trocar por quê

- **Imagens e fotos:** banco livre ou geradas por você; anote autor e licença.
- **Ícones:** Lucide, Heroicons, Tabler (licenças livres) ou recriados.
- **Fontes:** Google Fonts (OFL) ou equivalentes; mantenha o arquivo de licença.
- **Áudio e vídeo:** biblioteca livre ou produção própria.
- **Textos:** reescreva; não cole descrições longas.
- **Marca e logo:** crie identidade própria.
- **Dados de exemplo:** gere dados sintéticos; nunca copie banco de produção.

## Se você pode copiar código

É seu, open source ou tem permissão? Pode copiar. Registre em `06-delivery/PROVENANCE.md`:

```
Arquivo: src/lib/foo.ts
Origem: https://github.com/org/repo/blob/v1.2.3/src/lib/foo.ts
Licença: MIT (Copyright 2025 Org)
Modificado: sim (adaptado para TypeScript)
```

Dicas: licenças MIT/Apache/BSD pedem só manter o aviso de copyright. GPL/AGPL podem exigir
abrir o seu código ao distribuir; se o seu clone não for GPL, prefira reimplementar.

## No README do clone

- o que é original;
- o que foi inspirado no comportamento de outro produto;
- licenças de dependências e assets;
- como reportar um problema.
