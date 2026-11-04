# Vários números de WhatsApp (plano v2, implementado)

**Estado:** código pronto e testado (1571 testes, tipos e lint verdes; telas conferidas no modo demonstração). **Migração aplicada
no Supabase em 27/10/2026** (`supabase/migrations/20261027000000_numbers.sql`, pelo SQL Editor, por você). Conferida só com leitura:
1 número (o "Número 1", original), 96 conversas e 284 mensagens, todas com número, nenhuma com número diferente da conversa, 37 na
fila como antes, RLS ligada e 1 política, 3 gatilhos novos e `claim_next_message(p_now, p_account)` fechada para anon e logado.
Falta reiniciar o painel e o worker com o código novo e conectar os números de verdade no GOWA. Com um número só, tudo segue
exatamente como sempre.

## 1. O que foi pedido

- Conectar mais de um número (começar com 4, poder passar disso).
- **Quem escolhe o número é o dono**: "estética São Paulo, tenho 20 leads, seleciono o número 2", e o agente organiza as mensagens.
- Uma aba que mostra os números conectados, onde o dono **só edita o nome** (Número 1, 2, 3, 4).
- **Variação de mensagem e de abordagem é obrigatória**: o agente não pode abrir todo mundo com "Oi, meu nome é fulano", porque a
  Meta identifica o padrão e bane ou restringe a conta.

O plano v1 sorteava o número de cada lead. Este (v2) troca o sorteio pela escolha manual e acrescenta o sistema de variação.

## 2. Como funciona, de ponta a ponta

```
Caçador → você qualifica os leads → Fila: "Leads liberados" (por ramo e cidade)
                                          │  você escolhe o número do grupo e quantos
                                          ▼
                       agente escreve a abertura de cada lead, já como conversa DAQUELE número
                                          │  (todas com saudação, apresentação, pergunta e ângulo diferentes)
                                          ▼
                       rascunhos (com o crachá do número) → você aprova → horários planejados POR NÚMERO
                                          │
                       worker: uma volta passa pelos números em ordem sorteada, UMA mensagem no total por volta
                                          ▼
                       a resposta chega pelo aparelho certo (device_id) → mesma conversa → agente atende
```

1. **Conectar.** Em **Números** você dá o nome e conecta o WhatsApp (QR code ou código de pareamento). O painel cria o aparelho
   no GOWA, cadastra o número **pausado** e com teto de iniciante (8, 15, 25 por dia). Você libera o envio quando quiser.
2. **Liberar leads.** Qualificar no Caçador continua igual. A Fila ganha o painel **Leads liberados (N)**: os leads qualificados,
   com celular válido e sem abertura na Fila, agrupados por ramo e cidade. Em cada grupo: número, quantidade (os melhores
   primeiro) e **Preparar**.
3. **O agente escreve.** Uma abertura por lead, como rascunho. O aviso diz quantos dias úteis o lote leva com o teto daquele
   número ("20 leads, teto de 8 por dia: 3 dias úteis").
4. **Aprovar e enviar.** Aprovar planeja os horários **por número** (janela, dias, intervalo aleatório e teto do dia de cada um).
5. **Um lead, um número.** Depois do primeiro contato a conversa pertence àquele número para sempre; nenhum outro o aborda.
   Enquanto só há rascunhos cancelados (nada saiu), o lead ainda pode mudar de número.

Lead sem número escolhido **não entra na Fila** com vários números (o lote do dia sozinho só cuida de follow-up).

## 3. Variação das aberturas (o que protege a conta)

Cada abertura combina quatro peças, escolhidas por `variation.ts`:

