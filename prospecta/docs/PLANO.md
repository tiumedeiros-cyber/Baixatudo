# JK Prospect X1 — Plano de implementação

Data: 2026-10-21 · Autor: Claude · Dono: Jonathan Kelvin (JK / Kelvin Studio)

> Objetivo: automatizar o "X1" de prospecção no WhatsApp para vender sites para negócios locais.
> A IA caça os leads, abre a conversa, qualifica, manda proposta e cobra. Você acompanha tudo num painel e só entra para produzir o site e, quando quiser, assumir uma conversa.

---

## 0. Atualização de 2026-10-21: WhatsApp em Go e orçamento zero

Você pediu API não oficial em Go (sem Baileys), nada de gasto agora (só a assinatura Claude Pro) e perguntou sobre a IA quebrada no site. Verifiquei nas fontes oficiais e o plano mudou assim. Esta seção prevalece sobre o resto do documento.

### 0.1 WhatsApp: Go com whatsmeow

- **whatsmeow** é a biblioteca Go que fala direto com o WebSocket do WhatsApp multi-dispositivo (7,6 mil estrelas, ativa, licença MPL-2.0). Sem navegador, sem Puppeteer, leve. Suporta enviar/receber texto e mídia, recibos de leitura e notificação de "digitando…".
- Dois servidores prontos em cima dela, ambos MIT, REST + webhooks, prontos para Docker ou binário:
  - **GOWA** (`aldinokemal/go-whatsapp-web-multidevice`): binário único, multi-conta, painel de UI, webhooks e **servidor MCP embutido**. É a minha escolha inicial.
  - **WuzAPI** (`asternic/wuzapi`): REST + webhooks, multi-sessão. É o plano B.
- O sistema fala com eles por uma interface `WhatsAppProvider`, então dá para trocar um pelo outro (ou pela API oficial) sem refazer nada.
- **Honestidade sobre risco:** trocar Baileys por Go **não reduz o risco de banimento por si só**. É o mesmo tipo de cliente não oficial e o uso fere os termos do WhatsApp. O que protege o número é comportamento: volume baixo, intervalos humanos, opt-out e chip dedicado.

### 0.2 "Você conecta e eu faço" no WhatsApp Web normal

O equivalente real: você escaneia o QR **uma vez** no painel (o programa vira "aparelho conectado", igual ao WhatsApp Web) e o sistema passa a enviar. Para você é a mesma experiência.

Eu **dirigir o web.whatsapp.com pelo navegador** não é bom caminho:
- só funciona com esta sessão aberta e gasta sua cota do Pro a cada clique e captura de tela;
- minhas regras exigem seu OK explícito para cada mensagem enviada em seu nome, então não consigo disparar em loop sozinho;
- é tão detectável quanto o cliente Go, e mais frágil.

Desenho adotado: **o Claude prepara, o Go envia.**
1. Eu escrevo o lote do dia na fila (leads ranqueados, mensagem de cada um).
2. Você aprova o lote com 1 clique no painel (o seu OK explícito).
3. O worker em Go envia respeitando horário e intervalos aleatórios, e trata as respostas pelas regras da seção 0.3.

### 0.3 IA sem gastar: três camadas

Fatos que pesam aqui: a assinatura **Claude Pro não dá chave de API** (API é cobrada à parte), e a Anthropic diz na documentação do Claude Code que o login da assinatura é para uso individual do Claude Code e dos apps dela, e que quem constrói produto deve usar chave de API. Ou seja, um servidor chamando o Claude com o token do seu Pro **não é permitido**. Então:

| Camada | Quem | O que faz | Custo |
|---|---|---|---|
| 1. Cérebro | **Claude pelo Claude Code/app (sua assinatura)**, em lote, no seu computador | Ranquear leads, escrever aberturas e follow-ups, escolher template de demo, redigir resposta difícil | R$ 0 extra, dentro da cota do Pro |
| 2. Tempo real | **Modelo gratuito** (a página de preços do Gemini API mostra camada "sem custo financeiro" para alguns modelos, com limite de requisições; confirmar no AI Studio quais) | Classificar resposta (interessado, dúvida, não, PARE) e responder FAQ curto do roteiro | R$ 0 |
| 3. Depois da 1ª venda | **API da Claude (modelo pequeno)** | Mesmo trabalho da camada 2, com mais qualidade | Troca uma variável de ambiente |

