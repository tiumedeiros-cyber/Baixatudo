# Agente de atendimento

O que o agente faz, como foi "treinado" com os dois repositórios, como ligar a IA e como ensinar coisas novas.

> **Em uma frase:** o agente lê o que o lead escreveu, entende o assunto, qualifica, escreve a resposta no seu jeito e
> diz o que falta para vender. Dois modos: **assistido** (tudo vira rascunho e nada sai sem o seu "Aprovar") e
> **autônomo** (responde sozinho o que é seguro e chama você no resto). Veja "Atendimento sozinho" abaixo.

## Dois fluxos: qualificar (padrão) e prévia automática

Desde 24/10/2026 o padrão é **qualificar**: o agente **nunca oferece prévia**. A prévia automática (modelo preenchido com os
dados do Google) fica genérica demais para vender, então a prévia boa é feita por você. Troque em Configurações, no campo
"Como o agente conduz a conversa". Os dois fluxos existem e têm gabarito próprio (54 casos com prévia e 46 sem).

```
abordagem (sem prévia) → "pode" → o que ele quer? ─┬─ site / landing page → objetivo → material → valor + sinal 50% → "pode" → proposta + Pix
                                                    ├─ sistema ou automação → 5 perguntas (roteiro) → "vou analisar" → FILA DO DONO, com o resumo
                                                    └─ pediu prévia (a qualquer hora) → "vou montar com cuidado" → FILA DO DONO
FILA DO DONO: você faz, manda o link → o agente continua quando o lead responder (gostei → valor → Pix)
```

- **Abordagem e follow-up** (templates): perguntam se vale uma conversa sobre um site, sem falar de prévia.
- **Site (landing page ou site da empresa):** o agente pergunta o objetivo e o que ele já tem (logo, fotos, textos) e só então
  faz a oferta com o valor, o prazo e o sinal das Configurações. A oferta é dinheiro: só sai sozinha com "Pode fechar
  sozinho" ligado, e o aceite cria a proposta e passa o Pix (a prévia **não** é mais exigida). Sem a caixa, a oferta fica
  como rascunho para você.
