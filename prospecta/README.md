# JK Prospect X1

Painel que caça negócios locais sem site, ranqueia pelos melhores e organiza a venda de sites
(Kelvin Studio). Cobre as **Fases 0 a 5** do [plano](docs/PLANO.md): base, login, Caçador de leads, funil,
**fila de mensagens com aprovação**, **caixa de conversas**, o **motor de envio** com todas as
travas, **prévia do site** (link secreto para o lead), **proposta com Pix manual**, **financeiro** e
**produção**. O motor nasce **pausado e em simulação**: nada sai pelo WhatsApp até você conectar o
GOWA e liberar (veja [docs/WHATSAPP.md](docs/WHATSAPP.md)).

## Ver o painel agora (modo demonstração)

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Sem nenhuma configuração o painel abre em **modo demonstração**:
sem login, com ~120 leads **fictícios** (nomes com "(demo)", telefones inexistentes) guardados em
memória. Serve para ver e testar tudo. Reiniciar o servidor zera os dados.

## Ligar o banco e o login de verdade

1. Crie um projeto no [Supabase](https://supabase.com) (o plano grátis serve).
2. Aplique `supabase/migrations/20261021000000_init.sql` (SQL Editor do Supabase, ou `supabase db push`).
3. Em **Authentication → URL Configuration**, ponha `http://localhost:3000/auth/callback` em *Redirect URLs*.
4. Copie `.env.example` para `.env.local` e preencha:
   - `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (Project Settings → API; use a chave publishable);
   - `OWNER_EMAIL` com o seu e-mail.
5. `npm run dev` (ou o atalho "Ligar JK Prospect X1"), abra **http://localhost:3000** e clique em
   **Entrar neste computador**. Se quiser, desligue *Allow new users to sign up* em
   Authentication → Sign In / Providers.

### Como é o login

- **Neste computador (localhost):** botão **"Entrar neste computador"**, 1 clique, sem senha. Cria um
  cookie **assinado** (precisa do `SESSION_SECRET` do `.env.local`; ninguém consegue inventar um) que
  vale 30 dias e só é aceito se o pedido vier do próprio computador. Como não há sessão no Supabase
  nesse caso, os dados passam pela chave `SUPABASE_SECRET_KEY`. O painel (`npm run dev`/`start`)
  **só escuta em 127.0.0.1**, e é isso que sustenta a regra "só neste computador".
- **De qualquer outro endereço (túnel, rede, hospedagem):** o 1 clique é recusado e o painel pede
  **e-mail e senha do Supabase**, com a proteção do banco (RLS) valendo. Para usar, defina uma senha
  para o seu usuário no Supabase (Authentication → Users). Faça isso **antes** de publicar o painel.

## Buscar leads no Google Maps

Crie uma conta grátis no [Apify](https://apify.com), copie o token e ponha em `APIFY_TOKEN`
(`.env.local`). A busca usa o *Google Maps Scraper* (preço de lista: US$ 0,007 por execução +
US$ 0,004 por lugar, ou seja, ~US$ 0,41 por 100 lugares; o plano grátis do Apify dá crédito
mensal, confira no seu painel). Cada busca tem um **teto de custo** (padrão US$ 1,00, em
Configurações) enviado ao Apify, que encerra a execução se passar disso.

Sem token, dá para importar o JSON exportado do Apify (botão *Importar JSON* no Caçador).

### Triagem em quadro (Kanban por busca)

Os leads do Caçador aparecem por padrão em um **quadro com uma coluna por busca**, da mais nova para a mais antiga, cada
uma com o dia e a hora ("Hoje · 10:12", "Ontem · 16:40"). Assim o que entrou hoje não se mistura com o de ontem.

- **Por coluna:** "Aprovar N melhores" (elegíveis com nota 70 ou mais), "Descartar N fracos" (nota abaixo de 40) e
  "Selecionar a coluna".
- **Por cartão:** o ✓ aprova para a Fila, o ✕ descarta, a caixinha seleciona vários, e dá para **arrastar** o cartão para
  "Aprovar para a fila" ou "Descartar" (se ele estiver marcado, vão todos os marcados).
- **Desfazer:** depois de qualquer movimento aparece "Desfazer", que devolve os leads para a triagem.
- **Filtros** (site, elegível, nota, etapa, texto) valem para o quadro; o botão **Lista** volta à tabela de sempre, e "ver na
  lista" em uma coluna abre só aquela busca. Leads de importação entram na coluna "Outras origens".

### Conversas em quadro

A tela **Conversas** abre em um quadro em que cada conversa fica na coluna de **quem precisa agir**, em três faixas:

- **Sua vez** (o que só você resolve): *Intervir* (dúvida, áudio, algo que o agente não resolve), *Criar ou orçar* (prévia
  pedida, sistema ou automação já qualificados) e *Fechar o valor* (quer o site e falta a proposta e o Pix).
- **Em andamento:** *Aguardando o sinal*, *Com o agente* e *Com você* (conversas que você assumiu).
- **Parado:** *Sem resposta* e *Encerradas*.

Cada cartão mostra a última mensagem, o pedido dele em uma frase, o produto, a temperatura, o próximo passo e há quanto tempo
ele espera. Quem espera há mais tempo vem primeiro. Clique para abrir, responder ou assumir; "Caixa" abre a caixa de
entrada (veja abaixo). Em celular as colunas empilham. Detalhes em [docs/stories/5.2.story.md](docs/stories/5.2.story.md).

### Caixa de entrada

Ao abrir uma conversa (ou em **Caixa**), a tela vira uma caixa de entrada com **três colunas**, cada uma com rolagem própria:
a **lista** (busca por nome ou mensagem e filtros *Todas*, *Sua vez* e *Não lidas*), a **conversa** (histórico em balões,
um divisor por dia, o rascunho do agente logo depois da última mensagem e a caixa de resposta presa no pé; `Ctrl`+`Enter`
envia) e a **ficha** do lead (dados, ficha do agente, prévia e proposta). Abaixo de 1500 px de largura a ficha vira uma gaveta,
aberta pelo botão **Ficha**. O menu lateral agrupa as telas em Prospecção, Vendas e Sistema e mostra o estado da automação
(ligada, pausada ou simulação). Detalhes em [docs/stories/6.12.story.md](docs/stories/6.12.story.md).

Conversa em que o lead disse que **pagou** (ou mandou o comprovante) vai para *Intervir* com a ação "Conferir o Pix e marcar o
sinal". Se aparecer no topo o aviso **"Respostas de robô"**, são leads antigos que "responderam" com a saudação automática do
negócio: o botão **Consertar** devolve essas conversas a *Sem resposta* sem apagar nem enviar nada (veja
[docs/APRENDIZADOS.md](docs/APRENDIZADOS.md) e [docs/stories/6.9.story.md](docs/stories/6.9.story.md)).

## Fila, conversas e envio

1. **Caçador** acha os leads e **Funil** é onde você marca os melhores como *Qualificado*.
2. **Fila → Preparar lote de hoje** escreve uma abertura por lead qualificado, em 3 mensagens curtas: quem sou ("Sou o Jonathan Kelvin, desenvolvedor…", sem a marca, falando COM a pessoa), o elogio com dado real e a dor, e a solução com uma pergunta. O agente (IA) escreve cada uma
   com os dados da empresa, em 1 a 3 mensagens curtas e com abordagens diferentes (4 ângulos por situação: sem
   site, só Instagram, site fraco); sem IA ou se o texto for reprovado, vale o modelo do mesmo ângulo. Cada
   parágrafo sai como uma mensagem, com o "digitando…" de cada uma. "Reescrever aberturas com o agente" sorteia
   textos novos. Detalhes em [docs/AGENTE.md](docs/AGENTE.md).
3. Você lê, edita se quiser e **aprova**. Só então entram na agenda: segunda a sexta, 09–12 e
   14–18 (Fortaleza), com intervalo aleatório de 3 a 9 min e teto diário de 8, 15 e 30 conforme o
   aquecimento do chip.
4. O **worker** (`npm run worker`) envia **uma** mensagem por volta e só se passar nas travas:
   automação despausada, fora da simulação, na janela, abaixo do teto, número fora da lista de
   "PARE".
5. As respostas chegam por webhook e o **agente de atendimento** ([docs/AGENTE.md](docs/AGENTE.md)) entende o
   assunto, escreve a resposta curta e monta a ficha do lead. Tudo vira rascunho para você aprovar em
   **Conversas**. "PARE" bloqueia o número para sempre e cancela o que estava na fila.
6. Follow-ups: D+2 e D+5, no máximo 3 toques por lead. Se 3 envios seguidos falharem, ou se menos
   de 3% responderem depois de 40 envios, a automação se **pausa sozinha**.

**Pausar à noite e retomar de manhã.** Pausar é um clique e não perde nada: o que estava aprovado fica esperando. Ao
**Retomar**, o painel reorganiza o que ficou parado (nada sai de uma vez): as aberturas e follow-ups aprovados ganham horário
novo a partir de agora, dentro dos horários e do teto do dia; as respostas do agente com mais de 3 h voltam como rascunho para
você conferir; os rascunhos de ontem continuam esperando, com o selo "De dd/mm". O cartão da automação mostra "Ao retomar" antes
de você clicar. E o "Preparar lote de hoje" conta as sobras de ontem no teto, para não dobrar a fila. Detalhes em
[docs/stories/6.5.story.md](docs/stories/6.5.story.md).

**Mudar o horário de envio.** Ao salvar as **Regras de envio** (janelas, dias, tetos por dia ou intervalo entre mensagens), a fila
de aberturas e follow-ups já aprovados é **planejada de novo na hora** com as regras novas: tudo dentro das janelas, nos dias
permitidos, sem passar do teto do dia (contando o que já saiu hoje) e com o intervalo entre mensagens. A tela diz quantas foram
reorganizadas, a primeira e a última. Se a fila já estava fora das regras (o horário foi mudado antes), basta salvar de novo.
Quem está sendo enviado, o que já saiu, os rascunhos e as respostas do agente não mudam. Detalhes em
[docs/stories/6.10.story.md](docs/stories/6.10.story.md).

**Segurar um dia (dias sem envio).** Na **Fila**, em **Segurar um dia**, o botão **Pular amanhã** (ou hoje, ou o próximo dia com fila)
marca aquele dia como sem envio: nenhuma abordagem sai nele e a fila aprovada é planejada de novo, na mesma ordem, para o próximo dia
útil, dentro das janelas e do teto de cada número. Dá para escolher **outro dia** no calendário, e **Voltar a enviar** desfaz e traz a fila
de volta. Diferente de pausar, as respostas do agente a quem escrever continuam saindo, e não há o que lembrar de retomar. Vale para todos
os números; os dias que passaram saem da lista sozinhos. Detalhes em [docs/stories/7.2.story.md](docs/stories/7.2.story.md).

**Cancelar na Fila.** O botão **Cancelar** de **Agendadas** vale para qualquer mensagem da lista, inclusive a que está em
**Enviando…**. Se ela ficar assim por mais de 10 minutos depois da hora marcada, o envio parou no meio (o painel reiniciou):
a Fila marca **Presa em enviando**. Confira no WhatsApp se saiu; cancelar a tira da Fila, e **Reabrir** (em Canceladas) a devolve
como rascunho. O sistema não reenvia essa mensagem sozinho, de propósito: poderia mandar duas vezes. Detalhes em
[docs/stories/6.11.story.md](docs/stories/6.11.story.md).

Padrões de segurança: `paused = true`, `dryRun = true`, leads de demonstração nunca vão para o
envio real, e o painel recusa tetos acima dos limites rígidos.

## Vários números de WhatsApp

Em **Números** você cadastra e conecta mais de um número (QR code ou código de pareamento) e só dá o nome a cada um (Número 1,
2, 3, 4…). Com mais de um número ativo, a **Fila** ganha o painel **Leads liberados**: os leads qualificados, por ramo e cidade
("Estética · São Paulo, 20 leads"). **Você escolhe o número** de cada grupo e o agente escreve a abertura de cada lead já como
conversa daquele número; depois é aprovar, e os horários são planejados **por número**.

- **Um lead, um número**: depois do primeiro contato a conversa fica com aquele número para sempre.
- **Cada número tem as suas travas**: teto por dia (começa em 8, 15 e 25), aquecimento, intervalo, pausa e a parada por pouca
  resposta. A falha de um número pausa só ele. Uma mensagem por volta do worker, no total.
- **Variação obrigatória**: cada abertura combina saudação, apresentação, ângulo e pergunta final menos usados nos últimos envios
  de todos os números, e o sistema recusa texto parecido demais com os recentes.
- **Opt-out vale para todos os números.** Resposta em outro número que não o que abordou vai para você, sem o agente responder.
- **Conversas por número:** em **Conversas** há um filtro (Todos, Número 1, Número 2…) com o total de cada um e o selo das que esperam por
  você. Cada cartão e cada conversa mostram o número, e a conversa avisa quando o número dela está pausado. A resposta sai sempre pelo
  número que abordou o lead ([story 7.3](docs/stories/7.3.story.md)).
- Com **um número só** nada muda. Falta aplicar `supabase/migrations/20261027000000_numbers.sql` (só acrescenta).

Plano, regras, passo a passo para conectar e riscos em [docs/MULTI-NUMERO.md](docs/MULTI-NUMERO.md); entrega em
[docs/stories/7.1.story.md](docs/stories/7.1.story.md). Para ver as telas sem WhatsApp: `npm run dev:demo -- --numeros=3` (dados fictícios, porta 3200).

## Agente de atendimento

Lê a resposta do lead, entende o assunto (27 deles), escreve a resposta no seu jeito e diz o próximo passo da venda.
Funciona **sem IA** (regras do playbook, grátis) e, se você quiser, **com IA** (Gemini grátis, `GEMINI_API_KEY`), sempre
com uma trava que só deixa passar preço, prazo, sinal, link e Pix que são seus. No modo **assistido** nada sai sem a sua
aprovação; no modo **autônomo** (você liga na tela Agente, digitando uma confirmação) ele responde sozinho o que é seguro e
chama você no resto.
**Resposta de robô.** Se o negócio responder com mensagem automática (ausência, saudação, menu), o agente não conversa com ela, não
a conta como resposta e espera uma pessoa; a mensagem fica marcada na conversa. Duas mensagens quase juntas não geram duas respostas
iguais. Detalhes em [docs/stories/6.6.story.md](docs/stories/6.6.story.md).

**Qualificação:** antes de chamar você, o agente conduz um roteiro curto de perguntas, uma por vez. Para site, o objetivo e
o que o lead já tem (logo, fotos, textos); para **sistema e automação**, o que precisa fazer, como faz hoje e o que pesa,
quem vai usar, o que precisa ligar (WhatsApp, planilha, agenda, pagamento) e o prazo. No fim você recebe o resumo do pedido,
que também vira o briefing do projeto.
Tela **Agente**: simulador, casos treinados e regras. Guia completo, com o que foi aproveitado de `blader/humanizer`
e `msitarzewski/agency-agents`: [docs/AGENTE.md](docs/AGENTE.md).

## Prévia, proposta e produção

Do "pode" do lead ao site entregue (guia completo em [docs/PREVIAS.md](docs/PREVIAS.md)):

1. Na conversa ou no lead, **Gerar prévia do site**: um site de uma página com os dados públicos do
   negócio, num link secreto (`/p/<código longo>`). Você escolhe o modelo e as cores.
2. **Preparar mensagem** cria um rascunho com o link. Nada sai antes de você aprovar.
3. **Criar proposta** (valor, sinal, prazo) e **Preparar mensagem com o valor** (leva a sua chave Pix).
4. O Pix cai na **sua** conta. Você clica em **Recebi o sinal**: o lead vira Ganho, o caixa soma e o
   **projeto** abre em Produção com prazo e lista de tarefas.

Para o lead conseguir abrir o link, o painel precisa de um endereço público (`SITE_URL`); no
`localhost` o link só abre no seu computador, e o painel avisa.

## Como a nota funciona

Nota de 0 a 100, sempre explicada em `Lead → Por que essa nota`:

| Critério | Máx. | Regra |
|---|---|---|
| Site | 35 | Sem site ou só Instagram/link de bio: 35. Site fraco: 22. Site próprio: 0 |
| Reputação | 15 | Nota no Maps: 4,5+ = 15, 4,3+ = 12, 4,0+ = 8, 3,5+ = 4 |
| Movimento | 15 | Avaliações: 100+ = 15, 50+ = 12, 30+ = 10, 10+ = 5 |
| Contato | 20 | Celular: 20. Só fixo: 5 |
| Nicho | 10 | Nicho de ticket alto (lista editável em Configurações) |
| Presença | 5 | Perfil com fotos ou horário |

Negócio **fechado** no Maps ou número **bloqueado** (opt-out) ficam com nota 0. **Elegível** =
tem celular, não está fechado e não pediu para sair. O funil não conta lead inelegível parado em
"Novo".

## Comandos

| Comando | O que faz |
|---|---|
| `Ligar-sistema.bat` | **Duplo clique:** liga painel, GOWA e worker (há um atalho na Área de trabalho) |
| `npm run dev` | Painel em desenvolvimento |
| `npm run dev:demo` | Painel em modo demonstração na porta 3200, mesmo com o `.env.local` preenchido (nada de Supabase, Apify ou WhatsApp) |
| `npm run build` / `npm start` | Versão de produção (exige Supabase configurado) |
| `npm run worker` | Worker de envio (uma volta a cada 20 s; precisa do painel no ar) |
| `npm run gowa` | Sobe o GOWA ligado ao painel (precisa de `gowa\whatsapp.exe`) |
| `npm run agent:eval` | Mede a IA do agente contra os 52 casos do gabarito (precisa de `GEMINI_API_KEY`; gasta chamadas do plano grátis) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Testes (Vitest) |

## Estrutura

```
src/
  app/(app)/        painel (Comando, Caçador, Funil, Fila, Conversas, Números, Demos, Produção, Financeiro, Lead, Configurações) + Server Actions
  app/p/[slug]/     prévia pública do site (sem login; link secreto)
  app/login/        login: 1 clique neste computador ou e-mail e senha do Supabase
  app/api/searches/ andamento das buscas do Apify
  app/api/worker/   uma volta do worker de envio (Bearer WORKER_TOKEN)
  app/api/webhooks/ respostas e confirmações do GOWA (assinatura HMAC)
  components/       UI (marca JK: escuro, lime, raio zero), leads e outreach
  lib/leads/        telefone, site, nota, pipeline de entrada (ingest), filtros
  lib/outreach/     motor de envio, trava de segurança, agenda, modelos de texto, classificador, GOWA
  lib/agent/        agente de atendimento: assunto, ficha, playbook, humanizador, trava de fatos, IA opcional
  lib/deals/        prévia do site, proposta, dinheiro (centavos), projeto de produção
  lib/sources/      Apify e gerador de leads fictícios
  lib/repo/         camada de dados: Supabase (real) e memória (demonstração/testes)
scripts/            worker-loop.mjs e gowa-start.ps1
supabase/migrations/ esquema, RLS e funções
docs/               plano, stories, WHATSAPP.md e PREVIAS.md
```

## Segurança

- Com login de e-mail e senha, o painel usa só a chave **publishable** + a sessão do dono. A chave
  **secret** fica no seu PC (`.env.local`), nunca vai ao navegador, e é usada pelo worker, pelo webhook
  e pelo acesso de 1 clique neste computador (nunca por quem entra de outro endereço).
- O cookie do 1 clique é assinado (HMAC-SHA256, `SESSION_SECRET`), expira em 30 dias e é ignorado se o
  pedido tiver cabeçalhos de túnel/proxy ou um endereço que não seja localhost. Não existe senha fixa
  no código. Um cookie antigo (`jk_auth_session`) não vale mais.
- O worker exige `Authorization: Bearer WORKER_TOKEN` e o webhook exige a assinatura HMAC; ambos
  comparam em tempo constante e recusam tudo se o segredo não estiver configurado.
- RLS ligado em todas as tabelas; só o dono do workspace lê e grava (`is_owner()`).
- Todo acesso a dados passa por `getRepo()`, que exige o dono logado antes de tocar no banco
  (layout e página renderizam em paralelo, então checar só no layout não basta). Server Actions
  e a rota de API conferem de novo; o `proxy.ts` só renova a sessão e não é a única barreira.
- Em produção sem Supabase configurado o painel recusa tudo em vez de abrir sem login.
- A análise de site faz requisições a endereços de terceiros e bloqueia hosts internos (SSRF).

## Regras que não podem ser quebradas

- Lead com `source = 'demo'` **nunca** entra no envio real.
- Antes de qualquer envio: respeitar `optouts`, janela de horário e limites diários (plano, seção 0.6).
- WhatsApp: programa Go (whatsmeow) em `localhost`, chip dedicado (plano, seção 0.7).
- Nenhuma mensagem sai sem aprovação do dono (modo *copiloto*). Inclui a que leva o link da prévia, a da proposta e as que o agente escreve.
- A prévia pública só devolve o conteúdo de uma prévia publicada, pelo código exato (função `view_demo`); nenhuma tabela é aberta ao visitante.
- Dinheiro é sempre em centavos e só entra no caixa quando o dono marca que recebeu.