Tudo que fugir do roteiro (preço fora da tabela, reunião, irritação) vai para a sua fila.

### 0.4 O site atual e a IA quebrada

O que vi no código: o botão "Analisar com IA" gera **5 mensagens por lead** (3 aberturas e 2 follow-ups) e falha por falta de chave. A importação de Maps usa campos no padrão de scraper do Apify (`totalScore`, `reviewsCount`, `categoryName`), que também precisa de token. O envio é manual por link `wa.me`.

Minha recomendação: **não gastar tempo consertando o site antigo.** A lógica das 5 mensagens migra para o painel novo. Se quiser usar o antigo nesse meio tempo, duas saídas sem custo:
- no chat do Lovable, pedir para usar o **conector de IA nativo** (não pede chave, mas consome créditos do Lovable; veja seu saldo);
- ou colar uma chave gratuita do Google AI Studio.

### 0.5 Resto da stack sem gastar

| Parte | Escolha | Observação |
|---|---|---|
| Leads | Apify (a página do ator mostra a partir de US$ 1,50 por 1.000 lugares nos planos pagos; plano grátis tem crédito mensal, **confirmar no seu painel**) ou Places API do Google com teto de cota | Piloto de 100–300 leads cabe no crédito grátis. OpenStreetMap é alternativa 100% grátis com cobertura parcial |
| Banco e login | Supabase plano grátis | Pausa se ficar 7 dias sem uso |
| Painel | Next.js na **Cloudflare** (plano grátis permite uso comercial) | Vercel Hobby é para uso não comercial, evitar para esse painel (confirmar) |
| Worker WhatsApp | Binário Go **no seu PC Windows** | R$ 0, IP residencial; o PC precisa estar ligado nas janelas de envio. Depois migra para VPS barato |
| Demo do site | **4 a 6 templates premium** preenchidos com os dados do lead e servidos em `/demo/{slug}` | Sem deploy e sem token por demo. A IA só escolhe o template e escreve o texto |
| Chip | Único gasto real: um chip dedicado (~R$ 15–30) | Não use o pessoal |

**Mudança de fluxo:** a demo só é gerada **depois que o lead diz "pode"**. A abertura vai sem link e sem demo. Isso protege o número e poupa cota.

### 0.6 Ritmo anti-banimento (valores iniciais, a calibrar no piloto)

São heurísticas, **não garantia**:
- Semana 1: 8–10 abordagens novas/dia. Semana 2: 15–20. Depois, no máximo 30.
- Janelas 9h–12h e 14h–18h, segunda a sexta.
- Intervalo aleatório de 3 a 9 minutos entre aberturas e pausa maior a cada 5 envios.
- "Digitando…" por 2–6 s proporcional ao tamanho antes de enviar.
- Nunca duas mensagens idênticas: variações (m1–m3) mais 1 dado real do lead.
- Responder em 30–120 s quando o lead responde (conversa de ida e volta ajuda a reputação).
- Parada automática se houver 2 ou mais bloqueios/denúncias, queda inesperada de conexão, ou resposta abaixo de 3% depois de 40 envios (sinal de mensagem ruim).

### 0.7 Requisitos do WhatsApp na prática (Fase 2)

- Programa Go rodando só em `localhost` no PC, sem porta exposta na internet; sessão salva localmente, QR escaneado uma única vez.
- Número dedicado, de preferência no WhatsApp Business, **aquecido 7–14 dias** antes da primeira abordagem (foto, nome, descrição, conversas reais com resposta).
- O celular do chip precisa abrir o WhatsApp ao menos a cada 14 dias, senão os aparelhos vinculados são desconectados.
- Antes de entrar na fila do dia, cada número passa por duas checagens: é celular (DDD + 9 dígitos) e existe no WhatsApp. Fixo e número sem WhatsApp são descartados.
- Se o Jonathan responder pelo celular em uma conversa, o sistema detecta a mensagem enviada por ele e **pausa a automação naquela conversa** (status "humano assumiu").
- Áudios recebidos vão direto para a fila dele no piloto.
- Fila persistida no banco: se o PC dormir ou a internet cair, o envio retoma depois sem perder nada.
- Ordem de testes: enviar para o próprio número, depois para 1 amigo, depois 3 leads reais, só então o ritmo da seção 0.6.