- **Sistema e automação** (aplicativo, agendamento online, loja virtual, painel, robô de atendimento, "automatizar o
  WhatsApp"): o valor depende do que ele precisa, então é seu. Antes de chamar você, o agente conduz o **roteiro de
  perguntas** abaixo, uma por vez, e no fim avisa "vou analisar com calma e já volto com o valor" **uma vez** e para. Dali em
  diante a conversa é sua e o agente não responde mais. Você recebe o mapa pronto, sem precisar reler a conversa.

### Roteiro de perguntas (qualificação)

Uma pergunta por mensagem, curta, sempre com um comentário sobre o que ele acabou de dizer. Cada pergunta é feita no máximo
**duas vezes**: se ele não responde, o agente segue para a próxima em vez de insistir. Resposta curta no meio do roteiro
("só eu", "uns 15 dias", "não") **vale como resposta**; "não" solto não é recusa. Só "sem interesse", "dispenso" e parecidos
encerram. As perguntas do roteiro saem sozinhas e **não chamam você ainda** (a conversa continua com o agente).

| Produto | Perguntas, na ordem |
|---|---|
| Site | objetivo do site · o que ele já tem (logo, fotos, textos) → oferta |
| Sistema | o que precisa fazer · como faz hoje e o que pesa · quem vai usar · se precisa ligar a algo (WhatsApp, planilha, agenda, pagamento) · para quando quer |
| Automação | o que quer automatizar · como é feito hoje e o que pesa · por onde os clientes dele chamam (WhatsApp, Instagram, telefone) · se precisa ligar a algo · para quando quer |

No fim, a conversa vai para **Criar ou orçar** (e para a fila "Precisa de você" do Agente) com o motivo
`Qualificação completa.` seguido do resumo, que também aparece na ficha e nasce no briefing da Produção:

```
Sistema. O que precisa fazer: “agendamento online”. Como faz hoje e o que pesa: “tudo no caderno…”. Quem vai usar: “a recepção
e os clientes”. Precisa ligar a algo: “não”. Para quando quer: “30 dias”.
```

O que ficou sem resposta aparece como "não respondeu", para você saber o que perguntar. O código está em
`src/lib/agent/discovery.ts` (plano, perguntas, resumo e `isRefusal`); a pergunta feita fica registrada na variante da
mensagem (`agente+auto:q-<passo>`), e é assim que a ficha sabe a qual pergunta cada resposta pertence.
- **Prévia pedida** ("quero ver uma prévia", "como ficaria?", ou "pode" a uma abordagem antiga que oferecia prévia): o agente
  responde "vou montar a prévia com cuidado e te mando por aqui" **uma vez** e espera. Enquanto você não manda, ele não
  responde mais nada (nem preço), para você não perder o controle.
- **Fila do dono:** na tela **Agente**, o painel "Precisa de você" vem no topo, com uma etiqueta por lead (Fazer prévia, Orçar
  sistema, Fechar valor, Marcar sinal...), o que ele quer (site ou sistema) e o próximo passo. Prévia pedida e sistema vêm
  primeiro. A ficha na conversa mostra o que ele respondeu: o que quer, o objetivo do site e o que o sistema faz.
- **Retomada:** quando você manda **um link** (pelo celular ou pelo painel) a um lead que pediu prévia, o sistema entende que
  é a entrega, **não** marca a conversa como assumida por você e tira o lead da fila. Quando ele responde, o agente segue:
  gostei → valor → Pix. Mensagem sua sem link, ou um link quando ele não pediu prévia, continua sendo "você assumiu".
- **IA:** nunca é chamada para quem está com você (prévia pedida, sistema) nem para os avisos de fila; na pergunta livre ela
  não pode oferecer prévia (a trava rejeita), e o prompt dela diz "nunca ofereça prévia".
- **Do fechamento à produção:** o agente fecha o valor e passa o Pix, e a proposta fica em Funil (Proposta) e em Financeiro
  ("falta receber"). O Pix cai na sua conta e o agente não sabe: você clica **"Recebi o sinal"** em Financeiro. Aí o lead
  vira Ganho e o projeto abre em **Produção** já com um **briefing automático** (cliente, o que ele quer nas palavras dele,
  a venda, as últimas 14 mensagens e o que falta pedir), em "Lista e briefing" do cartão. É editável e só vale para projetos
  novos.

## A primeira abordagem escrita pelo agente

No fluxo "qualificar", quem escreve a abertura de cada lead é o agente, não um texto fixo. Isso acontece quando você clica em
**Preparar lote de hoje** (ou no lote do dia sozinho, se a caixa estiver ligada). Você revisa e aprova como sempre: nada sai
antes da aprovação.

- **A estrutura (desde 25/10/2026).** Três mensagens curtas, nesta ordem: **(1) quem sou**, falando COM a pessoa e se
  apresentando como pessoa, sem a marca ("Oi, Dra. Heloisa! Sou o Jonathan Kelvin, desenvolvedor e ajudo empresas a se
  posicionarem na internet."); **(2) elogio e dor**, o elogio só com dado real (a nota no Google) e a dor da situação dele (sem
  site: quem o encontra no Google não tem onde conhecer os serviços e agendar; só Instagram: quem pesquisa no Google não acha
  um site; site fraco: dá para atrair mais clientes); **(3) a solução e UMA pergunta** ("Eu crio esse site para você. Posso te
  explicar como funciona?"). Sem "tudo bem?", sem "Kelvin Studio" na abertura (a marca não vende, quem vende é você).
- **Falar com a pessoa, não sobre ela.** O nome do negócio decide o tratamento: título e primeiro nome ("Dra. Heloisa Lima -
  Estética Avançada" vira "Oi, Dra. Heloisa!"), nome da pessoa ("Rafael Neves - ADVOCACIA" vira "Oi, Rafael!", "Embelezar por
  Bruna Prado" vira "Oi, Bruna!") ou, sem nome de gente, "você" e "vocês". Nunca "Achei a Dra. Heloisa no Google", sendo que é ela
  quem lê. Nome de gente que não está nos dados é reprovado.
- **O elogio vem da análise dos dados.** O agente classifica o posicionamento no Google (`positioning`): forte (nota 4,5 ou
  mais com 30 avaliações ou mais), bom (nota 4,3 ou mais com 10 avaliações) ou discreto. Só elogia a nota quando ela é boa; com
  posicionamento discreto abre pelo que viu e vai direto à dor.
- **Ângulo.** Cada lead cai em um de 4 ângulos do seu grupo (sem site, só Instagram, site fraco): "elogio e dor", "quem pesquisa",
  "já poderia agendar" (ou "tudo num lugar só", ou "tenho ideias") e "direta, curta". O ângulo é estável por lead e espalhado
  entre os leads (`ANGLES` em `src/lib/outreach/templates.ts`).
- **O que a IA recebe.** Só dados públicos do negócio: nome, ramo, bairro, cidade, a nota (só se for boa), o posicionamento no
  Google, se tem site, só Instagram ou site fraco, e o tratamento. Nunca o telefone.
- **Mensagens curtas, em partes.** De 1 a 3 mensagens, cada uma com no máximo 150 caracteres, uma única pergunta, na última.
  A abertura NÃO leva a linha "responda PARE" (decisão do dono em 29/10/2026: a primeira mensagem tem que parecer uma pessoa
  puxando conversa). Se a IA a escrever, o sistema a tira.
- **Travas** (`validateOpening`, `src/lib/outreach/opening.ts`). O texto só vale se: se apresenta como o nome completo das
  Configurações e **não cita a marca**, trata a pessoa pelo nome certo e não fala dela em terceira pessoa, cita o negócio ou a
  pessoa pelo nome dos dados, fala de site, tem uma só interrogação na última mensagem, não diz "tudo bem", não fala de prévia,
  preço, desconto, grátis, garantia nem link, não cita Instagram de quem não tem rede nos dados, não traz número que não veio
  dos dados (os dígitos do próprio nome, como "Studio 21", não contam) e passa no humanizador e na trava de fatos. Reprovado, a
  IA tenta mais uma vez, já sabendo o motivo; reprovado de novo, ou IA fora do ar, vale o **modelo do mesmo ângulo**, que segue
  a mesma estrutura e também sai em partes. O lote nunca trava: passou de 90 s, o resto sai pelos modelos.
- **Configurações.** Em Configurações > Regras de envio: "Nome completo na 1ª abordagem" (padrão "Jonathan Kelvin") e "Como
  você se define" (padrão "desenvolvedor e ajudo empresas a se posicionarem na internet"). As duas continuam a frase "Sou o …".
- **Na Fila.** Cada rascunho mostra "Escrita pelo agente" ou "Modelo" e quantas mensagens o lead recebe. O botão **Reescrever
  aberturas com o agente** (no alto) troca os textos de todos os rascunhos de abertura; o **Reescrever** do cartão sorteia
  outro texto só para aquele lead. Um parágrafo (linha em branco) é uma mensagem: se você editar o texto, a linha em branco
  continua separando.
- **No envio** (`tick`). Cada parágrafo sai como uma mensagem, com o seu "digitando…" e uma pausa curta entre elas. Conta como
  **um** envio para o teto do dia e o intervalo entre envios. Se uma parte falhar depois de a primeira ter saído, a nova
  tentativa manda só o que faltou. Só vale para abordagem e follow-up; resposta a quem escreveu sai inteira.
- **Relatório.** A taxa de resposta por variação (Comando) agora separa os ângulos e marca o que a IA escreveu
  ("Sem site · Elogio e dor (IA)").
- **Medir a qualidade.** `npm run agent:opening` escreve a abertura de uma amostra de leads com a IA de verdade (gasta
  centavos) e mostra o texto e o que foi reprovado. Em 25/10/2026, com o gpt-6-luna e os negócios das conversas do dono: 12 de 12 passaram, em 1 a 3 segundos cada.

No fluxo com prévia a IA não escreve abertura: valem os modelos antigos.

### Abertura curta (29/10/2026), o padrão novo

Em **Configurações > Primeira abordagem** (padrão **Curta**; "Completa" volta às três mensagens). Ideia do dono: a primeira
mensagem só puxa a conversa; quem apresenta o assunto é a resposta do agente, depois que a pessoa respondeu. Uma conversa de
verdade é o que se espera de um número saudável (hipótese do dono, coerente com o que se viu em 28/10, quando a 1ª parte de uma
abordagem passava e a 2ª era recusada para quem ainda não tinha respondido; não está provada, e a taxa de resposta por ângulo no
Comando é como se mede).

- **UMA mensagem**, uma pergunta, sem falar do que se vende: cumprimento (com o tratamento, "Dra. Liane"), só o primeiro nome
  ("Aqui é o Jonathan.") e a pergunta, sem a linha "responda PARE". Até 140 caracteres. Exemplos:
  `Bom dia, Dra. Liane! Aqui é o Jonathan. Vi seu perfil no Google. Posso te fazer uma pergunta rápida?` ·
  `Oi, pessoal. Sou o Jonathan. Esse é o WhatsApp de Clínica Valéria Sousa?` · `Opa, pessoal! Meu nome é Jonathan. Quem cuida da divulgação de Barbearia X?`
- **Variação** (`SHORT_ANGLES` em `templates.ts`, `STYLE_SIZES_SHORT` em `style.ts`): 6 jeitos de puxar assunto (confirmar o
  contato, "vi no Google", "achei o contato", "quem cuida da divulgação", "pergunta rápida", "só um oi") × 6 cumprimentos × 4
  apresentações × 3 jeitos de perguntar. Sempre os menos usados nas últimas 200 aberturas, e semelhança conferida com as 30
  últimas, como antes. "Confirmar o contato" não vale para quem tem nome de pessoa. Advocacia e contabilidade ficam sóbrias (sem
  "oi", sem exclamação); barbearia, oficina, martelinho e afins podem abrir com "Opa".
- **O nome do negócio vira um nome curto** (`callName`): sem slogan, sem lista de serviços, sem parênteses, até 30 caracteres.
  "Dra dentista" (nome real no Google) deixou de virar "Dra. Dentista".
- **O cumprimento certo na hora do envio** (`greeting.ts`): a abertura é escrita de madrugada e sai de manhã ou de tarde. No envio, o
  "Bom dia" do começo vira "Boa tarde" (a partir das 12h) ou "Boa noite" (a partir das 18h). O texto guardado não muda.
- **IA com travas próprias** (`validateShortOpening`): uma mensagem só, até 140 caracteres, cumprimento, o primeiro nome, uma única
  pergunta no fim, sem site, sistema, preço, nota, elogio nem número, tratamento certo e sem terceira pessoa. Reprovada duas vezes
  ou IA fora do ar, vale o modelo do mesmo estilo. Medido em 29/10 com o gpt-6-luna: **22 de 22** passaram, em 1,1 a 1,9 s cada.

**O que o agente responde** (regras, sem IA, saem sozinhas no modo autônomo; `rules.ts`, bloco "a abertura foi a curta"):

```
abertura curta → [oi / pois não / sim, sou eu / quem é? / do que se trata?]
   → APRESENTAÇÃO (uma vez): "Oi, Dra. Liane! Sou o Jonathan Kelvin, desenvolvedor de sites. Vi seu perfil no Google, com nota 5,0,
     mas não achei um site seu, e sem ele quem pesquisa não tem onde conhecer seus serviços e agendar. Posso te mostrar como funciona?"
   → [pode / como funciona]
   → EXPLICAÇÃO + 1ª pergunta do roteiro: "Eu faço um site sob medida, que reúne as suas redes sociais, apresenta o negócio e leva quem
     chega ao contato ou ao agendamento. Nada de modelo pronto. O que você mais quer que o site faça: ...?"
   → o roteiro de sempre (material → valor + sinal → Pix; sistema e prévia continuam do dono)
```

- O elogio da nota só entra quando a nota é boa; sem site, só Instagram e site fraco têm cada um o seu texto; advocacia fica sóbria.
- Respostas que o agente passou a entender como "estou ouvindo": "pois não?", "pode falar", "sim, sou eu", "em que posso ajudar?", "qual o
  assunto?" (`topics.ts`). Pergunta de preço, prazo, "já tenho site" etc. seguem as regras de sempre.
- A apresentação sai uma vez só (a variante `agente:q-apresentacao` marca isso) e, depois de um "pode", o agente já assume que o
  assunto é um site (`ficha.ts`), então o roteiro segue para "material" e a oferta.
- **Follow-up de quem não respondeu à curta**: o 1º já traz o assunto, em uma mensagem e uma pergunta ("Oi, Dra. Liane! Jonathan aqui
  de novo. Vi seu perfil no Google (nota 5,0), mas não achei um site seu. Posso te contar como resolvo isso?"). O motor escolhe o
  follow-up pela abertura que o lead recebeu, não pelas Configurações de hoje: quem recebeu a de três mensagens continua recebendo
  o follow-up de sempre.
- Para a IA que escreve as respostas livres, o playbook ganhou regras da abertura curta (`SHORT_OPENING_RULES` em `playbook.ts`):
  frases curtas, apresentar-se uma vez, juntar a qualidade à dor.
- **Para trocar as aberturas que já estão na Fila** (escritas no modelo antigo): botão **Reescrever aberturas com o agente**, no alto
  da Fila. Só mexe em rascunhos; o que já foi aprovado fica como está.
- `npm run agent:opening` avalia a curta com a IA de verdade (`AGENT_OPENING_MODE=completa` avalia a de três mensagens).

### Variação entre as aberturas (27/10/2026)

A Meta derruba conta que manda o mesmo texto, com a mesma apresentação, para muita gente. Por isso, no fluxo "qualificar", cada
abertura combina **saudação** (5 formas informais, 3 sóbrias), **apresentação** (5: "Sou o…", "Aqui é o…", "X aqui…", "Me chamo…",
"Prazer…"), **ângulo** (5 por situação) e **pergunta final** (4 por família), sempre as menos usadas nas últimas 200 aberturas de
todos os números, e confere a semelhança com as últimas 30 (acima de 60% tenta outra combinação). O código vai na variante
(`abertura-none-elogio-ia~g1i2q3`) e a IA recebe a saudação, a apresentação e a pergunta escolhidas no pedido, no lugar do exemplo
fixo. Sem estilo (fluxo antigo, ou sem passar por `variation.ts`) o texto é o de sempre. Detalhes em
[docs/MULTI-NUMERO.md](MULTI-NUMERO.md), seção 3.

## Portfólio como prova e cutucada

- **Quem pede para ver o seu trabalho recebe só o portfólio.** "Me mostra um pouco do seu trabalho", "tem portifolio?", "link do
  seu trabalho" saem do texto que você escreveu em Configurações > "Exemplos e portfólio", sem pergunta de qualificação por
  cima (a qualificação já acabou) e sem o "vou separar". Sem o endereço cadastrado o agente avisa que manda e chama você.
- **O portfólio chega antes de o lead pedir.** A oferta do site e o aviso "vou analisar" (sistema e automação) saem com "Se
  quiser, dá uma olhada nos meus trabalhos antes de fechar: <link>", uma vez por conversa, nunca depois da proposta. É a prova
  de que o negócio é sério, na hora em que o lead está decidindo.
- **Depois do valor ou da proposta o agente não volta a qualificar.** Nenhuma resposta puxa "o que você quer que o site faça" de
  novo.
- **Cutucada depois do silêncio.** O lead conversou, viu o portfólio, o valor ou recebeu o Pix, e ficou 4 h sem responder: o
  agente manda UMA mensagem ("Conseguiu dar uma olhada nos trabalhos?", "Ficou alguma dúvida sobre o valor?", "Conseguiu fazer o
  Pix do sinal?"). Se em 24 h ainda ninguém respondeu, a conversa vem para **Intervir**, no quadro de Conversas, com o aviso
  "Sumiu depois do portfólio ou do valor: retome e feche à mão (Pix e conferência)": é o momento de você assumir, receber o Pix,
  conferir e marcar o sinal. Só com "Pode fechar sozinho" ligado, dentro dos horários de envio e dos tetos do agente.
  Código: `src/lib/agent/nudge.ts` e `portfolio.ts`.

## Quando quem responde é um robô

Muitos negócios têm resposta automática no WhatsApp: aviso de ausência ("não estamos disponíveis… *mensagem automática*"),
saudação do WhatsApp Business (com horário, endereço e link), menu numerado ("digite 1, 2, 3") ou robô de atendimento. Elas
chegam logo depois da abordagem e **não são o dono respondendo**. O agente reconhece (`detectAutoReply`, pontuação) e:

- **grava e marca** a mensagem (aparece num balão tracejado na conversa e como "Automática: …" no quadro);
- **não responde** (robô com robô vira bate-papo sem fim) e **não** a conta como resposta, não pede você, não muda a etapa e
  não cancela os follow-ups;
- não deixa o texto do robô entrar na ficha (antes, "mensagem automática" virava "quer um sistema de automação");
- quando uma pessoa de verdade escrever, segue a conversa de onde estava.

Gente nunca é tratada como robô: um sinal forte (a mensagem se declara automática, menu numerado, **frase de modelo pronto**) ou
vários médios (ausência, horário, boas-vindas, negritos, link) precisam se somar. As frases de modelo pronto são as que uma pessoa
dificilmente escreve: o negócio falando de si na terceira pessoa ("Martins Detailer agradece seu contato. Como podemos ajudar?") e
"bem-vindo(a)" com a letra do outro gênero entre parênteses. Elas valem mesmo em texto curto (em 26/10, quatro saudações assim
passaram e o agente perguntou "landing page, site ou sistema?" a robôs). Um "Como posso ajudar?" solto continua sendo tratado como
pessoa. "Obrigado pelo contato" ou "já uso resposta automática" continuam sendo
lead. PARE de verdade sempre vale.

**O que 26/10 acrescentou (história 6.13).** Dos 26 leads que escreveram, 22 eram robô e só 2 eram pessoas (pela minha leitura do
texto e do tempo); 5 dos robôs passavam por gente, de três tipos:

- **Recepção que coleta dados:** "para agilizar seu atendimento, diga seu serviço e horário, passe e-mail e CPF", "pode me
  informar: qual procedimento você tem interesse?". Quem escreve assim é roteiro de recepção, não resposta à nossa abordagem.
  Vale por si só (tipo "Atendimento automático que pede seus dados").
- **Saudação de triagem:** "que bom ter você aqui… estou aqui para te receber… em breve uma de nossas profissionais irá falar
  com você", "se precisar de agendamento… estamos aqui para ajudar", e o erro de digitação "aradece seu contato".
- **Recebimento automático de proposta:** "recebemos sua proposta sobre criação de site… encaminhei para nossa equipe… alguém
  responderá". Duas empresas diferentes responderam com quase o mesmo texto, em menos de 1 minuto. Uma recepcionista pode escrever
  igual, então este sinal **só vale com o tempo**: chegou até 3 minutos da nossa abordagem **e** é a primeira resposta da conversa
  (`arrivedFast`, `fast`). Sem o tempo, na dúvida continua sendo gente.

O tempo é a pista mais forte que temos: das 26 respostas que chegaram em até 3 minutos, todas eram automáticas (pela minha leitura); as de pessoa de verdade
chegaram horas depois (4 h, 43 h, 44 h). Mas rapidez sozinha nunca vira robô: "obrigada pelo contato, vou ver com meu sócio" em 1 minuto continua
sendo gente. Também vale para o botão **Consertar** (as conversas antigas passam pelo mesmo critério, olhando o horário da
abordagem gravada).

**Nada mais chega em branco.** Em 26/10 uma abertura que já tinha saído inteira voltou à fila com o texto esvaziado (o banco
falhou ao gravar "enviada"; o resto a mandar ficou vazio), o WhatsApp recusou 3 vezes ("message: cannot be blank") e a automação
se pausou sozinha por 4 horas. Agora: se tudo já chegou ao lead e o erro foi depois, a mensagem fica **enviada** (nunca volta à
fila, para não repetir a abertura) e não conta como falha; mensagem sem texto sai da fila sem ir ao WhatsApp e sem contar para a
pausa; rascunho em branco não se aprova.

**Follow-ups.** No fluxo qualificar o 1º follow-up chama a pessoa pelo nome quando ele aparece ("Oi, Dra. Fernanda!") em vez de
repetir o nome inteiro da empresa, puxa de volta com um "só passando para saber se você viu" e, em advocacia e contabilidade,
fica sóbrio ("Retomo uma única vez a minha mensagem…"). O último avisa que é o último.

**Mensagem repetida.** Duas mensagens quase juntas do lead (ou do robô dele) gerariam duas respostas iguais. Agora a mesma frase,
ou a mesma pergunta do roteiro, já pendente ou enviada há menos de 15 minutos, não é criada; e, no envio, a segunda resposta
idêntica do agente é cancelada. O que você mesmo escreve nunca é barrado.

### Conversas antigas em que quem respondeu foi um robô

Antes de o motor reconhecer robô, a saudação automática do negócio entrava como resposta de verdade: a conversa ia para
**Intervir**, a etapa virava "Respondeu" e o agente escrevia um rascunho para o robô. Se isso ficou gravado, o topo de
**Conversas** mostra o aviso "Respostas de robô" com a lista (lead, tipo de robô e o começo do texto). O botão **Consertar**,
depois de uma confirmação, faz com o que já está gravado o mesmo que o motor faz hoje: marca a mensagem como automática, devolve
a conversa a "Sem resposta", volta a etapa de "Respondeu" para "Contatado" e cancela o rascunho escrito para o robô. **Nada é
apagado e nada é enviado**: o texto do robô continua na conversa e o rascunho fica como "cancelado". Só entram conversas em
que TODA mensagem recebida é de robô e em que você ainda não respondeu nem assumiu. Código: `src/lib/outreach/robot-cleanup.ts`.

## O que as conversas reais ensinaram (24 e 25/10/2026)

O relatório conversa a conversa está em [docs/APRENDIZADOS.md](APRENDIZADOS.md). O que virou regra do agente:

- **"O seu site", nunca o nome do Google.** A oferta, o fechamento, o aviso do Pix e a mensagem da proposta falam do "seu site":
  o lead pode estar pedindo o site de outro negócio (um advogado respondendo no número de uma clínica de teste).
- **Pix tem três respostas.** *"Já fiz o Pix" / "paguei" / comprovante em imagem ou PDF*: "Recebi! Vou conferir o Pix aqui na
  conta e já te confirmo." (sai sozinho e a conversa vai para **Intervir**, com a ação "Conferir o Pix e marcar o sinal"; o
  agente nunca confirma dinheiro). *"Vai resolver meu pedido ou não?", "cadê o site?", "alguma novidade?"* depois do Pix: lembra o
  valor do sinal e a chave, servindo para quem já pagou ("vou conferir agora") e para quem ainda não ("é por Pix, chave…"). Depois
  que o sinal caiu: "Vou ver o andamento aqui e já te respondo", e a conversa fica com você.
- **"Me passe, por gentileza" depois da oferta é um aceite.** Pedido sem objeto ("me passe", "pode mandar", "manda aí") vale como
  "sim"; com objeto ("me manda o portfólio") segue o assunto de sempre.
- **Conversa solta fica com o dono.** Risada ("kkk"), reunião ("cadê o meet", "me manda o link da reunião") e "tô chegando" não
  recebem resposta do agente nem da IA (a IA tinha inventado "vou confirmar o link"). Emoji de ok (👍, 🙏) vale como "ok".
- **Link de Instagram não é "já tenho site".** Links de rede social, de WhatsApp e de mapa, e e-mails, são ignorados; um endereço
  de site de verdade ("clinicabela.com.br") passa a ser reconhecido.
- **O nome do negócio não é cortado no meio da frase.** "Natália Gabriela Sociedade individual de Advocacia" vira "Marília
  Carolina"; o corte nunca deixa "de", "da" ou "e" pendurados.
- **Advocacia e contabilidade têm abordagem mais sóbria.** Abre sempre com "Olá" e a IA recebe a instrução de não falar em
  "captar clientes", não prometer resultado e não comparar com concorrentes (publicidade nessas profissões tem regras próprias).
- **Fluxo qualificar nunca volta ao texto da "prévia sem custo"** (teste varre 25 frases em 4 tipos de lead).

## Quem pediu PARE e voltou

PARE bloqueia na hora e ninguém recebe resposta. Se o lead voltar a escrever ou pedir para falar com você, abra a conversa
e clique em **"Desbloquear e devolver à automação"** (o botão só aparece em conversa bloqueada, e o sistema pede
confirmação, porque o lead tinha pedido para não receber mensagens). O que acontece:

1. o número sai da lista de bloqueio e a conversa deixa de ser "assumida";
2. o lead sai de Perdido (vai para Respondeu, ou Contatado se nunca respondeu);
3. se a última coisa na conversa é uma mensagem dele **sem resposta** (escrita enquanto estava bloqueado), o agente a
   responde agora: rascunho no modo assistido, ou resposta sozinho (no horário de envio) no autônomo. Se a última coisa foi
   o próprio PARE, ou um "sem interesse", nada é respondido: a liberação vale para a próxima mensagem dele;
4. o agente volta a atender normalmente. Um PARE novo bloqueia de novo.

Funciona também para número bloqueado à mão ("Bloquear número").

## O que ele faz e o que não faz

| Faz | Não faz |
|---|---|
| Entende 27 assuntos (preço, prazo, "já tenho site", "vou pensar", pedido de garantia, áudio, "quem é você?"...) | Decidir dinheiro por você: desconto, garantia, contrato, mensalidade e Pix só do jeito que **você escreveu** em Configurações (ou com o fechamento sozinho ligado). Sem a sua resposta escrita, chama você |
| Escreve a resposta curta, com uma pergunta só e o próximo passo | Inventar preço, prazo, desconto, garantia, contrato, domínio ou mensalidade |
| Monta a **ficha do lead**: temperatura (frio, morno, quente), fase, necessidade, quem decide, orçamento, prazo | Mandar mensagem para quem pediu PARE (o bloqueio é do motor de envio e não passa pelo agente) |
| Pergunta uma coisa por vez e **nunca repete** a pergunta | Mexer em horário, tetos diários, intervalo ou pausa geral |
| Diz o **próximo passo** para você (gerar prévia, criar proposta, marcar sinal...) | Fechar venda. O Pix cai na sua conta e você marca |
| **Chama você** quando não pode decidir (preço fora da tabela, garantia, áudio, lead irritado) | |

O nível 3 (responder sozinho) existe e vem **desligado**: você liga na tela Agente. Antes de ligar, leia a seção abaixo.
(Antes de 24/10/2026 ele não existia de propósito.) Só faz sentido depois de dezenas de conversas
reais mostrarem onde o agente erra.

## Atendimento sozinho (nível 3)

Na tela **Agente > Atendimento**, digitando **ATENDER SOZINHO**, o agente passa a responder sozinho o que é seguro. O
resto continua rascunho, com o aviso "Precisa de você". Voltar ao modo assistido é um clique.

**A regra de ouro (24/10/2026):** o que você autoriza, o agente atende sem pedir aprovação. Você autoriza de três jeitos:
ligando o atendimento sozinho, escrevendo as suas respostas em Configurações e marcando as caixas do cartão. O que você
não autorizou continua com você.

**O que ele faz sozinho, de graça (sem você configurar nada):** quem é você, como funciona, de onde tem o número, prazo e o
valor fechado do site simples; cumprimento; pergunta de descoberta ("o que você mais quer que o site faça?"); "vou pensar",
"agora não", "estou sem tempo", "já tenho site", "já tenho quem faça", recepcionista; **áudio e imagem** (pede com
educação para escrever, e a conversa continua em "Precisa de você" para você ouvir se importar); e, **se o painel tem
endereço público (`SITE_URL`)**, gerar a prévia quando o lead diz "pode" e mandar o link.

**Perguntas livres** (caixa "Responde perguntas livres", ligada de início no modo autônomo): quando o lead pergunta algo que
as regras não conhecem ("você cria sites?", "vocês fazem loja virtual?"), a IA responde com os seus fatos e a resposta
sai sozinha, depois de passar na trava. Se a própria IA disser que precisa confirmar, a resposta sai mas a conversa fica
em "Precisa de você". Se a IA reprovar na trava, falhar ou preferir calar (conversa pessoal, assunto de fora do negócio),
nada sai e a conversa espera por você. **Sem IA ligada isso não existe**: a pergunta fora do roteiro espera por você.

**As suas respostas, em Configurações > "Suas respostas para o agente":** garantia, domínio/hospedagem/mensalidade,
formas de pagamento, exemplos/portfólio e preço/desconto. Cada uma, quando você escreve, vira a resposta que o agente
manda **sozinho, palavra por palavra** (sem IA no meio, e sem o humanizador mexer: é a sua voz). Os números, prazos,
porcentagens e links que você escreve ali passam a valer como fatos, então "faço por R$ 700 se fechar esta semana" sai sem
a trava barrar, mas um R$ 650 inventado pela IA continua barrado. Em branco, o assunto continua com você. As cinco
respostas também entram no prompt da IA como fatos, para ela não contradizer você nas perguntas livres.

**O que continua com você, sempre:** contrato e nota fiscal (se você não escreveu a resposta), qualquer das cinco
respostas acima em branco, ajuste na prévia, lead irritado ou desconfiado, pedido de ligação ou reunião, mensagem longa.

**Fechamento sozinho** (caixa "Pode fechar sozinho", desligada de início). É dinheiro, então tem passos e condições:

1. O lead viu a prévia e gostou ("gostei", "pode fechar"). O agente manda a **oferta**: valor, prazo e sinal das
   Configurações, sem a chave Pix ainda.
2. O lead aceita ("pode", "passa o Pix"). **Só então** o agente cria a proposta (padrão: "Site de 1 página", o preço, o sinal
   e o prazo das Configurações), marca como enviada, move o lead para Proposta e manda a **chave Pix** com o valor do sinal.
3. Você marca "Recebi o sinal" em Financeiro quando o Pix cair. Aí o lead vira Ganho e o projeto abre em Produção.

Condições: a prévia já enviada, a oferta já enviada ou agendada (um "pode" antes de o lead ver o valor só gera a oferta) e a
**chave Pix cadastrada** em Configurações (sem ela nada disso sai sozinho e a conversa fica para você). O texto da oferta e
do Pix é **fixo** (as regras), a IA nem é chamada: assim o valor e a chave não têm como sair errados.

**As travas do nível 3:**

| Trava | Como funciona |
|---|---|
| Lista fechada de assuntos | Está em `src/lib/agent/autonomy.ts` e um teste congela a lista: mudar exige mudar o teste |
| Tempo de gente | A resposta sai de 20 a 90 segundos depois, e **só dentro do horário de envio** (dia útil, 9h às 12h e 14h às 18h); de noite espera a manhã |
| Tetos | Padrão de 10 respostas sozinho por conversa (contra loop com robô) e 80 por dia; editáveis no cartão |
| Trava de fatos de novo | Toda resposta que sai sozinha passa outra vez na trava de preço, prazo, sinal, link e Pix |
| Você assume | Se você responder pelo celular ou pelo painel, o agente larga aquela conversa |
| Mensagem longa do lead | Mais de 600 caracteres vai para você ler |
| Automação pausada | Fica rascunho (não deixa resposta velha esperando para sair depois) |
| PARE, bloqueio, pausa geral, simulação | Continuam no motor de envio: ninguém que pediu para parar recebe resposta |

**Para as respostas saírem de verdade** precisam estar certos o WhatsApp conectado, o envio real ligado (fora da
simulação) e a automação rodando (não pausada). O cartão mostra cada um com um quadrado verde ou vermelho.

**Para conferir no fim do dia:** o painel "Respondeu sozinho" lista as respostas do agente (quem, assunto, se foi IA ou
regras, o texto e se já saiu), e "Precisa de você" lista as conversas paradas esperando por você. Na conversa, a
mensagem do agente aparece como "Agente, sozinho". Quando a IA falha ou a trava barra uma resposta, uma linha "agente: ..."
aparece no feed do Comando.

**Lote do dia sozinho** (caixa "Aprova o lote do dia sozinho", **desligada** de início): uma vez por dia, dentro do horário
de envio, o worker prepara as aberturas e os follow-ups e já aprova. O teto diário (padrão 8, 15 e 30; **sem máximo e a rampa
é opcional**: em Fila > Regras de envio, deixe "Semana 1" e "Semana 2" em branco e só o "Depois" vale desde o primeiro dia), as
janelas, o intervalo entre mensagens e a pausa geral continuam valendo. Desligada, a Fila continua sendo um clique seu.
Para ligar uma caixa nova é preciso digitar **ATENDER SOZINHO** de novo.

**O que o nível 3 NÃO faz:** mandar a prévia sem endereço público (`SITE_URL`), negociar preço fora do que você escreveu,
receber o Pix (você marca "Recebi o sinal") nem produzir o site.

## As três camadas

```
mensagem do lead
   │
   ├─ 1. REGRAS do playbook ........ sempre rodam; grátis, instantâneas, testadas (rede de segurança)
   │
   ├─ 2. IA (opcional) ............. reescreve/estende a resposta; só existe se houver GEMINI_API_KEY
   │
   └─ 3. TRAVA ..................... confere o que a IA escreveu (fatos + humanizador).
                                     Reprovou, vale a resposta das regras.
        ↓
   RASCUNHO  →  você lê  →  Aprovar  →  motor de envio (janela, tetos, PARE)
```

Falha de internet, limite do plano grátis, JSON quebrado ou texto reprovado: o agente cai nas regras e anota o motivo no
feed de atividade do Comando. A resposta do lead nunca se perde por causa da IA.

## O que foi aproveitado dos dois repositórios

Os dois são MIT. Eles são **instruções para uma IA**, não programas: por isso o aproveitamento virou (a) regras de
código, (b) o texto do prompt e (c) um conjunto de casos de teste.

### blader/humanizer (26 padrões de texto com cara de IA)

| Padrão do humanizer | No agente | Onde |
|---|---|---|
| §1 "Não é X, é Y" | erro: reprova a mensagem | `humanize.ts` |
| §2 fecho dramático ("Simples assim.") | aviso | `humanize.ts` |
| §3 frases que soam profundas | aviso | `humanize.ts` |
| §4 anunciar o ponto ("Vou ser direto") | aviso | `humanize.ts` |
| §5 discutir com ninguém ("Vale ressaltar") | aviso | `humanize.ts` |
| §8 traço como conector | corrigido sozinho (vira vírgula) | `humanize.ts` |
| §12 palavras de IA e §16 linguagem de vitrine ("incrível", "potencializar") | erro ou aviso | `humanize.ts` |
| §19 negrito, §20 título e lista | corrigido ou erro | `humanize.ts` |
| §21 aspas curvas | corrigido sozinho | `humanize.ts` |
| §22 resto de chatbot ("Espero ter ajudado", "Fico à disposição") | erro | `humanize.ts` |
| §26 reexplicar o que o outro já sabe | limite de tamanho (WhatsApp pede curto) | `humanize.ts` |
| "Não invente nada" | a **trava de fatos**: só passa preço, prazo, sinal, link e Pix que são seus | `guard.ts` |

O humanizador roda em **toda** resposta escrita pela IA (e reprova o que não conserta sozinho). Nos testes, ele confere **todos** os modelos de abertura e follow-up e **todas** as respostas das regras.

**Ficou de fora:** os padrões que só existem em inglês (§10 hifenização composta, parte do §12) e a regra de "copiar o
estilo de uma amostra do autor" (exige IA e uma amostra sua; dá para fazer depois colando mensagens suas no campo
"O que você vende").

### msitarzewski/agency-agents (divisão de vendas)

| Agente do repositório | Ideia aproveitada | Onde virou |
|---|---|---|
| Discovery Coach | uma pergunta por vez, sem interrogatório; descoberta antes de empurrar | `rules.ts` (pergunta "objetivo"), `ficha.ts` |
| Discovery Coach (AECR) | objeção é informação: reconhecer, esclarecer, reenquadrar, nunca rebater | respostas de `too_expensive`, `has_provider`, `think`, `not_now` |
| Outbound Strategist | um único pedido pequeno por mensagem; mensagem curta; respeitar opt-out; testar uma variável por vez | `templates.ts`, `humanize.ts` (1 pergunta), A/B por variação |
| Sales Outreach | abertura curta, sempre com um dado real; "breakup" honesto no último follow-up; desqualificar com educação | follow-up 2 ("Última mensagem, prometo"), `not_interested` |
| Deal Strategist (MEDDPICC) | qualificar pelo que está confirmado e marcar o que não se sabe | a **ficha** em formato BANT, com "Não sei ainda" em vez de chute |
| Proposal Strategist | valor antes de preço; preço só depois da prévia | resposta de `price` leva para a prévia primeiro |
| Behavioral Nudge Engine | dar o rascunho pronto e deixar só o "Aprovar"; um próximo passo por vez | rascunhos, "Próximo passo" na ficha |
| Offer & Lead Gen Strategist | equação de valor (resultado, certeza, tempo, esforço) | prévia sem custo reduz o risco e o esforço do lead |

**Ficou de fora, de propósito:** cadência de 10 toques em vários canais, ABM, MEDDPICC completo (comitê de compra,
paper process), Challenger Sale e proposta de RFP. São para venda corporativa; aqui o lead é o dono de um negócio
pequeno que decide sozinho e responde pelo WhatsApp.

## Mensagens mais curtas (medido)

| | Antes | Agora |
|---|---|---|
| Abertura (com "responda PARE") | 270 a 370 caracteres | **191 a 227** (média 210) |
| Follow-up 1 | ~260 | **177** |
| Follow-up 2 | ~205 | **164** |
| Respostas do agente (46 casos com texto) | só 3 de 8 tipos de resposta tinham rascunho | média **109**, máximo 182 |

Mudanças de texto nas aberturas: sem elogio que ninguém conferiu ("gostei do trabalho de vocês"), sem "sem compromisso",
uma pergunta só, a saída ("Para parar de receber, responda PARE") mais curta, e o ramo agora sai **com acento**
("estética em Fortaleza"; antes saía "estetica"). As variações A/B continuam com os mesmos nomes, então a taxa de
resposta por variação do Comando passa a medir os textos novos (você ainda não tinha volume de envio real).

## Ligar a IA (opcional)

O agente aceita **OpenAI e Gemini (Google), com mais de uma chave de cada**. Eles trabalham em fila: o primeiro
escreve e os seguintes só entram se o anterior **falhar** (erro, limite do plano, sem internet). Uma resposta que a
trava reprovar **não** chama o próximo (seria pagar de novo pelo mesmo pedido): vale a resposta das regras.

**Ordem padrão:** OpenAI → Gemini 1 → Gemini 2 → regras. Para inverter, `AGENT_ORDER=gemini,openai`.

No `.env.local` (nunca no chat, nunca em arquivo que vá para o git):

```
OPENAI_API_KEY=...
OPENAI_MODEL=nome-do-modelo
GEMINI_API_KEY=...
GEMINI_API_KEY_2=...
```

- Mais chaves: `_2`, `_3` até `_6`, ou várias separadas por vírgula na mesma linha.
- A OpenAI só é usada com `OPENAI_MODEL`. Se você esquecer, **Agente > Testar a IA** mostra os modelos que a sua conta
  enxerga. O nome do modelo do Gemini tem padrão (`gemini-3.8-flash`); troque com `AGENT_MODEL`.
- **Testar a IA** chama cada chave separadamente e diz qual funciona, o modelo e o tempo.
- A chave que bate o limite (erro 429) descansa 1 minuto, e a inválida (401/403) descansa 10, para não perder tempo
  nela a cada resposta.

### Qual modelo da OpenAI usar

Medido em 24/10/2026 com a sua chave, no mesmo gabarito e com o mesmo prompt (26 respostas por modelo; preços da
página oficial da OpenAI):

| | gpt-6-luna | gpt-6.1-sol | gpt-6-astra |
|---|---|---|---|
| Preço por 1 milhão de tokens (entrada / saída) | US$ 0,10 / 0,50 | US$ 2 / 10 | US$ 10 / 50 |
| Custo medido por resposta | **US$ 0,00016** | US$ 0,0033 | não medido (~5x o Sol) |
| Respostas que passaram na trava | 24 de 26 | 25 de 26 | não medido |
| Tempo médio / p95 | 1,7 s / 3,7 s | 2,8 s / 7,4 s | não medido |
| Respostas por US$ 8,94 | ~55.000 | ~2.700 | ~500 |

O Luna empata em qualidade com o Sol neste trabalho (mensagem curta, regras claras, trava e gabarito por trás) e custa
20x menos. O Astra é o "mais capaz para trabalho exigente (código, raciocínio longo)": sobra para uma resposta de duas
frases, então nem entrou na medição. Todos os GPT-6 raciocinam por padrão (`medium`), o que encarece e atrasa; o código
já manda o esforço certo para cada modelo (Luna: `none`; Sol e Astra: `low`) e `OPENAI_REASONING` troca.

**Diferença que importa:** o Sol é mais cauteloso (diz "vou confirmar" quando não sabe) e o Luna é mais afirmativo: em
26 respostas ele inventou um valor (R$ 600, derrubado pela trava) e disse "ainda não tenho exemplos" (agora derrubado
por uma regra nova). O leitor final é você, que aprova cada rascunho, e a trava + as regras seguram o resto; se um dia
os casos de fechamento começarem a sair sem graça, troque para `gpt-6.1-sol` no `.env.local` e rode `npm run agent:eval`.

Para repetir a medição com outro modelo, sem mexer no arquivo:

```bash
OPENAI_MODEL=gpt-6.1-sol AGENT_EVAL_PROVIDER=openai AGENT_EVAL_LIMIT=14 npm run agent:eval
```

**Sobre ter duas chaves do Google:** o limite do plano grátis do Gemini vale por **projeto** do Google, não por chave.
Duas chaves do **mesmo** projeto dividem o mesmo limite e não adiantam nada. Para ter limite separado, cada chave
precisa ser de um projeto diferente. Criar contas só para driblar limite pode ir contra os termos do Google: leia
antes de decidir.

> **Privacidade, leia antes de ligar:** o primeiro provedor da fila recebe **toda** conversa que a IA escrever; os
> seguintes só recebem quando o anterior falha. No plano grátis do Gemini o Google informa que o conteúdo enviado **pode
> ser usado para melhorar os produtos dele**; no plano pago isso não acontece (página de preços, 23/10/2026). Confira na
> política da OpenAI como ela trata dados enviados pela API. Sem nenhuma chave, nada sai do seu computador.

**O que vai para a IA em cada chamada:** as últimas 12 mensagens da conversa (as do lead e as suas), o nome, o
bairro e a cidade do negócio, o ramo, o tipo de site, a ficha do lead, o rascunho das regras e os fatos de Configurações
(preço, prazo, sinal, "o que você vende"). **Nunca vão:** telefone do lead ou seu, chave Pix e titular, links de outros
leads, chaves do Supabase e dados de outras conversas.

**Formas de controlar:**

| Quero | Faça |
|---|---|
| IA escrevendo todo rascunho (mais rápido para você) | só as chaves; nada mais |
| Só mandar para a IA as conversas que eu escolher | `AGENT_AI_MODE=manual`: os rascunhos nascem pelas regras e a IA só entra no botão "Pedir resposta ao agente" |
| Que o Google não use o conteúdo | ativar o faturamento do projeto no Google AI Studio (plano pago), ou deixar a OpenAI primeiro e o Google só de reserva |
| Desligar sem apagar as chaves | `AGENT_PROVIDER=off` |

Para o aviso valer, lembre que a **sua** mensagem também vai na conversa, e que o lead não sabe que um modelo de
linguagem leu a resposta dele.

Sua assinatura Claude Pro **não** alimenta o agente (os termos limitam o login dela ao uso individual do Claude Code).
Para usar Claude no servidor, será preciso uma chave de API paga: escreva outro `LlmClient` em `llm.ts` (um método,
`complete`) e acrescente à fila.

## Como ensinar uma coisa nova

1. Abra `src/lib/agent/scenarios.ts` e acrescente o caso: o que o lead escreveu e o que o agente deve fazer.
2. Rode `npm test`. O caso falha: isso é o esperado.
3. Ajuste a expressão em `topics.ts` (como entender) e a resposta em `rules.ts` (o que dizer).
4. Rode `npm test` de novo. Além do seu caso, ele confere em **todos** os casos: tamanho, uma pergunta só,
   humanizador e trava de fatos.
5. Para a IA: `npm run agent:eval` roda o gabarito inteiro contra o Gemini (gasta chamadas do plano grátis) e mostra
   quantas respostas passam na trava e por que as outras caem nas regras.

## Fatos que o agente pode afirmar

Em **Configurações**: **valor do site** (landing page ou site simples; o agente fala exatamente esse valor, nunca "a partir de"), **prazo de entrega** e **sinal (%)**, além da chave Pix e do
WhatsApp. O agente só cita esses valores, ou os da proposta real do lead quando ela existe, ou o que você escreveu nas
cinco respostas (garantia, hospedagem, pagamento, exemplos, desconto). Qualquer outro valor, prazo, porcentagem, link,
e-mail ou telefone na resposta da IA é reprovado.

**Políticas que eu assumi e você precisa confirmar** (estão nas respostas das regras):

- a **prévia do site não tem custo** e vem antes da conversa de valor;
- o pagamento é **por Pix**, com sinal e o restante na entrega;
- prazo e sinal padrão: 7 dias e 50% (o que já estava no formulário de proposta; agora vêm das Configurações).

Se alguma não for verdade para você, mude em Configurações ou me peça para ajustar as respostas.

## O que NÃO foi testado

- **A IA com chave real.** O cliente do Gemini e a trava foram testados com respostas simuladas (inclusive lixo, JSON
  quebrado e valores inventados), mas não existe chave neste computador. O botão "Testar a IA" e o `agent:eval` existem
  para você (ou eu) conferirem na primeira vez.
- **Conversas reais.** Os 54 casos do gabarito com prévia (e 46 do fluxo qualificar) vêm de padrões de resposta que eu conheço de dono de negócio no
  WhatsApp. A primeira semana de uso real vai mostrar frases que ele não entende: elas caem em "Fora do roteiro" (sem
  rascunho) e viram casos novos no gabarito.

## Arquivos

```
src/lib/agent/
  humanize.ts   humanizador em português (corrige o mecânico, aponta o resto)
  topics.ts     entende o assunto da mensagem (34 assuntos, com "paguei", "cadê meu pedido" e conversa solta)
  ficha.ts      ficha do lead (temperatura, fase, BANT, próximo passo), só da conversa
  rules.ts      o playbook em regras (resposta por assunto)
  playbook.ts   o playbook como prompt da IA
  llm.ts        clientes da OpenAI e do Gemini, fila de reserva entre chaves
  guard.ts      trava de fatos (preço, prazo, sinal, link, Pix)
  compose.ts    regras → IA → trava → rascunho
  context.ts    junta lead, conversa, prévia e proposta; contexto de teste
  scenarios.ts  o gabarito (54 casos com prévia, 72 do fluxo qualificar)
  autonomy.ts   o que sai sozinho: lista de assuntos, respostas do dono, perguntas livres, tetos
  variant.ts    marca na mensagem quem escreveu e o que foi perguntado
  view.ts, sim.ts, runtime.ts
src/app/(app)/agente/page.tsx      tela do agente (simulador, casos, regras)
src/app/(app)/agent-actions.ts     pedir resposta, simulador, testar a IA
src/components/agent/              ficha, botão e simulador
```
