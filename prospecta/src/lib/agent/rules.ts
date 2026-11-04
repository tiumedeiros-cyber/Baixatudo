import { entryCents, formatCents, remainingCents } from "@/lib/deals/money";
import { formatBRL, norm } from "@/lib/utils";
import { isShortVariant } from "@/lib/outreach/style";
import { addressee, pickVariant, proofRating, shortName } from "@/lib/outreach/templates";
import { madeClosingOffer } from "./autonomy";
import { DISCOVERY_PLAN, OBJETIVO_QUESTION, PRODUCT_LABEL, discoveryQuestion, discoverySummary, isCustom, nextStep } from "./discovery";
import { detectTopics } from "./topics";
import type { AgentContext, AgentOutput, DiscoveryId, Handoff, NextAction, Topic } from "./types";
import { decisorFromText, ofDecisor } from "./decisor";
import { alreadyIntroduced, askedQuestion, INTRO_TOPIC, parseAgentVariant } from "./variant";

/**
 * O agente sem IA: o playbook de vendas escrito como regras. Cada assunto tem a resposta que um bom
 * vendedor daria no WhatsApp, curta e com um único próximo passo. É o piso do agente: funciona sem chave,
 * sem internet e sem custo, é testado caso a caso (`scenarios.ts`) e serve de rede de segurança quando a IA
 * erra, demora ou não está ligada.
 *
 * Fontes do método (msitarzewski/agency-agents, MIT), adaptadas a dono de pequeno negócio:
 * - descoberta: uma pergunta por vez, sem interrogatório (Discovery Coach);
 * - objeção é informação: reconhecer, esclarecer, reenquadrar, nunca rebater (AECR);
 * - valor antes de preço: a prévia vem antes da conversa de valor (Proposal Strategist);
 * - um único pedido por mensagem, pequeno e fácil de dizer sim (Outbound Strategist, Behavioral Nudge);
 * - desqualificar com educação em vez de insistir (Deal Strategist).
 * Regras de escrita: blader/humanizer (MIT), em `humanize.ts`.
 */

const NO_HANDOFF: Handoff = { needed: false, reason: null };

const act = (kind: NextAction["kind"], label: string): NextAction => ({ kind, label });

// Fluxo "qualificar" (sem prévia automática): descobrir o que ele quer comprar e entregar o resto ao dono.
const TIPO_QUESTION = "Hoje você pensa em uma landing page, um site completo ou um sistema?";
/** Assuntos que as regras de sempre já tratam bem no fluxo "qualificar" (nenhum menciona prévia). */
const SHARED_TOPICS: Topic[] = ["optout", "abusive", "audio", "media", "not_interested", "source_of_contact", "has_provider", "gatekeeper", "not_now"];
/** Com um lead de sistema, estes assuntos ainda têm resposta própria; o resto é do dono. */
const SYSTEM_PASS_TOPICS: Topic[] = ["thanks", "who", "send_info", "guarantee", "domain_hosting"];

/**
 * Depois da abertura curta ("Bom dia, Dra. X! Aqui é o Jonathan. Posso te fazer uma pergunta rápida?") a pessoa responde qualquer
 * coisa: "oi", "pois não", "sim", "quem é?", "do que se trata?". Em todos esses casos o agente se apresenta, uma vez só.
 */
const INTRO_TOPICS: Topic[] = ["greeting", "yes", "who", "how_works"];
/** Depois da apresentação ("Posso te explicar como funciona?"), estas respostas pedem a explicação. */
const EXPLAIN_TOPICS: Topic[] = ["yes", "how_works", "greeting"];
/** O objetivo do site, na versão curta (cabe junto da explicação em até 260 caracteres). */
/** A pergunta do objetivo, com a palavra do que o negócio vende ("tratamentos", "produtos" ou "serviços"). */
const objetivoShort = (work: string) => `O que você mais quer que a página faça: mostrar os ${work}, receber contatos ou passar confiança?`;

/** Como o agente convida a ouvir a solução, depois de mostrar a dor (uma por lead, sempre a mesma para o mesmo lead). */
const SOLVE_ASKS = ["Posso te mostrar como resolvo isso?", "Quer ver como eu resolvo isso?", "Posso te explicar como eu resolvo?", "Faz sentido eu te mostrar como resolvo?"] as const;

/** O jeito de falar do que o negócio vende: clínica tem tratamentos e pacientes; loja, produtos; o resto, serviços. */
interface Kind {
  work: string;
  item: string;
  client: string;
  act: string;
  /** O que mais pesa no dia a dia desse tipo de negócio, para a pergunta sobre a dor (de onde sai um sistema sob medida). */
  pains: string;
}
const AUTOMOTIVE = /automotiv|funilaria|lava ?jato|detail|mecanic|oficina|auto ?pecas|veicul|carro|moto/;
const HEALTH = /odont|dent|clinic|estet|fisio|psic|medic|saude|nutri|veterin|ortodon|implante|harmoniza/;
const RETAIL = /loja|boutique|moda|roupa|calcad|joia|bijou|pet ?shop|mercad|padaria|doceria|confeit|floricult|farmacia|otica|papelaria|brinquedo|presente|perfumaria|cosmetic|acessori|lanchonete|restaurante|pizzaria|hamburgueria|sorveteria|cafeteria|distribuidora/;
function kindOf(lead: AgentContext["lead"]): Kind {
  const t = norm(`${lead.niche ?? ""} ${lead.category ?? ""} ${lead.name}`);
  if (!AUTOMOTIVE.test(t) && HEALTH.test(t)) return { work: "tratamentos", item: "tratamento", client: "paciente", act: "agendar", pains: "agendar consultas, atender no WhatsApp ou organizar os pacientes" };
  if (!AUTOMOTIVE.test(t) && RETAIL.test(t)) return { work: "produtos", item: "produto", client: "cliente", act: "pedir", pains: "atender os pedidos, controlar o estoque ou organizar os clientes" };
  return { work: "serviços", item: "serviço", client: "cliente", act: "agendar", pains: "agendar, atender no WhatsApp ou organizar os clientes" };
}

/**
 * A dor, numa frase curta e específica: o negócio é bom (a nota, só se for boa) e mesmo assim quem pesquisa não vê o que ele faz nem
 * consegue chamar. Nada de número que não venha dos dados e nenhuma promessa de resultado. Diz "página própria" e não "site": muita
 * gente acha que site é uma coisa grande e cara e para de ouvir.
 */