---

## 1. Diagnóstico do que já existe (jk-prospect.lovable.app)

Conferi o site publicado. O que ele tem hoje:

- Etapa 01, **Contexto**: o que você oferece, público-alvo e diferenciais, usados para calibrar as mensagens da IA.
- Etapa 02, **Importar**: busca por nicho, estado e cidade (Google Maps) ou importação de JSON, sem repetir leads.
- Etapa 03, **Leads**: lista com análise por IA.
- **Pipeline** com contadores: total de leads, com telefone, com site, mensagens enviadas.
- Visual escuro com laranja. Posicionado para "corretores e imobiliárias".

O que **não** tem (e é o motivo de refazer a base):

| Lacuna | Evidência | Consequência |
|---|---|---|
| Leads não ficam num banco | Pelo que vi, leads, contexto e status ficam em `localStorage` (`jkprospect.leads.*`, `jkprospect.context.v2`). O app tem Lovable Cloud conectado (funções de servidor), mas não o usa para guardar leads | Perde tudo ao trocar de navegador/aparelho; a IA não consegue trabalhar sozinha |
| Sem login | Nenhuma chamada de auth | Não dá para conectar WhatsApp nem pagamento com segurança |
| Sem WhatsApp | Nenhuma integração | A mensagem é gerada, mas enviada à mão |
| Sem histórico de conversa | Só contador "mensagens enviadas" | Não dá para medir resposta nem conversão |
| Sem automação | Tudo é clique manual | É exatamente o trabalho manual que você quer eliminar |

Conclusão: o JK Prospect atual é um **bom protótipo do funil de entrada** (contexto, importação, análise). Vale reaproveitar a lógica e as ideias, mas o X1 automatizado precisa de backend, fila de envio e WhatsApp. Recomendo **reconstruir como produto novo** em Next.js + Supabase, importando o que for útil do Lovable.

---

## 2. Análise da ideia: o que é forte e o que é arriscado

### Forte
- O gargalo é real: achar lead qualificado e abordar é a parte que mais consome tempo.
- Nicho claro: negócio local com boa reputação e site ruim ou inexistente é lead com dor visível.
- A IA consegue personalizar usando dados reais (nota, nº de avaliações, tem ou não site), o que bate o "spam genérico".

### Arriscado (e como tratar)

| # | Risco | Por que importa | Mitigação no plano |
|---|---|---|---|
| 1 | **Banimento do WhatsApp** | Conectar o seu número por QR code e mandar mensagem fria para desconhecidos é o padrão que o WhatsApp bane. Perder o número perde também seus clientes atuais. | **Nunca o número pessoal.** Chip dedicado só para prospecção, aquecimento gradual, limites diários, intervalos aleatórios, parar na primeira recusa. |
| 2 | **Regras da API oficial** | A API oficial da Meta não deixa abordar à vontade: abertura fria exige template aprovado, é cobrada por mensagem, e a Meta restringe chatbots de IA genéricos. (Confirmar regras e preços atuais antes da Fase 2; a busca na web falhou nesta sessão.) | Camada `WhatsAppProvider` trocável: começa em QR (rápido, barato, arriscado) e migra para a oficial quando a conversão estiver provada. |
| 3 | **LGPD / opt-out** | Prospecção B2B com dados públicos de empresa é defensável, mas exige transparência e respeito à recusa. | Toda abertura diz quem é você (a linha "responda PARE" saiu da primeira mensagem em 29/10/2026, por decisão do dono; segue nos follow-ups, e o PARE de quem responde bloqueia na hora). Lista de bloqueio global. Registro de consentimento e de recusa. Não abordar MEI/pessoa física sem critério. |
| 4 | **Fonte dos leads** | Raspar o Google Maps na unha viola os termos e quebra com frequência. | Usar a **Places API oficial** (tem cota gratuita e depois é cobrada) ou um provedor terceiro. Descobrir como o site atual faz a busca e migrar. |
| 5 | **"A IA fecha sozinha"** | Preço, escopo e objeção são onde a venda se perde ou se ganha. IA solta no preço queima margem e reputação. | Dial de autonomia em 3 níveis. Começa em Copiloto (a IA rascunha, você aprova) e só sobe quando os números provarem. |
| 6 | **Quem é a "IA" em produção** | Eu não fico rodando dentro desta conversa, e a assinatura Pro não pode alimentar um servidor. | Três camadas (seção 0.3): Claude em lote pela sua assinatura, modelo gratuito em tempo real, API paga só depois da 1ª venda. |
| 7 | **Expectativa de resultado** | Não existe garantia de venda. Os números abaixo são hipóteses a validar no piloto. | Fase de piloto com metas e critério de continuar ou parar. |

