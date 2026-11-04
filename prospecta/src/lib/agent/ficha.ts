import type { AgentFlow, Lead } from "@/lib/leads/types";
import { isAutoReplyMessage } from "@/lib/outreach/autoreply";
import type { InboundMedia } from "@/lib/outreach/classify";
import type { Conversation, Message } from "@/lib/outreach/types";
import { norm } from "@/lib/utils";
import { isCustom, isRefusal } from "./discovery";
import { detectProduct, detectTopics } from "./topics";
import { decisorFromTexts } from "./decisor";
import { askedQuestion, INTRO_TOPIC, introducesSelf, OWNER_PREVIEW_VARIANT, parseAgentVariant } from "./variant";
import { TOPIC_LABEL, type Bant, type DiscoveryId, type Ficha, type Heat, type NextAction, type Phase, type Product, type Topic } from "./types";

/**
 * A ficha do lead: onde ele está na venda e o que falta. Calculada só da conversa (e da prévia e da
 * proposta), sem coluna nova no banco, então vale para as conversas que já existem.
 *
 * Qualificação no formato BANT (necessidade, autoridade, orçamento, prazo), adaptada de MEDDPICC e
 * SPIN do agency-agents para dono de pequeno negócio: nada de interrogatório. Cada campo é INFERIDO do
 * que o lead disse e marcado "talvez" ou "desconhecido" quando não dá para saber.
 */

export interface FichaInput {
  lead: Pick<Lead, "stage">;
  conversation: Pick<Conversation, "status"> | null;
  /** Em ordem cronológica. Rascunhos e canceladas são ignorados aqui. */
  messages: Message[];
  demos: { status: string; sentAt: string | null; views: number }[];
  proposals: { status: string; amountCents: number }[];
  /** O fluxo do agente. Sem ele vale o antigo (com prévia). */
  flow?: AgentFlow;
}

const MEDIA_BODY = /^\((audio|image|video|document|sticker|contact|location)\)$/;
const OWNER_SELF = /\bsou (a |o )?(dono|dona|proprietari[oa]|responsavel|gerente)\b|\bminha (empresa|clinica|loja)\b|\bmeu (negocio|salao|espaco)\b/;
const SENT: Message["status"][] = ["sent", "delivered", "read", "simulated", "approved"];

/** Sistema vence automação, que vence site: se ele falou de mais de uma coisa, vale a que o dono orça sob medida. */
const PRODUCT_RANK: Record<Product, number> = { site: 1, automacao: 2, sistema: 3 };
/** Assuntos em que o lead está PERGUNTANDO algo (não respondendo): não contam como resposta do roteiro. */
const ASKING: Topic[] = ["optout", "abusive", "price", "too_expensive", "source_of_contact", "who", "how_works", "timeline", "guarantee", "domain_hosting", "payment", "send_info", "wants_preview", "audio", "media", "paid", "status_check", "casual"];
/** Perguntas do roteiro em que "sim" ou "não" é uma resposta de verdade. */
const YES_NO_STEPS: DiscoveryId[] = ["material", "integracoes"];

const WEIGHT: Partial<Record<Topic, number>> = {
  yes: 3,
  wants_site: 3,
  system_request: 3,
  wants_preview: 3,
  compliment: 3,
  payment: 3,
  paid: 4,
  status_check: 1,
  price: 2,
  timeline: 2,
  how_works: 1,
  send_info: 1,
  think: 1,
  answer: 1,
  greeting: 0.5,
  too_expensive: -1,
  busy: -1,
  not_now: -1,
  has_provider: -2,
  no_need_site: -1,
  has_site: -0.5,
  not_interested: -5,
};

function heatOf(score: number): Heat {
  return score >= 5 ? "quente" : score >= 2 ? "morno" : "frio";
}

