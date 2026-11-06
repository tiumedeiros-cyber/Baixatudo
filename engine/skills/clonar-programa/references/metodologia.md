# Metodologia detalhada

## Princípios

1. **Evidência antes de opinião.** Toda afirmação sobre o alvo tem fonte: captura, screenshot,
   grafo, arquivo, resposta de rede ou teste. O que ninguém viu é **suposição**.
2. **Versão congelada.** URL + data + hash do programa. Sem isso, não há paridade que se repita.
3. **Comportamento é o contrato.** O clone não precisa ter o mesmo código; precisa dar o mesmo
   resultado observável para a mesma entrada.
4. **P0 primeiro.** Um fluxo completo vale mais que 20 telas estáticas.
5. **Reimplemente a partir da spec.** Escreva o código olhando `03-spec/`, não colando trechos
   do alvo. É o que mantém o clone seu.
6. **Honestidade no relatório.** "Não testado" é uma resposta válida.

O que o REA recupera depende de onde mora o "cérebro" do alvo (categorias A–E): veja
[`limitacoes.md`](limitacoes.md).

## Níveis de certeza na spec

| Marca | Significa |
|---|---|
| **observado** | você viu: captura, teste, resposta de API (com caminho da evidência) |
| **inferido** | conclusão razoável a partir do que viu; precisa de teste |
| **não verificado** | hipótese; não vira requisito até alguém confirmar |

## Fase 1 — congelar o alvo

Registre no `INTAKE.md`: URL ou caminho, data, versão, SHA-256, idioma, sistema e conta usada
(sem senha). Perguntas úteis: o alvo muda por região ou idioma? Tem feature flag? Funciona
offline? Tem área de admin? O que fica fora do escopo?

## Fase 2 — capturar

Para cada tela ou fluxo P0, capture: screenshots (largura de desktop e estreita), HTML e ARIA,
texto visível, estados (vazio, erro, loading, sucesso), rede (URL, método, status, tipo; corpos
de API com `--bodies`), storage (só nomes e tamanhos), console e performance.

Não capture senha, token, cookie de sessão, dados de clientes ou conteúdo pago.

## Fase 3 — arquitetura

- **Web:** rotas, bundle e chunks, source maps (se públicos), endpoints, WebSocket, workers.
- **Electron:** main/preload/renderer, IPC, janelas, menus, updater, SQLite, protocolos.
- **Nativo:** módulos, processos, arquivos de configuração, banco, rede, plugins.

Saída: `03-spec/REA.md` (modelo em `templates/REA.md`).

## Fase 4 — funcionalidades

Uma linha em `FEATURES.md` por **comportamento verificável**, não por botão. P0 = sem isso o
produto não serve; P1 = importante; P2 = polimento. Inclua o que o alvo **não** faz. Para cada
P0, escreva o teste E2E antes de implementar.

Fluxos que costumam faltar: primeiro uso, estado vazio, erro de rede, offline, sessão
expirada, importar/exportar, desfazer, busca e filtros, paginação, notificações, idioma e fuso,
limites de plano, admin.

## Fase 5 — assets

Troque por assets próprios ou livres (veja [`licencas-assets.md`](licencas-assets.md)).

## Fase 6 — spec de comportamento e plano

Para cada P0:

```
### F-01 — Criar projeto
Ator / Pré-condições / Entrada / Passos
Estados: inicial, loading, sucesso, erro
Saída e persistência / Efeitos colaterais / Limites
Aceite (testável) / Evidência
```

Inclua contratos exatos quando observáveis: nomes de campos, tipos, códigos de erro, status
HTTP, eventos. Se o alvo usa IPC, documente canal + payload + resposta.

Plano (`CLONE-PLAN.md`), marcos curtos:

- **M0** esqueleto: uma tela, um fluxo, persistência real;
- **M1** P0 completo;
- **M2** P1;
- **M3** polimento: visual, microinterações, desempenho, acessibilidade.

Cada marco tem demo, testes e critério de saída.

## Fase 7 — paridade

Status por funcionalidade (uma escala só):

- **Igual**: comportamento e resultado iguais;
- **Parcial**: o caminho principal funciona; faltam estados ou limites;
- **Ausente**: não implementado;
- **Não testado**: sem evidência.

Se a UX é diferente de propósito, marque **Igual** ou **Parcial** e explique na observação.

Para cada teste, use **passou / falhou / não testado**. Defina o limiar antes de testar, por
exemplo: screenshot diff abaixo de 2% de pixels diferentes por tela e revisão humana; tempo de
abertura até 20% acima do alvo; todo fluxo P0 operável só com teclado.

### Matriz para o `compare-behavior.mjs`

Qualquer JSON serve; o importante é gerar o **mesmo formato** no alvo e no clone:

```json
{ "casos": [ { "entrada": "2+3", "saida": "5", "erro": null } ] }
```

```bash
node scripts/compare-behavior.mjs --expected alvo.json --actual clone.json \
  --ignore criadoEm,'$.casos[].id' --out 05-verification/diff.json
```

Saída 0 = igual, 1 = divergência, 2 = erro (JSON inválido ou nada a comparar). Valores que
mudam sozinhos (datas, ids) entram em `--ignore` e devem ser registrados em
`VERIFICATION.md`.

## Fase 8 — entrega

README de uso, arquitetura do clone, créditos, `PROVENANCE.md` (se copiou algo), o que ficou
de fora e próximos passos.

## Armadilhas comuns

- confundir "tem a tela" com "tem a função";
- ignorar estado vazio e de erro;
- assumir que o grafo do REA cobre 100% (IPC dinâmico, `eval`, plugins);
- medir sucesso com screenshot estático em vez de fluxo;
- deixar o alvo aberto no teste do clone (o clone "funciona" por acidente);
- não guardar a evidência e depois não saber por que o comportamento mudou.