---

## 3. Melhorias que mudam o resultado

1. **Demo como diferencial (o que mais converte).** Para o lead que responde "pode", a IA gera uma **prévia do site dele** com nome, fotos, avaliações e cores do negócio, numa URL própria. A abertura vira "vi que a {empresa} tem nota {x} e ainda não tem site, posso te mostrar uma prévia?" e a prévia vem depois do sim (ver seção 0.5). Isso troca pitch genérico por entrega concreta.
2. **Lead score de 0 a 100.** Só os melhores entram na fila do dia (tabela na seção 5).
3. **Primeira mensagem sem link.** Links na abertura aumentam bloqueio e denúncia. A primeira mensagem pede permissão; o link da demo só vai depois do "pode".
4. **Dial de autonomia:** Copiloto → Semi → Auto, com *kill switch* de pausa geral sempre visível.
5. **Cadência curta e fixa:** D0 abertura, D2 follow-up de valor, D5 último toque, depois arquiva. Máximo 3 toques por lead.
6. **Fechamento dentro do fluxo:** proposta com 3 pacotes, link de pagamento Pix com sinal, e o webhook marca o lead como **Ganho** sozinho e alimenta a receita do painel.
7. **Briefing automático pós-venda:** a IA coleta logo, fotos, cores e textos pelo próprio WhatsApp e cria o card de projeto. Você só constrói.
8. **Recorrência:** oferta de hospedagem + manutenção mensal no fechamento (upsell).
9. **Teste A/B contínuo:** variações de abertura por nicho e cidade, com taxa de resposta por variação.
10. **Painel "ao vivo":** feed do que a IA está fazendo agora, com botão PAUSAR TUDO.

---

## 4. Como funciona (fluxo)

```
 Google Places API ──► Leads ──► Enriquecimento ──► Score 0-100
 (nicho/cidade)        (dedupe)   (site? PageSpeed?   │
                                   WhatsApp? reviews)  ▼
                                                  Fila do dia (top N)
                                                       │
                      ┌────────────────────────────────┘
                      ▼
              IA escreve abertura (sem link, sem demo ainda)
                                              │
                                  [Copiloto: você aprova] / [Auto: guardrails]
                                              ▼
                                   Worker WhatsApp (chip dedicado)
                                              │
                      Resposta do lead ◄──────┘
                              │
              ┌───────────────┼───────────────────────┐
              ▼               ▼                       ▼
         Interessado      Dúvida/objeção          "PARE"/não
         manda demo       IA responde (FAQ)       opt-out + arquiva
         + proposta       ou escala p/ você
              │
              ▼
        Pix com sinal ──► webhook ──► GANHO ──► briefing automático ──► Produção (você)
```

**Gatilhos de passagem para humano (a IA para e te avisa):** lead pede desconto ou preço fora da tabela, pede reunião/ligação, manda áudio longo, demonstra irritação, pergunta jurídica, ou a IA tem baixa confiança.

---

## 5. Lead score (proposta inicial, ajustável)

| Sinal | Pontos |
|---|---|
| Sem site | +30 |
| Site existe mas ruim (sem HTTPS, lento, não responsivo, feito em construtor básico) | +20 |
| Nota no Maps ≥ 4,3 | +15 |
| ≥ 30 avaliações | +10 |
| Tem telefone/WhatsApp no perfil | +15 (sem isso, descarta) |
| Nicho de ticket alto (clínica, advocacia, estética, odonto, imobiliária) | +10 |
| Aberto agora / ativo recentemente | +5 |
| Já na lista de bloqueio | descarta |