function bantOf(topics: Set<Topic>, ownerSelf: boolean) {
  const has = (...t: Topic[]) => t.some((x) => topics.has(x));
  const need: Bant = has("has_provider", "not_interested") ? "nao" : has("yes", "how_works", "price", "compliment", "payment", "paid", "timeline", "send_info", "wants_site", "system_request", "wants_preview") ? "sim" : has("think", "greeting", "has_site", "no_need_site") ? "talvez" : "desconhecido";
  const authority: Bant = has("gatekeeper") ? "nao" : ownerSelf ? "sim" : has("price", "payment", "compliment", "timeline") ? "talvez" : "desconhecido";
  const budget: Bant = has("too_expensive") ? "nao" : has("payment", "paid") ? "sim" : has("price", "compliment") ? "talvez" : "desconhecido";
  const timing: Bant = has("busy", "not_now") ? "nao" : has("timeline", "payment") ? "sim" : has("yes") ? "talvez" : "desconhecido";
  return { need, authority, budget, timing };
}

export function buildFicha(input: FichaInput): Ficha {
  // a resposta automática do negócio ("mensagem automática", menu, aviso de ausência) não é o lead falando
  const msgs = input.messages.filter((m) => m.status !== "draft" && m.status !== "cancelled" && m.status !== "failed" && !isAutoReplyMessage(m));
  const inbound = msgs.filter((m) => m.direction === "in");

  // percorre a conversa: cada resposta do lead pode estar respondendo a uma pergunta do agente
  const asked: DiscoveryId[] = [];
  const answers: Partial<Record<DiscoveryId, string>> = {};
  let pending: DiscoveryId | null = null;
  const topics = new Set<Topic>();
  const signals: string[] = [];
  let score = 0;
  let ownerSelf = false;
  let lastTopic: Topic | null = null;
  let lastAnswered: DiscoveryId | null = null;
  const flow = input.flow ?? "previa";
  // fluxo "qualificar": o que ele quer comprar e o pedido de prévia, que só o dono atende
  let product: Product | null = null;
  let previewAsked = false;
  let previewPending = false;
  let previewSentByOwner = false;
  let offeredPreview = false; // a última mensagem nossa oferecia uma prévia (abordagem e follow-up antigos)
  let introSeen = false; // depois da abertura curta o agente já se apresentou e falou do site
  let reframed = false; // o agente já explicou a página simples a quem disse "não preciso de site"

  for (const m of msgs) {
    if (m.direction === "out") {
      if ((parseAgentVariant(m.variant)?.topic === INTRO_TOPIC || (m.kind !== "opening" && introducesSelf(m.body))) && SENT.includes(m.status)) introSeen = true;
      if (parseAgentVariant(m.variant)?.topic === "no_need_site" && SENT.includes(m.status)) reframed = true;
      const q = askedQuestion(m.variant);
      // a pergunta de escopo só existe para sistema e automação: se o agente a fez (voltando à dor de quem não queria site), o assunto é um sistema
      if (q === "escopo" && flow === "qualificar" && !product && SENT.includes(m.status)) product = "sistema";
      if (q && SENT.includes(m.status)) {
        if (!asked.includes(q)) asked.push(q);
        pending = q; // perguntar de novo (o lead respondeu "pode" em vez da resposta) reabre a pergunta
      }
      if (m.variant === OWNER_PREVIEW_VARIANT) {
        previewSentByOwner = true;
        previewPending = false;
      } else offeredPreview = /pr[eé]via/i.test(m.body);
      continue;
    }
    const mediaKind = MEDIA_BODY.exec(m.body)?.[1] as InboundMedia | undefined;
    const qualify = flow === "qualificar";
    // no meio do roteiro de perguntas, um "não" ou um "só eu" soltos são RESPOSTA; só a recusa de verdade encerra
    const answeringStep = qualify && !mediaKind && pending !== null && pending !== "tipo";
    let detected = detectTopics(mediaKind ? null : m.body, mediaKind ?? null, flow);
    if (answeringStep && !isRefusal(m.body) && detected.includes("not_interested")) {
      detected = detected.filter((t) => t !== "not_interested");
      if (detected.length === 0) detected = ["other"];
    }
    const words = norm(m.body).split(" ").filter(Boolean).length;
    // frase solta (não é pergunta nem pedido) logo depois de uma pergunta nossa é a resposta dela
    const looseSentence = detected.every((t) => t === "other" || t === "yes") && words >= 3;
    // "landing page" respondendo "landing, site ou sistema?" é resposta, mesmo com poucas palavras
    const typeAnswer = qualify && pending === "tipo" && !mediaKind && detectProduct(m.body) !== null;
    // uma resposta curta ("só eu", "uns 15 dias") vale; um "sim" solto só responde pergunta de sim ou não
    const stepAnswer =
      answeringStep &&
      !m.body.includes("?") &&
      !isRefusal(m.body) &&
      !ASKING.includes(detected[0]) &&
      // depois da página simples e da pergunta sobre a dor, repetir "não preciso de site" é recusar, não responder
      !(reframed && detected[0] === "no_need_site") &&
      (detected[0] !== "yes" || YES_NO_STEPS.includes(pending!));
    let list: Topic[] = pending && (looseSentence || typeAnswer || stepAnswer) ? ["answer"] : detected;
    if (qualify && !mediaKind) {
      // "pode" a uma abordagem antiga que oferecia a prévia é um pedido de prévia
      if (list.includes("yes") && offeredPreview && !list.includes("wants_preview")) list = [...list, "wants_preview"];
      const p = detectProduct(m.body);
      if (p && (!product || PRODUCT_RANK[p] > PRODUCT_RANK[product])) product = p;
      // a apresentação já falou de um site: um "pode", um "como funciona" ou a resposta a uma pergunta é interesse nele
      if (introSeen && !product && (list.includes("yes") || list.includes("how_works") || list[0] === "answer")) product = "site";
      // a primeira mensagem já traz o pedido por inteiro ("preciso de um sistema de agendamento para a clínica"): é o escopo
      if (isCustom(p) && !pending && !answers.escopo && words >= 6) answers.escopo = m.body.trim().slice(0, 300);
      if (list.includes("wants_preview")) {
        previewAsked = true;
        previewPending = true;
      }
    }
    if (pending && list[0] === "answer" && !answers[pending]) answers[pending] = m.body.trim().slice(0, 300);
    lastAnswered = pending && list[0] === "answer" ? pending : null;
    pending = null; // qualquer resposta do lead encerra a pergunta pendente
    for (const t of list) {
      if (!topics.has(t) && TOPIC_LABEL[t] && !["other", "thanks", "greeting", "optout", "audio", "media", "casual"].includes(t)) signals.push(TOPIC_LABEL[t]);
      topics.add(t);
      score += WEIGHT[t] ?? 0;
    }
    if (OWNER_SELF.test(norm(m.body))) ownerSelf = true;
    lastTopic = list[0];
  }

  // quem decide: só vale quando a recepção falou dele (ou se identificou como recepção): "me passa o telefone" de um dono é outra coisa
  const found = decisorFromTexts(inbound.filter((m) => !MEDIA_BODY.test(m.body)).map((m) => m.body));
  const decisor = found && (topics.has("gatekeeper") || found.staff) ? found : null;
  if (decisor && (decisor.name || decisor.phone)) signals.push(decisor.name ? `Indicou quem decide: ${decisor.name}` : "Indicou o contato de quem decide");

  const demoRows = input.demos.filter((d) => d.status === "published");
  const demo = {
    exists: demoRows.length > 0,
    sent: demoRows.some((d) => !!d.sentAt),
    views: demoRows.reduce((a, d) => a + d.views, 0),
  };
  const live = input.proposals.filter((p) => p.status !== "cancelled");
  const proposalRow = live.find((p) => p.status !== "draft") ?? live[0] ?? null;
  const proposal = proposalRow ? { status: proposalRow.status, amountCents: proposalRow.amountCents } : null;

  // Bloqueado: a conversa está bloqueada, ou a última coisa que ele escreveu foi o pedido para parar. Se o dono liberou o
  // número (conversa de volta a "active"), o pedido antigo no histórico não conta mais; só um PARE novo bloqueia de novo.
  const blocked = input.conversation?.status === "opted_out" || (lastTopic === "optout" && input.conversation?.status !== "active");
  const lost = input.lead.stage === "perdido" || topics.has("not_interested");
  const won = input.lead.stage === "ganho" || proposal?.status === "entry_paid" || proposal?.status === "paid";

  const phase: Phase = blocked
    ? "bloqueado"
    : won
      ? "fechado"
      : lost
        ? "perdido"
        : proposal
          ? "proposta"
          : demo.exists
            ? "previa"
            : inbound.length > 0
              ? "interesse"
              : "abertura";

  // depois que a prévia saiu, gostar ou aceitar vale muito: é a hora de fechar
  if ((demo.sent || previewSentByOwner) && (topics.has("compliment") || topics.has("yes"))) score += 2;
  if (proposal && !won) score += 3;
  const heat: Heat = blocked ? "bloqueado" : lost && !won ? "perdido" : won ? "quente" : heatOf(score);

  const last = msgs[msgs.length - 1];
  const awaitingUs = !!last && last.direction === "in";

  const qualify = flow === "qualificar";
  let nextAction: NextAction | null = null;
  if (phase === "bloqueado" || phase === "perdido" || phase === "fechado") nextAction = null;
  else if (lastTopic === "audio" && awaitingUs) nextAction = { kind: "ouvir_audio", label: "Ouvir o áudio e responder" };
  else if (decisor?.phone && awaitingUs) nextAction = { kind: "responder", label: `Aprovar na Fila a abertura para ${decisor.name ?? "quem decide"}` };
  else if (lastTopic === "paid") nextAction = proposal ? { kind: "marcar_sinal", label: "Conferir o Pix e marcar o sinal" } : { kind: "responder", label: "Conferir o Pix e responder" };
  else if (proposal?.status === "draft") nextAction = { kind: "enviar_proposta", label: "Enviar a proposta" };
  else if (proposal && (proposal.status === "sent" || proposal.status === "accepted")) nextAction = { kind: "marcar_sinal", label: "Marcar o sinal quando o Pix cair" };
  // fluxo "qualificar": o que sobra para o dono é a prévia que ele pediu, o orçamento do sistema e o fechamento do site
  else if (qualify && previewPending) nextAction = { kind: "fazer_previa", label: "Fazer a prévia que ele pediu e mandar o link" };
  else if (qualify && isCustom(product)) nextAction = { kind: "orcar_sistema", label: product === "automacao" ? "Analisar a automação e passar o valor" : "Analisar o sistema e passar o valor" };
  else if (lastTopic === "change_request" && awaitingUs) nextAction = { kind: "ajustar_previa", label: "Ajustar a prévia do jeito que pediram" };
  else if (lastTopic === "send_info" && awaitingUs) nextAction = { kind: "enviar_exemplos", label: "Enviar 2 ou 3 exemplos do seu portfólio" };
  else if ((demo.sent || previewSentByOwner) && heat === "quente" && !proposal) nextAction = { kind: "criar_proposta", label: "Criar a proposta (o lead está quente)" };
  else if (qualify && product === "site" && answers.objetivo && !proposal && heat !== "frio") nextAction = { kind: "criar_proposta", label: "Fechar o valor do site (ele quer um site)" };
  else if (qualify) nextAction = awaitingUs ? { kind: "responder", label: "Responder (revise o rascunho do agente)" } : { kind: "esperar", label: "Esperar a resposta do lead" };
  else if ((topics.has("yes") || topics.has("answer")) && !demo.exists) nextAction = { kind: "gerar_previa", label: "Gerar a prévia do site" };
  else if (demo.exists && !demo.sent) nextAction = { kind: "enviar_previa", label: "Enviar o link da prévia" };
  else if (awaitingUs) nextAction = { kind: "responder", label: "Responder (revise o rascunho do agente)" };
  else nextAction = { kind: "esperar", label: "Esperar a resposta do lead" };

  return {
    heat,
    phase,
    ...bantOf(topics, ownerSelf),
    signals,
    asked,
    answers,
    pending,
    lastTopic,
    lastAnswered,
    repliesFromLead: inbound.length,
    decisor,
    product,
    previewAsked,
    previewSentByOwner,
    previewPending,
    demo,
    proposal,
    nextAction,
  };
}

export const HEAT_LABEL: Record<Heat, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
  perdido: "Perdido",
  bloqueado: "Bloqueado",
};

export const PHASE_LABEL: Record<Phase, string> = {
  abertura: "Abordagem enviada",
  interesse: "Conversando",
  previa: "Prévia",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
  bloqueado: "Bloqueado",
};

export const BANT_LABEL: Record<Bant, string> = {
  sim: "Sim",
  talvez: "Talvez",
  nao: "Não",
  desconhecido: "Não sei ainda",
};