| Peça | Opções | Exemplo |
|---|---|---|
| Saudação | 5 informais, 3 sóbrias (advocacia, contabilidade) | "Oi, Dra. Heloisa!", "Dra. Heloisa, oi!", "Olá, Dra. Heloisa." |
| Apresentação | 5 | "Sou o X, desenvolvedor.", "Aqui é o X…", "X aqui…", "Me chamo X…", "Prazer, X…" |
| Ângulo | 5 por grupo (sem site, só Instagram, site fraco) | elogio e dor, quem pesquisa, agenda, direta, simples |
| Pergunta final | 4 por família | "Posso te explicar como funciona?", "Quer que eu te explique…?", "Faz sentido eu te explicar…?" |

| O que ele faz | 8 formas ("desenvolvedor", "desenvolvedor web", "desenvolvedor de sites", "criador de sites para negócios locais"…) | só 1 em 8 usa a frase longa das Configurações |

Mais o dado real de cada lead (nome, bairro, nota). São milhares de combinações por ângulo.

**Por que "o que ele faz" é uma peça própria (28/10).** A primeira fila real (35 aberturas) saiu com saudação, verbo e pergunta
diferentes, mas TODAS terminavam a apresentação com a mesma frase de 60 caracteres ("…desenvolvedor e ajudo empresas a se
posicionarem na internet"): o trecho que o WhatsApp reconhece como texto repetido. Agora essa frase também é sorteada (8 formas), a IA
é obrigada a usá-la (o validador recusa o texto que volta para a frase fixa) e o código de estilo ganhou o `r`
(`abertura-none-elogio-ia~g1i2q3r5`).

**Como a escolha é feita**
- **Menos usada primeiro.** Cada peça vem de uma das opções usadas há mais tempo (as nunca usadas lideram), com sorteio entre a
  metade mais antiga. O histórico é o das últimas 200 aberturas de **todos os números**, então dois números não se parecem entre si.
- **Trava de semelhança.** O texto pronto é comparado com as últimas 30 aberturas (trechos de três palavras). Se passar de 60% de
  semelhança, o sistema tenta outro ângulo e outra combinação (até 8 vezes) e fica com a menos parecida.
- **A IA também varia.** Quando a IA escreve, o prompt leva a saudação, a apresentação e a pergunta escolhidas; o texto continua
  passando pelas mesmas travas de antes (nome da pessoa, nada de preço, uma pergunta só, humanizador).
- **Rastreável.** A variante da mensagem guarda o código (`abertura-none-elogio-ia~g1i2q3`). O teste A/B do painel agrupa só por
  ângulo, então a estatística não se fragmenta.
- **Reescrever** um rascunho tira um jeito diferente do que ele já tinha.

O que a variação **não** faz: não esconde a automação da Meta e não substitui o que realmente derruba conta (denúncias, bloqueios,
pouca resposta, volume alto num número novo). Por isso continuam valendo o aquecimento por número, o teto baixo, a linha "responda
PARE", a parada automática por pouca resposta e o intervalo aleatório.

## 4. O que é de cada número e o que é de todos

| De cada número | De todos |
|---|---|
| Fila (aprovadas, horários), teto por dia e aquecimento (rampa conta do primeiro envio dele) | Janelas de horário, dias da semana e intervalos (Configurações) |
| Intervalo mínimo entre envios e "último envio" | Lista de bloqueio (**opt-out vale para todos**) |
| Pausa e contagem de falhas seguidas | Pausa geral (para todos) e simulação/envio real |
| Parada automática por pouca resposta (taxa do número) | Agente, regras de resposta e perfil de quem fala |
| Conexão do WhatsApp (aparelho no GOWA) | Funil, leads, financeiro |

- A falha de um número **pausa só ele**; os outros seguem. Um número desconectado não trava a volta dos outros.
- **Uma mensagem por vez no total.** Cada volta do worker (~20 s) passa pelos números em ordem sorteada e termina no primeiro envio,
  então dois números nunca mandam no mesmo instante.
- Resposta que chega **em outro número** que não o que abordou (o lead salvou o contato errado): o agente não responde por um número
  que não o abordou; a conversa vai para "Precisa de você" com um aviso no feed.

## 5. Modelo de dados (migração `20261027000000_numbers.sql`)

- `whatsapp_accounts`: nome, `gowa_device_id`, telefone, `jid` (é o `device_id` que o webhook manda), pausa e motivo, aposentado,
  posição, teto (`caps`), início do aquecimento, último envio, falhas seguidas, último resultado. Nasce com o **Número 1** (o
  original, `legacy`), que continua guardando seu estado em `settings.automation_state` e usando o teto das Configurações.
- `conversations.account_id` e `messages.account_id`: tudo o que já existia vira do Número 1 (sem mexer em `updated_at`).
  Gatilhos: conversa nova sem número fica com o original; a mensagem nasce com o número da conversa; **depois do primeiro contato o
  número da conversa não muda** (regra no banco).
- `claim_next_message(p_now, p_account default null)`: sem número pega de qualquer um (como antes), com número só as dele.
- Só acrescenta. Nada é apagado. Sem a tabela, o código lê "nenhum número" e age como painel de um número só.

## 6. Como conectar os números (passo a passo)

1. **Antes de tudo**, fixe o aparelho atual: com mais de um aparelho o GOWA deixa de ter "padrão" e toda chamada precisa de
   `X-Device-Id`. Ao adicionar o 2º número, o painel faz isso sozinho (liga o Número 1 ao único aparelho que existe ou ao
   `GOWA_DEVICE_ID` do `.env.local`); se houver dúvida, ele para e pede o `GOWA_DEVICE_ID`.
2. Faça backup da pasta `gowa\storages` (é onde ficam os logins de todos os números).
3. Aplique a migração no Supabase.
4. **Números → Adicionar número**: dê o nome. O painel cria o aparelho no GOWA e cadastra o número pausado.
5. **Conectar por QR** (WhatsApp do celular daquele número → Aparelhos conectados → Conectar um aparelho) ou **por código** (sem
   câmera: digite o telefone, gere o código e digite no celular). Clique em "Já escaneei, conferir": o painel guarda o telefone e o
   endereço do aparelho (é por ele que a resposta acha o número).
6. Em **Ajustes** do número, confira o teto (8, 15, 25 por dia é o padrão de número novo).
7. Libere o envio e escolha o número dos grupos na Fila.

O webhook continua um só (`/api/webhooks/wa`, mesmo segredo): todo evento traz o `device_id` e o painel descobre o número.

### Trocar o aparelho de um número (restrição, conexão ruim, aparelho apagado no GOWA)

Quando um número é restringido (ou a conexão fica ruim), a rotina é **não reconectar na mesma instância**: criar um aparelho novo no
GOWA e ligar o número a ele. Em **Números → Ajustes → "Trocar o aparelho (criar um novo)"** o painel faz isso de uma vez: cria o
aparelho, liga o número a ele (nome, conversas e fila ficam), deixa o número **pausado** e já mostra o QR. Depois de conectar, você
libera o envio. O aparelho antigo, se ainda existir, **não é apagado** (o painel nunca apaga nada no GOWA).

Se o aparelho for **apagado direto no GOWA**, o painel não apaga o número junto, de propósito: o número carrega as conversas e a
fila dele. O que ele faz é perceber (404 do GOWA), **pausar só aquele número** na próxima volta do worker, com o motivo, e mostrar
"Sem aparelho" no cartão, com duas saídas: **Conectar em aparelho novo**, ou **usar um aparelho que já existe** no GOWA e nenhum
número usa. "Liberar envio" fica travado até o número ter um aparelho. Um aparelho serve a um número ativo por vez; **aposentar** um
número devolve o aparelho dele (sem apagar nada no GOWA).

## 7. Capacidade e aquecimento

Teto padrão de número novo: 8 por dia na 1ª semana, 15 na 2ª e 25 depois. Com 4 números isso é 32, 60 e 100 abordagens por dia no
total. Recomendação: **não suba o teto de um número antes de ele ter respostas reais**, e não conecte os 4 de uma vez com volume
cheio; entre um por semana. Um número que a Meta restringe se perde sozinho: os outros três continuam.

## 8. O que não muda com um número só

Com um número cadastrado (o original) ou nenhum, `multi` é falso: nenhuma consulta leva filtro de número, o lote do dia escolhe os
leads sozinho, os horários e o teto são os de sempre e o estado fica onde sempre ficou. Os 1528 testes que existiam antes passam
sem alteração de comportamento (só dois ganharam o código de estilo na variante e um passou a contar o novo ângulo "simples").

## 9. O que foi construído

| Parte | Onde |
|---|---|
| Número, teto efetivo, reconhecer o aparelho | `src/lib/outreach/accounts.ts` |
| Elenco, contadores por número | `roster.ts` |
| Cadastro, pausa, aposentar, retrato, grupos liberados, sincronizar aparelhos | `numbers.ts` |
| Administração dos aparelhos do GOWA (lista, criar, QR, código, reconectar, sair) | `gowa-admin.ts` |
| Provedor por número, provedor padrão das telas | `runtime.ts` |
| Volta por número (`tickAll`), envio, aprovação e follow-up por número, `prepareLeadsForAccount` | `engine.ts` |
| Variação: estilo, menos usada, semelhança | `style.ts`, `variation.ts`, `templates.ts`, `opening.ts` |
| Webhook com `device_id` | `webhook.ts`, `api/webhooks/wa/route.ts` |
| Telas: Números, Leads liberados, crachás, painel no Comando, pulso | `(app)/numeros`, `fila`, `components/numbers/*` |
| Banco | `supabase/migrations/20261027000000_numbers.sql` |
| Testes | `multi-number.test.ts` (41), `webhook.test.ts` |

Para ver as telas sem WhatsApp: `npm run dev:demo -- --numeros=3` (modo demonstração: dados fictícios, em memória, porta 3200).

## 10. Riscos

| Risco | Como é tratado |
|---|---|
| Meta identifica texto repetido | variação por peça + trava de semelhança entre todos os números; a variante fica gravada |
| Um número é restringido | pausa e parada por pouca resposta são por número; os outros seguem |
| A resposta chega no número errado | o `device_id` do webhook acha o número; em outro número, o agente não responde |
| Dois números mandam juntos | uma mensagem por volta no total, ordem sorteada |
| Lead abordado por dois números | conversa única por lead e número fixo depois do 1º contato (regra no banco) |
| Quem pediu para parar recebe de outro número | opt-out é por telefone do lead, vale para todos |
| Conectar o 2º aparelho quebra o primeiro | o painel fixa o aparelho do Número 1 antes de criar o 2º |
| Migração aplicada com o painel no ar | só acrescenta; `claim_next_message` mantém a chamada antiga; sem a tabela o código age como um número só |
| Perder a pasta de sessões do GOWA | backup de `gowa\storages` antes de começar |

## 11. O que falta

- [x] **Migração aplicada** no Supabase (27/10/2026, pelo SQL Editor; a chamada pelo assistente foi recusada duas vezes). Ela não
  aparece em `list_migrations` porque o SQL Editor não grava no histórico; se um dia usar `supabase db push`, marque-a antes com
  `supabase migration repair --status applied 20261027000000`.
- [ ] **Reiniciar o painel e o worker** (o código novo só vale depois) e abrir **Números** para ver o "Número 1".
- [ ] Conectar os números de verdade e fazer um teste curto com 2 (1 ou 2 mensagens a números seus) antes de soltar os leads.
- [ ] Ver o primeiro lote real com o código de estilo gravado e conferir o teste A/B por ângulo na semana seguinte.

## 12. Decisões em aberto

- Qual teto inicial para cada número (hoje 8/15/25)?
- Quantos números ativos na primeira semana (recomendado: 1 ou 2, subindo)?
- Quando um número é aposentado, os leads dele voltam para "liberados" (é o que acontece). Prefere que passem direto para outro número?