Só entram na fila do dia os leads com score alto, limitados pelo teto diário.

---

## 6. Guardrails de envio (anti-banimento e anti-queima)

- Chip **dedicado**, nunca o pessoal.
- Aquecimento: semana 1 com 10 novos/dia, semana 2 com 20, depois até 30–40. Subir só se não houver bloqueio.
- Só em horário comercial, intervalos aleatórios entre mensagens (não rajada).
- Máximo de 3 toques por lead; parar na primeira recusa.
- "PARE" ou equivalente entra na lista de bloqueio global na hora.
- Se a taxa de bloqueio/denúncia subir, o sistema **pausa sozinho** e te avisa.
- Toda ação da IA fica registrada em log de auditoria.

---

## 7. Arquitetura recomendada

| Camada | Escolha | Motivo |
|---|---|---|
| Painel | **Next.js (App Router)** + Tailwind + shadcn, na Vercel | Rápido, deploy simples |
| Banco, login, tempo real | **Supabase** (Postgres + Auth + Realtime + Storage), com RLS | O painel "ao vivo" vem do Realtime |
| IA | Claude em lote (assinatura) + modelo gratuito em tempo real; API da Claude depois | Ver seção 0.3 |
| Jobs agendados | pg_cron / Vercel Cron + fila | Fila do dia, cadência, follow-ups |
| **Worker do WhatsApp** | **Go (whatsmeow) via GOWA ou WuzAPI**, no seu PC no piloto e em VPS barato depois | Não roda em serverless: a sessão do QR precisa de processo persistente |
| Leads | **Google Places API (New)** + checagem de site (fetch + PageSpeed) | Fonte oficial, enriquecimento automático |
| Demo de site | Template parametrizado, publicado em URL por lead | O diferencial da seção 3 |
| Pagamento | **Asaas ou Mercado Pago** (Pix + webhook) | Marca "Ganho" automaticamente |

Estrutura sugerida do repositório:

```
jk-prospect-x1/
├─ apps/web          # Next.js: painel
├─ apps/wa-worker    # Node: conexão e envio/recebimento WhatsApp
├─ packages/ai       # prompts, schemas, guardrails, avaliação
├─ packages/db       # tipos gerados do Supabase
└─ supabase/         # migrations, RLS, seeds
```

Tabelas principais: `leads`, `lead_signals`, `lead_scores`, `conversations`, `messages`, `cadences`, `outreach_queue`, `message_variants`, `demos`, `proposals`, `payments`, `projects`, `optouts`, `events` (auditoria), `settings`.

---

## 8. Telas do painel

1. **Comando**: receita do mês, funil do dia, feed ao vivo, **PAUSAR TUDO**.
2. **Caçador**: busca por nicho/cidade, mapa, score, aprovar para a fila.
3. **Funil (kanban)**: Novo → Qualificado → Contatado → Respondeu → Proposta → Ganho / Perdido.
4. **Conversas**: espelho do WhatsApp com botão **Assumir conversa**.
5. **Demos**: galeria das prévias geradas, com link e status de visualização.
6. **Produção**: projetos ganhos, briefing recebido, checklist, prazo.
7. **Financeiro**: propostas, sinais, recebidos, recorrência.
8. **Cérebro da IA**: oferta, pacotes e preços, tom de voz, FAQ, objeções, guardrails, nível de autonomia.
9. **Configurações**: conectar WhatsApp (QR), limites, horários, integrações.

**Direção visual:** sua marca (fundo quase preto, **lime**, **raio zero**, tipografia grotesca + mono para dados), densidade de informação estilo Linear/Vercel, microinterações sóbrias, estados vazios bem desenhados, tema escuro como padrão. Aqui entra o acabamento "lendário": nada de card genérico.

---

## 9. Fases e portões de decisão

Cada fase vira uma story em `docs/stories/` (padrão AIOX) quando começarmos. Prazos são estimativas de trabalho assistido e dependem de você responder as decisões da seção 10.