function painFor(lead: AgentContext["lead"], nome: string, v: string | null, rating: string | null): string {
  const { work, act } = kindOf(lead);
  const who = v ? "Você" : `A ${nome}`;
  const mine = v ? "seus" : "os";
  switch (lead.websiteKind) {
    case "none":
      return rating
        ? `${who} tem nota ${rating} no Google, mas sem uma página própria quem pesquisa não vê ${mine} ${work} nem consegue ${act}.`
        : `Procurei ${v ? "você" : `a ${nome}`} no Google e não achei uma página própria: quem pesquisa não vê ${mine} ${work} nem consegue ${act}.`;
    case "social":
      return rating
        ? `${who} tem nota ${rating} no Google, mas quem pesquisa só acha o Instagram e não vê ${mine} ${work} nem consegue ${act}.`
        : `Quem pesquisa ${v ? "você" : `a ${nome}`} no Google só acha o Instagram: não vê ${mine} ${work} nem consegue ${act}.`;
    default:
      return `Vi o site ${v ? "seu" : "de vocês"} e acho que dá para ele mostrar melhor ${mine} ${work} e levar mais gente a ${act}.`;
  }
}

/**
 * A solução, concreta e no estilo do "link da bio": uma página só, parecida com o Linktree, com cada tratamento, serviço ou produto
 * e um botão que abre o WhatsApp já com o que o cliente escolheu. Só afirma o que a página é e o prazo das Configurações; "fica no ar
 * para o Google encontrar" é o que a página faz, não uma promessa de posição ou de resultado.
 */
function solutionFor(lead: AgentContext["lead"], nome: string, v: string | null, days: number, rating: string | null, compact = false): string {
  const k = kindOf(lead);
  const base = `Em até ${days} dias eu monto uma página só ${v ? "sua" : `da ${nome}`}, no estilo Linktree: cada ${k.item} com um botão que abre o WhatsApp já com o que o ${k.client} quer`;
  return compact ? `${base}. Ela fica no ar para o Google encontrar.` : `${base}, mais ${rating ? "avaliações do Google" : "fotos"} e mapa. Ela fica no ar para o Google encontrar.`;
}

/**
 * Quem não quer nem a página simples: o dono também desenvolve SISTEMA sob medida, e o caminho é entender a dor do dia a dia antes de
 * oferecer qualquer coisa. Uma pergunta aberta, com o que mais pesa nesse tipo de negócio; a resposta entra no roteiro de sistema.
 */
function painFirstFor(lead: AgentContext["lead"]): string {
  return `Sem problema! Além de página e site, eu desenvolvo sistemas sob medida. Hoje o que mais dá trabalho no dia a dia: ${kindOf(lead).pains}?`;
}

/**
 * "Não preciso de site", "já tenho Instagram": quem diz isso quase sempre acha que site é uma coisa grande. Uma vez só, o agente mostra
 * que pode ser uma página simples, no estilo Linktree; se ele repetir, agradece e encerra.
 */
function reframeFor(lead: AgentContext["lead"], nome: string, v: string | null): string {
  const k = kindOf(lead);
  const full = `Entendo! Não precisa ser um site grande: é uma página só ${v ? "sua" : `da ${nome}`}, no estilo Linktree, com cada ${k.item} e um botão que abre o WhatsApp já com o que o ${k.client} quer. Ela fica no ar para o Google encontrar. Faz sentido eu te explicar?`;
  return full.length <= 255 ? full : full.replace(" Ela fica no ar para o Google encontrar.", "");
}

/** O que ele faz, em poucas palavras: o das Configurações quando é curto; senão "desenvolvedor de sites". */
function shortRole(role: string | undefined): string {
  const r = (role ?? "").trim();
  return r && r.length <= 40 ? r : "desenvolvedor de sites";
}

function pix(ctx: AgentContext): string | null {
  const { pixKey, pixHolder } = ctx.facts;
  return pixKey ? `chave ${pixKey}${pixHolder ? ` (${pixHolder})` : ""}` : null;
}

/** O que dá para afirmar sobre dinheiro: a proposta de verdade, se existir; senão as regras padrão do dono. */
function money(ctx: AgentContext) {
  const p = ctx.proposal && ctx.proposal.status !== "cancelled" ? ctx.proposal : null;
  if (p) {
    return {
      total: formatCents(p.amountCents),
      entry: formatCents(entryCents(p)),
      rest: formatCents(remainingCents(p)),
      pct: p.entryPct,
      days: p.deliveryDays,
      fromProposal: true,
    };
  }
  return {
    total: formatBRL(ctx.facts.priceFrom),
    entry: null,
    rest: null,
    pct: ctx.facts.entryPct,
    days: ctx.facts.deliveryDays,
    fromProposal: false,
  };
}

/** Por que escrevemos, em uma frase, conforme o que achamos do site do lead. */
function whyWrote(ctx: AgentContext, nome: string): string {
  switch (ctx.lead.websiteKind) {
    case "none":
      return `Vi a ${nome} no Google e não achei um site de vocês`;
    case "social":
      return `Achei a ${nome} no Google e só vi o Instagram, sem site`;
    default:
      return `Vi o site da ${nome} e tenho ideias para melhorá-lo`;
  }
}

/** A resposta é o texto do próprio dono; só acrescenta o próximo passo se ele não terminou com uma pergunta. */
function policyText(text: string, nome: string, demoSent: boolean): string {
  const t = text.trim();
  return demoSent || t.includes("?") || t.length > 200 ? t : `${t} Posso montar a prévia da ${nome}?`;
}

