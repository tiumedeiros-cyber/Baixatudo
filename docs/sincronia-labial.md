# Sincronia labial e expressões — como funciona e como conferir

## O problema que existia

A boca do avatar abria e fechava com **um único número** (o volume do áudio).
Esse número virava uma elipse que crescia e diminuía: a boca "batia no compasso",
mas não formava as letras. Não dava para ver a diferença entre "pá", "fi" e "u",
e a expressão do rosto ficava congelada durante a fala.

## Como está agora

`lib/visemes.ts` implementa o padrão **Oculus/Meta de 15 visemas** (o mesmo usado
por Ready Player Me, TalkingHead e OpenFaceFX):

| visema | sons | boca |
| --- | --- | --- |
| `PP` | p, b, m | lábios pressionados |
| `FF` | f, v | lábio inferior nos dentes |
| `TH` | t, d (com língua) | língua entre os dentes |
| `DD` | t, d, l | língua no alvéolo |
| `kk` | c, qu, g (duro) | língua atrás |
| `CH` | ch, j, g (brando), x inicial | boca projetada |
| `SS` | s, z, ç, c brando | dentes estreitos |
| `nn` | n, m final, ã/õ | nasal, boca quase fechada |
| `RR` | r, rr | boca levemente arredondada |
| `aa` | a, á, â | mandíbula aberta |
| `E` | e, é, ê | boca média e larga |
| `I` | i, y | boca bem larga |
| `O` | o, ó, ô | boca redonda e aberta |
| `U` | u, w | bico fechado |
| `sil` | pausas, vírgula, ponto | boca em repouso |

Fluxo completo:

1. **Texto → fonemas** (`wordVisemes`): regras de português do Brasil — dígrafos
   (`ch`, `lh`, `nh`, `rr`, `ss`, `qu`, `gu`, `sc`), `c`/`g` brandos, `ç`, `x`,
   `m`/`n` no fim de sílaba (nasaliza a vogal) e as reduções de vogal final
   ("leite" → "leiti", "gato" → "gatu"), que é como o TTS brasileiro fala.
2. **Fonemas → linha do tempo** (`buildVisemeTrack`): cada sílaba recebe uma
   duração (vogal dura mais que plosiva) e o total é escalado para a **duração
   real do áudio** daquela narração. Vírgula = 2,2 unidades de pausa; ponto,
   interrogação e exclamação = 4,2. Sobra 2% no começo e 4% no fim (o TTS sempre
   deixa silêncio).
3. **Coarticulação** (`shapeAt`): a boca nunca troca de forma de um quadro para
   o outro — os visemas vizinhos são misturados numa janela de ±55 ms
   (modelo de Cohen–Massaro). É isso que faz a boca "deslizar" em vez de piscar.
4. **Volume real entra como força** (`blendWithAmplitude`): o formato vem da
   letra, a intensidade vem do envelope de 20 ms do áudio. Sílaba fraca abre
   pouco; sílaba forte abre quase tudo.
5. **Desenho** (`components/studio/avatar.ts`): mandíbula, largura, bico,
   pressão dos lábios, dentes, língua e canto da boca (sorriso) são desenhados
   separadamente. Sobrancelha sobe levemente nas sílabas fortes e o olho afina
   no sorriso — a expressão deixa de ser congelada.

Prévia, linha do tempo e exportação usam **o mesmo render**, então o MP4 sai
igual ao que aparece na tela.

## Onde a trilha fica guardada

`clip.avatar.visemes: { t, d, v }[]` — início, duração e nome do visema. Fica
dentro do projeto (JSON), não ocupa storage e não depende de modelo externo.
Uma narração de 30 s gera em torno de 300 eventos (~6 KB).

## Avatar com a foto do usuário

`c:<base64>` com `pu` (URL da foto) e `pm` ("y,w,h" da boca) cria um preset com
a foto do próprio cliente. `drawPhoto` desenha a boca animada por cima, na
posição escolhida, e empurra a faixa da mandíbula para baixo junto com a
abertura. No painel do avatar há três controles (altura, largura e altura da
boca) para encaixar no rosto.

## Como conferir em 30 segundos

1. Painel → **Avatares** → escolha um avatar → escreva uma frase com vogais
   abertas ("Olá, tudo bem? A Ana vai apresentar o produto").
2. Gere o vídeo. Observe a boca: em "Olá" ela abre larga (aa), em "bem" fecha
   nos lábios (nn/PP), em "u" faz bico.
3. No editor, selecione o clip do avatar: o painel mostra
   "Boca sincronizada letra por letra com a narração (N visemas)".

## Teste automatizado do motor

```bash
node node_modules/typescript/bin/tsc lib/visemes.ts --outDir /tmp/vt --module esnext --target es2020
node -e "import('/tmp/vt/visemes.js').then(m=>console.log(m.wordVisemes('parabéns'), m.visemeStats(m.buildVisemeTrack([{text:'Olá! Tudo bem?',duration:3}]))))"
```

O resultado esperado é `PP aa RR aa PP E nn SS` e uma trilha com 10+ visemas
distintos cobrindo a duração do áudio.
