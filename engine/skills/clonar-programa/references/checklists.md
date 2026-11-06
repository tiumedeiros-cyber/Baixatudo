# Checklists

## Intake

- [ ] alvo, nome e pasta definidos (ou padrão aceito)
- [ ] 3 funcionalidades P0 e o que fica de fora
- [ ] relação com o alvo registrada (se a pessoa quis informar)
- [ ] `doctor.mjs` rodado; REA e Playwright instalados ou "indisponível" anotado

## Evidência

- [ ] versão, hash e data do alvo
- [ ] screenshots em largura de desktop e estreita
- [ ] HTML, ARIA e texto; estados vazio, erro, loading e sucesso
- [ ] rede (URL, status, tipo) e storage sem valores
- [ ] console e erros; grafo do REA, se aplicável
- [ ] índice em `EVIDENCE-INDEX.md` com caminho e ferramenta
- [ ] dados sensíveis removidos (revise HTML e capturas logadas)

## Desktop (Windows)

- [ ] janela escolhida por título, processo ou HWND
- [ ] janela restaurada antes do dump (minimizada = árvore vazia)
- [ ] árvore UIA salva (nomes, automationIds, geometria, padrões)
- [ ] `window.png` conferido; sem dados pessoais à vista
- [ ] inventário rodado (hashes, licenças, conteúdo do `app.asar`)
- [ ] limites declarados (cópia do binário, tempo do Ghidra)

## Funcionalidades e spec

- [ ] toda tela P0 tem linha em `FEATURES.md` com critério de aceite testável
- [ ] fluxos alternativos, erros e limites do alvo listados
- [ ] contratos (entrada, saída, erros) e estados descritos
- [ ] o que não foi observado está marcado como suposição

## Assets e build

- [ ] cada asset do alvo trocado ou com origem anotada
- [ ] stack própria definida; esqueleto do P0 funcionando
- [ ] `PROVENANCE.md` atualizado (se copiou algo)
- [ ] testes por marco (unitário, API, E2E)

## Verificação

- [ ] P0 completo sem o alvo aberto
- [ ] E2E passam com dados próprios; contratos e erros conferidos
- [ ] screenshot diff revisado por uma pessoa
- [ ] erro, offline e teclado testados
- [ ] `compare-behavior.mjs` passou, ou as diferenças estão declaradas
- [ ] relatório de paridade honesto (igual / parcial / ausente / não testado)

## Entrega

- [ ] README de instalação e uso; arquitetura do clone
- [ ] créditos e licenças das dependências
- [ ] o que ficou de fora, riscos e próximos passos