export function rulesReply(ctx: AgentContext, topics: Topic[] = detectTopics(ctx.inbound.text, ctx.inbound.media, ctx.facts.flow)): AgentOutput {
  const f = ctx.ficha;
  // A recepção responde à pergunta "quem cuida da divulgação?" com o nome ou o celular de quem decide, numa frase que não parece
  // recepção ("a Dra. Joyce cuida, o número dela é…"): se a conversa já mostrou a recepção, isso continua sendo a recepção.
  const said = decisorFromText(ctx.inbound.text);
  const gaveDecisor = !!f.decisor && !!(said.name || said.phone) && (topics[0] === "other" || topics[0] === "gatekeeper");
  const topic: Topic = gaveDecisor ? "gatekeeper" : f.lastTopic === "answer" ? "answer" : topics[0];
  const nome = shortName(ctx.lead.name);
  const { senderName: s, brandName: b } = ctx.facts;
  const m = money(ctx);
  const demoSent = f.demo.sent;
  const proposalLive = !!ctx.proposal && ctx.proposal.status !== "cancelled" && ctx.proposal.status !== "draft";
  const pickOne = (list: string[]) => list[pickVariant(`${ctx.lead.id}:${topic}`, list.length)];

  const out = (
    reply: string | null,
    extra: {
      handoff?: Handoff;
      nextAction?: NextAction | null;
      asked?: DiscoveryId | null;
      commits?: boolean;
      missing?: "pix_key";
      authorized?: boolean;
      queued?: boolean;
      /** Pergunta do roteiro de qualificação: sai sozinha e ainda não precisa do dono. */
      discovery?: boolean;
      /** O assunto da resposta, quando é outro que o da mensagem (um "pode" que na verdade pede a prévia). */
      topic?: Topic;
    } = {},
  ): AgentOutput => ({
    reply,
    topic: extra.topic ?? topic,
    source: "rules",
    handoff: extra.handoff ?? NO_HANDOFF,
    nextAction: extra.nextAction === undefined ? f.nextAction : extra.nextAction,
    asked: extra.asked ?? null,
    commits: extra.commits ?? false,
    ...(extra.missing ? { missing: extra.missing } : {}),
    ...(extra.authorized ? { authorized: true } : {}),
    ...(extra.queued ? { queued: true } : {}),
    ...(extra.discovery ? { discovery: true } : {}),
    notes: [],
  });
  const needs = (reason: string): Handoff => ({ needed: true, reason });

  /** Lead gostou ou aceitou depois da prévia: é a hora de fechar. */
  const closing = (): AgentOutput => {
    if (proposalLive) {
      const key = pix(ctx);
      return key
        ? out(`Ótimo! O sinal é de ${m.entry}, por Pix, ${key}. Assim que cair, eu começo o seu site.`, {
            nextAction: act("marcar_sinal", "Marcar o sinal quando o Pix cair"),
            commits: true,
          })
        : out(`Ótimo! Já te passo a chave Pix para o sinal de ${m.entry}.`, {
            handoff: needs("Cadastre sua chave Pix em Configurações e envie a chave ao lead."),
            nextAction: act("marcar_sinal", "Enviar a chave Pix e marcar o sinal quando cair"),
            commits: true,
            missing: "pix_key",
          });
    }
    return out(
      `Que bom que gostou! O seu site fica em ${m.total}, com entrega em até ${m.days} dias. O sinal é de ${m.pct}% e o restante na entrega. Posso te passar o Pix?`,
      {
        handoff: needs("Confirme o valor final e crie a proposta antes de aprovar esta mensagem."),
        nextAction: act("criar_proposta", "Criar a proposta com o valor combinado"),
        commits: true,
      },
    );
  };

  // ───── depois do Pix e conversa solta (valem nos dois fluxos) ─────
  // Quem pagou, quem cobra o pedido e quem só brinca não pode ouvir "vou montar a prévia" nem receber pergunta de qualificação.
  /** O agente já passou a chave Pix (ou há proposta viva)? Só então "paguei" e um comprovante fazem sentido. */
  const pixShown =
    proposalLive ||
    ctx.messages.some((x) => x.direction === "out" && ["sent", "delivered", "read", "approved", "simulated"].includes(x.status) && /\bPix\b/.test(x.body) && /chave/i.test(x.body));

  /** "Paguei" ou o comprovante: confirmar que recebeu e entregar ao dono, que é quem vê o dinheiro na conta. */
  const paidReply = (): AgentOutput =>
    pixShown
      ? out("Recebi! Vou conferir o Pix aqui na conta e já te confirmo.", {
          handoff: needs("Ele diz que pagou (ou mandou o comprovante). Confira o Pix na sua conta, marque o sinal no Financeiro e avise que o site começou."),
          nextAction: proposalLive ? act("marcar_sinal", "Conferir o Pix e marcar o sinal") : act("responder", "Conferir o Pix e responder"),
          queued: true,
          topic: "paid",
        })
      : out(null, {
          handoff: needs("Ele fala em pagamento, mas ainda não passamos a chave Pix. Veja o que ele quis dizer antes de responder."),
          nextAction: act("responder", "Entender o que ele quis dizer sobre pagamento"),
          topic: "paid",
        });

  /** "Cadê o site?", "vai resolver meu pedido?": a resposta depende de onde a venda está, e nunca inventa andamento. */
  const statusReply = (): AgentOutput => {
    if (f.phase === "fechado") {
      return out("Vou ver o andamento aqui e já te respondo.", {
        handoff: needs("O cliente já pagou o sinal e cobrou o andamento do site. Responda com a situação real."),
        nextAction: act("responder", "Responder com o andamento do site"),
        queued: true,
      });
    }
    if (ctx.facts.flow === "qualificar" && f.previewPending) {
      return out(null, { handoff: needs("Ele está esperando a prévia."), nextAction: act("fazer_previa", "Fazer a prévia que ele pediu e mandar o link") });
    }
    if (proposalLive && m.entry) {
      const key = pix(ctx);
      // pode ter pago e estar esperando a confirmação, ou ainda não ter pago: a resposta serve para os dois
      return key
        ? out(`Estou por aqui! Se você já fez o Pix do sinal de ${m.entry}, vou conferir agora. Se ainda não fez, é por Pix, ${key}. Assim que cair, eu começo o seu site.`, {
            handoff: needs("Ele cobrou depois de receber o Pix. Confira se o sinal caiu e marque no Financeiro."),
            nextAction: act("marcar_sinal", "Conferir o Pix e marcar o sinal quando cair"),
            commits: true,
            queued: true,
          })
        : out(`Estou por aqui! Já te passo a chave Pix para o sinal de ${m.entry}.`, {
            handoff: needs("Cadastre sua chave Pix em Configurações e envie a chave ao lead."),
            nextAction: act("marcar_sinal", "Enviar a chave Pix e marcar o sinal quando cair"),
            commits: true,
            missing: "pix_key",
          });
    }
    if (madeClosingOffer(ctx.messages)) {
      const key = pix(ctx);
      return out("Estou por aqui! Já te passo a chave Pix para o sinal.", {
        handoff: needs("Ele cobrou depois da oferta. Crie a proposta, confira a chave Pix em Configurações e envie a chave."),
        nextAction: act("criar_proposta", "Criar a proposta e mandar o Pix"),
        commits: true,
        ...(key ? {} : { missing: "pix_key" as const }),
      });
    }
    return out(null, { handoff: needs("Ele cobrou uma resposta ou o andamento. Responda você mesmo."), nextAction: act("responder", "Responder: ele cobrou retorno") });
  };

  const proofOfPayment = topic === "media" && ["image", "document"].includes(ctx.inbound.media ?? "") && pixShown;
  if (topic === "paid" || proofOfPayment) return paidReply();
  if (topic === "status_check") return statusReply();
  // risada, reunião, "tô chegando": o agente não inventa resposta nem promessa (link, horário). Quem responde é o dono.
  if (topic === "casual") {
    return out(null, {
      handoff: needs("Conversa solta ou pedido de reunião. Responda você mesmo."),
      nextAction: act("responder", "Responder (conversa solta ou reunião)"),
    });
  }

  // ───── fluxo "qualificar" ─────
  // Nunca oferece prévia. Descobre o que o lead quer (landing page, site ou sistema), fecha o valor do site e entrega
  // ao dono, com resumo, o que só ele resolve: a prévia que o lead pediu e o orçamento de um sistema.
  const qualify = (): AgentOutput | null => {
    // Quem já está no roteiro de sistema e diz "não preciso de site" só está dizendo o que NÃO quer: a conversa segue pelo sistema.
    const sentNoSite = ctx.messages.filter((x) => x.direction === "out" && !["cancelled", "failed"].includes(x.status));
    const reframed = sentNoSite.some((x) => parseAgentVariant(x.variant)?.topic === "no_need_site");
    if (topic === "no_need_site" && (!isCustom(f.product) || reframed)) {
      // 1ª vez: a página simples, no estilo Linktree. 2ª: volta à dor do dia a dia (o dono também faz sistema sob medida). 3ª: agradece e encerra.
      const pivoted = sentNoSite.some((x) => askedQuestion(x.variant) === "escopo");
      if (pivoted) return out("Tudo bem, obrigado pelo retorno! Se mudar de ideia, é só me chamar.", { topic: "not_interested", nextAction: null });
      if (reframed) {
        return out(painFirstFor(ctx.lead), { asked: "escopo", discovery: true, nextAction: act("esperar", "Esperar: ele diz o que mais pesa no dia a dia (possível sistema)") });
      }
      return out(reframeFor(ctx.lead, nome, addressee(ctx.lead.name)), { discovery: true, nextAction: act("esperar", "Esperar: ele achava que site era grande demais") });
    }
    if (SHARED_TOPICS.includes(topic)) return null;
    // proposta já criada: preço, pagamento, aceite e elogio seguem as regras de sempre (valores da proposta e Pix)
    if (proposalLive && ["price", "payment", "yes", "compliment"].includes(topic)) return null;

    const product = f.product;
    const previewDone = f.previewSentByOwner || demoSent;
    const offerMade = madeClosingOffer(ctx.messages);
    const asks = (id: DiscoveryId) => f.asked.includes(id);
    /** Quantas vezes a pergunta já foi feita (o roteiro desiste depois de duas). */
    const askCount = (id: DiscoveryId) => ctx.messages.filter((x) => x.direction === "out" && askedQuestion(x.variant) === id).length;
    /** A próxima pergunta do roteiro deste pedido: a primeira sem resposta. */
    const step = product ? nextStep(product, f.answers, askCount) : null;
    /** Site pronto para a oferta: o roteiro acabou e ele respondeu pelo menos uma coisa. */
    const siteReady = product === "site" && step === null && !!(f.answers.objetivo || f.answers.material);
    /** "Anotado!", "Entendi!"... variando de pergunta em pergunta, mas sempre igual para a mesma. */
    const ack = ["Anotado!", "Entendi!", "Certo!"][pickVariant(`${ctx.lead.id}:${step ?? topic}`, 3)];

    /** A próxima pergunta de qualificação, se ainda falta alguma. */
    const cta = (): { text: string; asked: DiscoveryId | null } => {
      // depois do valor ou da proposta a qualificação acabou: perguntar "o que você quer que o site faça" de novo seria voltar atrás
      if (offerMade || proposalLive) return { text: "", asked: null };
      if (!product && !asks("tipo")) return { text: TIPO_QUESTION, asked: "tipo" };
      if (product === "site" && step) return { text: discoveryQuestion("site", step) ?? "", asked: step };
      return { text: "", asked: null };
    };
    const withCta = (text: string, extra: Parameters<typeof out>[1] = {}) => {
      const c = cta();
      return out(c.text ? `${text}\n\n${c.text}` : text, { ...extra, asked: c.asked });
    };
    /** O dono escreveu a resposta em Configurações: sai como ele escreveu, com a pergunta de qualificação se ainda cabe. */
    const policy = (text: string) => {
      const t = text.trim();
      const c = cta();
      return out(t.includes("?") || !c.text || t.length > 160 ? t : `${t}\n\n${c.text}`, { authorized: true, asked: t.includes("?") || t.length > 160 ? null : c.asked });
    };
    /** A oferta do site: valor, prazo e sinal das Configurações. Dinheiro: só sai sozinha com "Pode fechar sozinho". */
    const offer = (lead: string) =>
      out(`${lead} o seu site sai por ${m.total}, com entrega em até ${m.days} dias. O sinal é de ${m.pct}% e o restante na entrega. Posso te passar o Pix?`, {
        handoff: needs("Ele está pronto para fechar o site. Confirme o valor final e crie a proposta antes de aprovar esta mensagem."),
        nextAction: act("criar_proposta", "Criar a proposta com o valor combinado"),
        commits: true,
      });

    // pediu prévia: a prévia boa é feita pelo dono. O agente avisa que vai montar e para por aqui até ele mandar o link.
    const wantsPreviewNow = topics.includes("wants_preview") || (topics[0] === "yes" && f.previewPending);
    if (f.previewPending) {
      const confirmedBefore = ctx.messages.some((x) => x.direction === "out" && parseAgentVariant(x.variant)?.topic === "wants_preview");
      const todo = act("fazer_previa", "Fazer a prévia que ele pediu e mandar o link");
      if (wantsPreviewNow && !confirmedBefore) {
        return out(`Claro! Vou montar a prévia da ${nome} com cuidado e te mando por aqui.`, {
          handoff: needs("Ele pediu uma prévia. Faça a prévia e mande o link por aqui: o agente continua quando ele responder."),
          nextAction: todo,
          queued: true,
          topic: "wants_preview",
        });
      }
      return out(null, { handoff: needs("Ele está esperando a prévia."), nextAction: todo });
    }

    // sistema e automação: o valor depende do que ele precisa, então é do dono. O agente conduz o roteiro de perguntas (o
    // mapa do pedido: o que faz, como é hoje, quem usa, o que liga, para quando) e, quando acaba, entrega o resumo.
    if (isCustom(product) && !SYSTEM_PASS_TOPICS.includes(topic)) {
      const noun = PRODUCT_LABEL[product];
      const todo = act("orcar_sistema", product === "automacao" ? "Analisar a automação e passar o valor" : "Analisar o sistema e passar o valor");
      // o aviso "vou analisar" sai uma vez só; depois disso a conversa é do dono
      const announced = ctx.messages.some((x) => x.direction === "out" && /analisar com calma/i.test(x.body));
      if (announced) return out(null, { handoff: needs(`${noun}: a conversa agora é com você.`), nextAction: todo });
      if (!step) {
        return out("Perfeito, obrigado! Com isso eu consigo analisar com calma e já volto com o valor.", {
          handoff: needs(`Qualificação completa. ${discoverySummary(product, f.answers)}`),
          nextAction: todo,
          queued: true,
        });
      }
      const firstQuestion = !DISCOVERY_PLAN[product].some((id) => askCount(id) > 0);
      const lead = firstQuestion
        ? product === "sistema"
          ? "Entendi! Sistema depende bastante do que ele precisa fazer, por isso eu analiso antes de passar o valor."
          : "Entendi! Automação depende bastante do processo de vocês, por isso eu analiso antes de passar o valor."
        : topic === "answer"
          ? ack
          : topic === "price"
            ? `O valor ${product === "sistema" ? "de um sistema" : "de uma automação"} depende do que precisa ser feito, então passo depois de entender.`
            : topic === "timeline"
              ? "O prazo depende do tamanho do projeto, eu confirmo depois de entender."
              : "Certo!";
      return out(`${lead} ${discoveryQuestion(product, step)}`, { asked: step, discovery: true, nextAction: todo });
    }

    // ── a abertura foi a curta: o agente se apresenta (uma vez), fala do que viu e do que falta, e depois explica o site ──
    // Cada resposta é curta e termina em UMA pergunta. Saem sozinhas e sem a IA (`discovery`): são o roteiro, não conversa livre.
    const shortOpened = ctx.messages.some((x) => x.direction === "out" && x.kind === "opening" && isShortVariant(x.variant));
    if (shortOpened && !offerMade && !proposalLive && !isCustom(product)) {
      // Quem já se apresentou (com as palavras das regras, da IA ou do próprio dono) não se apresenta de novo: duas mensagens do
      // lead quase juntas geravam duas apresentações seguidas.
      const introduced = alreadyIntroduced(ctx.messages, s);
      const v = addressee(ctx.lead.name);

      if (!introduced && INTRO_TOPICS.includes(topic)) {
        const rating = proofRating(ctx.lead);
        const full = ctx.facts.senderFullName?.trim() || s;
        // a abertura já cumprimentou: sem "Oi!" de novo. Com título, o nome de quem lê abre a frase ("Dra. Liane, sou o Jonathan…")
        const hi = topic === "who" || topic === "how_works" || !v ? "" : `${v}, `;
        const ask = SOLVE_ASKS[pickVariant(`${ctx.lead.id}:intro`, SOLVE_ASKS.length)];
        // Duas mensagens curtas, como alguém digitando no celular: quem sou, e a dor dele. A abertura já disse "vi o perfil no Google":
        // aqui a conversa vai direto ao que falta, sem repetir.
        return out(`${hi}${hi ? "sou" : "Sou"} o ${full}, ${shortRole(ctx.facts.senderRole)}.\n\n${painFor(ctx.lead, nome, v, rating)} ${ask}`, {
          asked: INTRO_TOPIC,
          discovery: true,
          nextAction: act("esperar", "Esperar a resposta ao convite para explicar"),
        });
      }

      // "pode", "como funciona?": a solução, concreta (o que a página leva e como o paciente chega até o WhatsApp), e a primeira
      // pergunta do roteiro
      if (introduced && !asks("objetivo") && EXPLAIN_TOPICS.includes(topic) && (!product || product === "site")) {
        const yesAck = topic === "yes" ? "Perfeito! " : "";
        const rating = proofRating(ctx.lead);
        let solution = solutionFor(ctx.lead, nome, v, ctx.facts.deliveryDays, rating);
        // nome comprido não pode empurrar a resposta para além do que o sistema aceita mandar sozinho (360)
        const goal = objetivoShort(kindOf(ctx.lead).work);
        if (`${yesAck}${solution}\n\n${goal}`.length > 350) solution = solutionFor(ctx.lead, nome, v, ctx.facts.deliveryDays, rating, true);
        return out(`${yesAck}${solution}\n\n${goal}`, {
          asked: "objetivo",
          discovery: true,
          nextAction: act("esperar", "Esperar a resposta sobre o objetivo do site"),
        });
      }
    }

    /** Aceitou a oferta: a proposta e o Pix saem pelo fechamento sozinho; sem ele (ou sem chave Pix) é o dono quem fecha. */
    const accepted = () => {
      const key = pix(ctx);
      return out("Perfeito! Já te passo a chave Pix para o sinal.", {
        handoff: needs("Ele aceitou o valor. Crie a proposta, confira a chave Pix em Configurações e envie a chave."),
        nextAction: act("criar_proposta", "Criar a proposta e mandar o Pix"),
        commits: true,
        ...(key ? {} : { missing: "pix_key" as const }),
      });
    };

    switch (topic) {
      case "greeting":
        return !product && !asks("tipo")
          ? out(`Oi, tudo bem! Para a ${nome}, você pensa em uma landing page, um site completo ou um sistema?`, { asked: "tipo" })
          : out(`Oi! Me conta o que você precisa para a ${nome}.`);

      case "who":
        return withCta(`Sou o ${s}, da ${b}. Crio sites e sistemas sob medida para negócios locais. ${whyWrote(ctx, nome)}, por isso escrevi.`);

      case "how_works":
        return withCta(`Eu crio sites e sistemas sob medida. Primeiro entendo o que mais pesa no seu dia a dia, depois combinamos valor e prazo, e começo com um sinal de ${m.pct}%.`);

      case "timeline":
        return withCta(`Em geral o site fica pronto em até ${m.days} dias depois de começarmos.${product ? "" : " Já um sistema depende do que ele precisa fazer."}`);

      case "price": {
        if (siteReady && !offerMade) return offer("Anotado! Então fica assim:");
        const c = cta();
        // o valor das Configurações é o preço de uma landing page ou site simples: o agente diz "fica em", nunca "a partir de"
        const base = `Uma landing page ou um site simples fica em ${m.total}, com entrega em até ${m.days} dias e sinal de ${m.pct}% para começar.${product === "site" ? "" : " Sistema depende do que ele precisa fazer."}`;
        return out(c.text ? `${base}\n\n${c.text}` : base, {
          asked: c.asked,
          handoff: needs("Você falou de valor. Confirme que o preço está certo antes de aprovar."),
        });
      }

      case "too_expensive":
        if (ctx.facts.policies.price) return policy(ctx.facts.policies.price);
        return out(`Entendo, vale olhar com calma. O que é prioridade para a ${nome}? Assim eu vejo o que cabe no seu orçamento.`, {
          handoff: needs("Ele achou caro. O agente nunca dá desconto sozinho: veja se vale negociar."),
        });

      case "guarantee":
        if (ctx.facts.policies.guarantee) return policy(ctx.facts.policies.guarantee);
        return out("Já te explico isso direitinho, um instante.", {
          handoff: needs("Pediu garantia, contrato ou nota fiscal. Defina os termos antes de responder."),
          nextAction: act("responder", "Responder sobre garantia, contrato ou nota"),
        });

      case "domain_hosting":
        if (ctx.facts.policies.hosting) return policy(ctx.facts.policies.hosting);
        return out("Já te explico isso direitinho, um instante.", {
          handoff: needs("Perguntou de domínio, hospedagem ou mensalidade. Defina o que está incluso."),
          nextAction: act("responder", "Responder sobre domínio, hospedagem e mensalidade"),
        });

      case "payment":
        // "pode passar o Pix" depois da oferta é o aceite
        if (offerMade && !/parcel|cartao|boleto/.test(norm(ctx.inbound.text))) return accepted();
        if (/parcel|cartao|boleto/.test(norm(ctx.inbound.text))) {
          if (ctx.facts.policies.payment) return policy(ctx.facts.policies.payment);
          return out("Já te explico as formas de pagamento direitinho.", {
            handoff: needs("Perguntou de parcelamento, cartão ou boleto. Defina o que você aceita."),
            nextAction: act("responder", "Responder sobre formas de pagamento"),
          });
        }
        return withCta(`O pagamento é por Pix: ${m.pct}% para começar e o restante na entrega. Te passo os dados quando fecharmos.`);

      case "send_info":
        // quem pede para ver o seu trabalho recebe SÓ o link do portfólio: sem "vou separar" e sem pergunta de qualificação por cima
        if (ctx.facts.policies.portfolio) return out(ctx.facts.policies.portfolio.trim(), { authorized: true });
        return out("Claro! Já te mando alguns trabalhos por aqui.", {
          handoff: needs("Pediu exemplos ou informações. Envie 2 ou 3 trabalhos do seu portfólio."),
          nextAction: act("enviar_exemplos", "Enviar 2 ou 3 exemplos do seu portfólio"),
        });

      case "has_site":
        if (ctx.lead.websiteKind === "weak" || ctx.lead.websiteKind === "real") {
          return withCta("Vi o site de vocês e acho que dá para melhorar bastante.");
        }
        return out(`Qual é o endereço? Não achei um site da ${nome} no Google e quero dar uma olhada.`, {
          handoff: needs("Ele diz que tem site, mas não achamos. Abra o endereço antes de seguir."),
        });

      case "change_request":
        if (!previewDone) break;
        return out("Anotado! Vou ajustar e te mando a nova versão.", {
          handoff: needs("Pediu ajuste na prévia. Ajuste e mande a nova versão por aqui."),
          nextAction: act("ajustar_previa", "Ajustar a prévia do jeito que pediram"),
        });

      case "compliment":
        if (previewDone) return closing();
        return withCta("Obrigado!");

      case "thanks":
        return out(previewDone ? "Me conta o que achou da prévia. Se quiser mudar algo, é só dizer." : null, {
          nextAction: previewDone ? f.nextAction : act("esperar", "Esperar a resposta do lead"),
        });

      case "busy":
        return out(`Sem problema, sem pressa. Quando puder, me conta por aqui o que você precisa para a ${nome} e eu já adianto.`, {
          nextAction: act("esperar", "Esperar: ele está sem tempo agora"),
        });

      case "think":
        return out(`Fechado, sem pressa. Se ajudar, me conta o que você precisa para a ${nome} que eu já te passo uma ideia de valor. Pode ser?`);

      case "wants_site":
        if (step) return out(`Ótimo! ${discoveryQuestion("site", step)}`, { asked: step });
        if (siteReady && !offerMade) return offer("Ótimo! Então fica assim:");
        return out("Ótimo! Me conta com suas palavras o que você quer que o site faça.");

      case "yes":
        if (offerMade) return accepted();
        if (!product) {
          return asks("tipo")
            ? out("Show! Seria uma landing page, um site completo ou um sistema?", { asked: "tipo" })
            : out(`Perfeito! ${TIPO_QUESTION}`, { asked: "tipo" });
        }
        if (step) return out(`Perfeito! ${discoveryQuestion("site", step)}`, { asked: step });
        if (siteReady) return offer("Perfeito! Então fica assim:");
        return out("Ótimo! Me conta com suas palavras o que você quer que o site faça.");

      case "answer":
        if (f.lastAnswered === "tipo") {
          return product === "site" && step
            ? out(`Entendi! ${discoveryQuestion("site", step)}`, { asked: step })
            : out("Entendi. Seria uma página de apresentação, um site com várias páginas ou um sistema, como cadastro ou agendamento?", { asked: "tipo" });
        }
        if (product === "site") {
          if (step) return out(`${ack} ${discoveryQuestion("site", step)}`, { asked: step });
          if (siteReady && !offerMade) return offer("Anotado, obrigado! Fica assim:");
        }
        return withCta("Anotado, obrigado!");

      default:
        break;
    }

    // o resto (assunto novo, fora do roteiro) é do dono; nunca cai nas respostas com prévia
    return out(null, {
      handoff: needs("Fora do roteiro do agente. Responda você ou peça uma resposta à IA."),
      nextAction: act("responder", "Responder (fora do roteiro)"),
    });
  };
  if (ctx.facts.flow === "qualificar") {
    const q = qualify();
    if (q) return q;
  }

  switch (topic) {
    case "optout":
      // quem pediu para parar não recebe resposta; o bloqueio já foi feito pelo motor
      return out(null, { nextAction: null });

    case "abusive":
      return out(null, {
        handoff: needs("Mensagem agressiva ou de desconfiança. Responda você mesmo ou bloqueie o número."),
        nextAction: act("responder", "Decidir: responder pessoalmente ou bloquear"),
      });

    case "audio":
      // O agente não ouve áudio e não pede para a pessoa escrever (esfriava a conversa): nada sai, e a conversa vai para "Intervir"
      // com o aviso para você ouvir e responder. Decisão do dono em 29/10.
      return out(null, {
        handoff: needs("Ele mandou um áudio. Ouça e responda você mesmo: o agente não responde a áudio."),
        nextAction: act("ouvir_audio", "Ouvir o áudio e responder"),
      });

    case "media":
      // figurinha, contato e localização não pedem resposta; imagem, vídeo e arquivo sim
      if (!["image", "video", "document"].includes(ctx.inbound.media ?? "")) {
        return out(null, { nextAction: act("responder", "Ver o que ele mandou") });
      }
      return out("Recebi, mas não consigo abrir arquivos por aqui. Pode me explicar por escrito?", {
        handoff: needs("Ele mandou imagem, vídeo ou arquivo. O agente já pediu para escrever; veja se for importante."),
        nextAction: act("responder", "Ver o arquivo, se for importante"),
      });

    case "not_interested":
      return out("Tudo bem, obrigado pelo retorno! Se mudar de ideia, é só me chamar.", { nextAction: null });

    case "greeting":
      return out(
        demoSent
          ? "Oi! Conseguiu ver a prévia?"
          : pickOne([`Oi! Posso te mostrar a prévia do site da ${nome}?`, `Oi, tudo bem! Quer ver a prévia que eu montaria para a ${nome}?`]),
      );

    case "thanks":
      return out(demoSent ? "Me conta o que achou da prévia. Se quiser mudar algo, é só dizer." : null, {
        nextAction: demoSent ? f.nextAction : act("esperar", "Esperar a resposta do lead"),
      });

    case "who":
      return out(`Sou o ${s}, da ${b}. Crio sites para negócios locais. ${whyWrote(ctx, nome)}, por isso escrevi.\n\nPosso te mostrar uma prévia?`);

    case "source_of_contact":
      return out(`Achei o contato da ${nome} no perfil público do Google. Se preferir que eu não escreva mais, é só dizer PARE.`);

    case "price":
      if (proposalLive) {
        return out(
          m.entry
            ? `O combinado é ${m.total}, sendo ${m.entry} de sinal e ${m.rest} na entrega. Quer que eu te passe o Pix do sinal?`
            : `O combinado é ${m.total}.`,
          { commits: true },
        );
      }
      return out(
        `Um site simples fica em ${m.total}${topics.includes("timeline") ? `, com entrega em até ${m.days} dias depois de começarmos` : ""}. Posso montar a prévia da ${nome} primeiro?`,
        { handoff: needs("Você falou de valor. Confirme que o preço está certo antes de aprovar.") },
      );

    case "too_expensive":
      if (ctx.facts.policies.price) {
        return out(policyText(ctx.facts.policies.price, nome, demoSent), { authorized: true });
      }
      return out(
        `Faz sentido olhar com calma. A prévia não tem custo: você vê como ficaria e só depois decide. Quer que eu monte a da ${nome}?`,
        { handoff: needs("Ele achou caro. O agente nunca dá desconto sozinho: veja se vale negociar.") },
      );

    case "guarantee":
      if (ctx.facts.policies.guarantee) return out(policyText(ctx.facts.policies.guarantee, nome, demoSent), { authorized: true });
      return out("Já te explico isso direitinho. Antes de qualquer coisa você vê a prévia e só decide depois.", {
        handoff: needs("Pediu garantia, contrato ou nota fiscal. Defina os termos antes de responder."),
        nextAction: act("responder", "Responder sobre garantia, contrato ou nota"),
      });

    case "domain_hosting":
      if (ctx.facts.policies.hosting) return out(policyText(ctx.facts.policies.hosting, nome, demoSent), { authorized: true });
      return out("Já te explico isso direitinho, um instante.", {
        handoff: needs("Perguntou de domínio, hospedagem ou mensalidade. Defina o que está incluso."),
        nextAction: act("responder", "Responder sobre domínio, hospedagem e mensalidade"),
      });

    case "payment":
      if (proposalLive && m.entry) {
        const key = pix(ctx);
        return out(
          key
            ? `Pode ser por Pix: o sinal é de ${m.entry}, ${key}. O restante, ${m.rest}, é na entrega.`
            : `Pode ser por Pix: o sinal é de ${m.entry} e o restante, ${m.rest}, é na entrega. Já te passo a chave.`,
          key
            ? { commits: true }
            : { handoff: needs("Cadastre sua chave Pix em Configurações e envie a chave ao lead."), commits: true, missing: "pix_key" },
        );
      }
      if (/parcel|cartao|boleto/.test(norm(ctx.inbound.text))) {
        if (ctx.facts.policies.payment) return out(policyText(ctx.facts.policies.payment, nome, demoSent), { authorized: true });
        return out("Já te explico as formas de pagamento direitinho.", {
          handoff: needs("Perguntou de parcelamento, cartão ou boleto. Defina o que você aceita."),
          nextAction: act("responder", "Responder sobre formas de pagamento"),
        });
      }
      return out(`O pagamento é por Pix: ${m.pct}% para começar e o restante na entrega. Te passo os dados quando fecharmos.`);

    case "timeline":
      return out(
        `Em geral o site fica pronto em até ${m.days} dias depois de começarmos. A prévia vem antes, para você ver como ficou. Quer que eu monte a da ${nome}?`,
      );

    case "how_works":
      return out(
        `Eu monto uma prévia do site da ${nome} com os dados do Google, sem custo. Você vê, me diz o que mudaria e só depois falamos de valor. Posso montar?`,
      );

    case "send_info":
      if (ctx.facts.policies.portfolio) {
        return out(policyText(ctx.facts.policies.portfolio, nome, demoSent), { authorized: true });
      }
      return out(`Posso te mandar por aqui mesmo, é mais rápido. Antes, quer ver a prévia do site da ${nome}?`, {
        handoff: needs("Pediu exemplos ou informações. Envie 2 ou 3 trabalhos do seu portfólio."),
        nextAction: act("enviar_exemplos", "Enviar 2 ou 3 exemplos do seu portfólio"),
      });

    case "has_site":
      if (ctx.lead.websiteKind === "weak" || ctx.lead.websiteKind === "real") {
        return out(`Sim, vi o site de vocês. Posso te mostrar uma prévia de como ele poderia ficar?`);
      }
      return out(`Qual é o endereço? Não achei um site da ${nome} no Google e quero dar uma olhada.`, {
        handoff: needs("Ele diz que tem site, mas não achamos. Abra o endereço antes de seguir."),
      });

    case "has_provider":
      return out("Perfeito, então o site já está resolvido. Se um dia quiserem uma segunda opção, é só me chamar.", {
        nextAction: act("esperar", "Esperar: ele já tem quem faça"),
      });

    case "gatekeeper": {
      // A recepção é quem responde quase sempre. O que vale é o contato de quem decide: com o celular, o agente agradece e a abertura
      // para essa pessoa vira rascunho na Fila (o motor cria); com o nome só, pede o número ou o melhor horário; sem nada, pergunta quem cuida.
      const d = f.decisor;
      const thanks = d?.viaName ? `Obrigado, ${d.viaName}!` : "Obrigado!";
      if (d?.phone) {
        return out(`${thanks} Vou falar com ${d.name ?? "essa pessoa"} nesse número e digo que foi você quem indicou.`, {
          handoff: needs(`A recepção passou o contato de quem decide: ${d.name ?? "sem nome"}, ${d.phoneDisplay ?? d.phone}${d.when ? ` (${d.when})` : ""}. Confira o rascunho da abertura na Fila e aprove.`),
          nextAction: act("responder", `Aprovar na Fila a abertura para ${d.name ?? "quem decide"}`),
          queued: true,
        });
      }
      if (d?.name) {
        return out(`${thanks} Você consegue me passar o número ${ofDecisor(d)} ou o melhor horário para eu falar com ${d.pronoun === "ele" ? "ele" : d.pronoun === "ela" ? "ela" : "essa pessoa"}?`, {
          nextAction: act("responder", `Conseguir o contato ${ofDecisor(d)}`),
        });
      }
      return out(`${d?.viaName ? `Sem problema, ${d.viaName}.` : "Sem problema."} Quem cuida da divulgação da ${nome}, e qual o melhor horário para falar com essa pessoa?`, {
        nextAction: act("responder", "Conseguir o contato de quem decide"),
      });
    }

    case "change_request":
      if (!demoSent) break;
      return out("Anotado! Vou ajustar e te mando a nova versão.", {
        handoff: needs("Pediu ajuste na prévia. Edite a prévia antes de mandar a nova versão."),
        nextAction: act("ajustar_previa", "Ajustar a prévia do jeito que pediram"),
      });

    case "compliment":
      if (!demoSent && !proposalLive) return out(`Obrigado! Posso te mostrar a prévia do site da ${nome}?`);
      return closing();

    case "busy":
      return out("Sem problema, a prévia eu monto sozinho. Você só olha quando puder.", {
        nextAction: act("gerar_previa", "Gerar a prévia sem precisar dele"),
      });

    case "not_now":
      return out("Sem problema. Quando fizer sentido, é só me chamar por aqui.", { nextAction: act("esperar", "Esperar: pediu para falar depois") });

    case "think":
      return out(
        `Fechado, sem pressa. Se quiser, monto a prévia da ${nome} enquanto isso, aí você decide vendo o resultado. Pode ser?`,
      );

    case "yes":
      if (proposalLive || demoSent) return closing();
      if (ctx.demoUrl) {
        return out(`Perfeito! Aqui está a prévia do site da ${nome}: ${ctx.demoUrl}\nÉ um primeiro desenho. O que você mudaria?`, {
          nextAction: act("enviar_previa", "Aprovar o rascunho com o link da prévia"),
        });
      }
      if (!f.asked.includes("objetivo")) {
        return out(`Perfeito! Vou montar a prévia do site da ${nome} e te mando aqui.\n\n${OBJETIVO_QUESTION}`, {
          asked: "objetivo",
          nextAction: act("gerar_previa", "Gerar a prévia do site"),
        });
      }
      return out(`Perfeito! Vou montar a prévia do site da ${nome} e te mando aqui em breve.`, {
        nextAction: act("gerar_previa", "Gerar a prévia do site"),
      });

    case "answer":
      return out(`Anotado, obrigado! Vou montar a prévia da ${nome} com isso e te mando aqui.`, {
        nextAction: act("gerar_previa", "Gerar a prévia do site"),
      });

    default:
      break;
  }

  return out(null, {
    handoff: needs("Fora do roteiro do agente. Responda você ou peça uma resposta à IA."),
    nextAction: act("responder", "Responder (fora do roteiro)"),
  });
}