| Fase | Entrega | Pronto quando | Esforço |
|---|---|---|---|
| **0. Base** | Repo, Supabase, Vercel, tema JK, login | Você entra no painel vazio e bonito | ~1 dia |
| **1. Leads** | Caçador (Places), dedupe, enriquecimento, score, funil kanban, import do JSON antigo | Você vê 100 leads reais ranqueados | 3–4 dias |
| **2. WhatsApp + IA copiloto** | GOWA/WuzAPI (Go) no seu PC, QR no chip dedicado, inbox, Claude prepara o lote e você aprova com 1 clique | Você manda e recebe pelo painel | 3–4 dias |
| **3. Cadência + guardrails** | Fila do dia, follow-ups, limites, PARE, kill switch, feed ao vivo, modo Semi | A IA conduz sozinha dentro dos limites | 3–4 dias |
| **4. Demo + proposta + Pix** | Gerador de prévia, proposta com pacotes, Pix, webhook de Ganho | Um lead de teste vai de "oi" a "pago" | 3–5 dias |
| **5. Produção + métricas** | Briefing automático, cards de projeto, dashboard de conversão e A/B | Você enxerga receita e taxa por nicho | 2–3 dias |
| **6. Piloto** | 1 semana, nicho único, 10→20 envios/dia | Critérios abaixo | 1 semana |

**Critério do piloto (hipóteses de trabalho, não benchmark):**
- Zero número banido e zero denúncia relevante.
- Taxa de resposta ≥ 10% com demo.
- Pelo menos 1 venda em 7 dias.
- Se passou: sobe o volume e testa a API oficial. Se não: ajusta abertura, nicho ou oferta antes de gastar mais.

---

## 10. Decisões abertas (preciso de você)

1. **Número:** ~~você tem o chip?~~ Ele disse que já tem. Falta confirmar se é dedicado (não o usado com clientes) e se é novo ou já em uso, por causa do aquecimento (seção 0.7).
2. ~~Conexão do WhatsApp~~ **Decidido:** Go (whatsmeow) via GOWA ou WuzAPI, com a interface trocável (seção 0.1).
3. ~~Nicho e cidade do piloto~~ **Decidido:** estética em Fortaleza, só leads sem site (Instagram/Linktree no campo "site" conta como sem site), com celular. Ele escolhe cidade + nicho no Caçador do painel.
4. **Sua oferta:** ticket médio de **~R$ 800** (pacote principal, sinal de 50% no Pix). Faltam o que entrega (site de 1 página, institucional, loja?), os outros 2 pacotes, prazo de entrega e se há mensalidade. Pode ser definido durante a Fase 1.
5. **Autonomia inicial:** Copiloto (você aprova cada primeira mensagem) é o recomendado.
6. **Stack:** reconstruir em Next.js + Supabase (recomendado) ou evoluir o projeto Lovable?
7. ~~Servidor do worker~~ **Decidido para o piloto:** seu PC Windows. Pergunta nova: ele fica ligado nas janelas de envio (9h–12h e 14h–18h)?
8. **Pagamento:** Asaas ou Mercado Pago? Você já tem conta?
9. **Chaves, sem gasto:** token do Apify (plano grátis) para os leads e, opcionalmente, uma chave gratuita do Google AI Studio para a camada de tempo real. Nenhuma chave paga agora.

---

## 11. Custo mensal estimado (aproximado, de memória, **confirmar**)

| Item | Faixa |
|---|---|
| Painel (Cloudflare) + Supabase | R$ 0 no piloto; planos pagos só quando escalar |
| IA | R$ 0 (Claude pela assinatura que você já paga + modelo gratuito) |
| Leads (Apify grátis) | R$ 0 dentro do crédito mensal; confirmar no seu painel |
| Chip dedicado | ~R$ 15–30 (**único gasto do piloto**) |
| Servidor do worker | R$ 0 (seu PC); VPS barato (~R$ 25–60) só depois |
| WhatsApp oficial (se migrar) | cobrança por mensagem de marketing, a confirmar |

Preços de API mudam; antes de cada fase eu confirmo o valor vigente nas páginas oficiais.

---

## 12. Próximo passo

Você responde a seção 10 (mesmo que só 1, 3, 4 e 6) e eu começo a **Fase 0** e a **Fase 1** no mesmo dia: base com a identidade JK, login, banco e o Caçador de leads funcionando com dados reais.
