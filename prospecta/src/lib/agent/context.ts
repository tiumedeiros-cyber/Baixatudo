import type { Lead, Settings, WebsiteKind } from "@/lib/leads/types";
import type { InboundMedia } from "@/lib/outreach/classify";
import { classifyReply } from "@/lib/outreach/classify";
import type { Conversation, Message } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { buildFicha } from "./ficha";
import type { AgentContext, AgentFacts, AgentProposal } from "./types";

/** Os fatos que o agente pode afirmar, tirados das Configurações do dono. */
export function factsFromSettings(s: Settings): AgentFacts {
  return {
    flow: s.agentFlow,
    senderName: s.senderName,
    brandName: s.brandName,
    senderFullName: s.senderFullName,
    senderRole: s.senderRole,
    priceFrom: s.ticketAverage,
    deliveryDays: s.deliveryDays,
    entryPct: s.entryPct,
    pixKey: s.pixKey,
    pixHolder: s.pixHolder,
    contactPhone: s.contactPhone,
    offer: s.offer,
    audience: s.audience,
    proof: s.proof,
    policies: {
      guarantee: s.policyGuarantee.trim(),
      hosting: s.policyHosting.trim(),
      payment: s.policyPayment.trim(),
      portfolio: s.policyPortfolio.trim(),
      price: s.policyPrice.trim(),
    },
  };
}

const KEPT: Message["status"][] = ["draft", "cancelled", "failed"];

/**
 * Junta tudo que o agente precisa para responder uma mensagem: o lead, a conversa, a prévia e a proposta.
 * `inbound` é a mensagem do lead que está sendo respondida (já gravada na conversa).
 */
export async function loadAgentContext(
  repo: Repo,
  conv: Conversation,
  lead: Lead,
  inbound: AgentContext["inbound"],
  opts: {
    publicBaseUrl?: string | null;
    /** Mensagens que o agente vai cancelar e refazer (resposta ainda na fila): não contam como ditas. */
    exclude?: ReadonlySet<string>;
  } = {},
): Promise<AgentContext> {
  const [settings, recent, demos, proposals] = await Promise.all([
    repo.getSettings(),
    repo.listMessages({ conversationId: conv.id, order: "desc", limit: 80 }),
    repo.listDemos({ leadId: lead.id, limit: 20 }),
    repo.listProposals({ leadId: lead.id, limit: 20 }),
  ]);
  const messages = recent.filter((m) => !KEPT.includes(m.status) && !opts.exclude?.has(m.id)).reverse();

  const ficha = buildFicha({ lead, conversation: conv, messages, demos, proposals, flow: settings.agentFlow });

  const live = demos.find((d) => d.status === "published");
  const demoUrl = live && opts.publicBaseUrl ? `${opts.publicBaseUrl.replace(/\/+$/, "")}/p/${live.slug}` : null;

  const row = proposals.filter((p) => p.status !== "cancelled").find((p) => p.status !== "draft") ?? proposals.find((p) => p.status !== "cancelled");
  const proposal: AgentProposal | null = row
    ? { status: row.status, title: row.title, amountCents: row.amountCents, entryPct: row.entryPct, deliveryDays: row.deliveryDays }
    : null;

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      neighborhood: lead.neighborhood,
      city: lead.city,
      category: lead.category,
      niche: lead.niche,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      websiteKind: lead.websiteKind,
    },
    messages,
    inbound,
    facts: factsFromSettings(settings),
    demoUrl,
    proposal,
    ficha,
  };
}

// ───────────────────────── contexto de mentira (testes e simulador) ─────────────────────────

export interface FakeTurn {
  from: "lead" | "us";
  text: string;
  /** Variante gravada na mensagem (ex.: "agente:q-objetivo" para uma pergunta de descoberta). */
  variant?: string;
}

export interface SimulationInput {
  text: string | null;
  media?: InboundMedia | null;
  websiteKind?: WebsiteKind;
  name?: string;
  history?: FakeTurn[];
  demoSent?: boolean;
  demoUrl?: string | null;
  proposal?: AgentProposal | null;
  facts?: Partial<AgentFacts>;
  stage?: Lead["stage"];
}

// O gabarito original (e o simulador sem configuração) usa o fluxo com prévia; o fluxo "qualificar" entra por `facts: { flow }`.
const BASE_FACTS: AgentFacts = {
  flow: "previa",
  senderName: "Jonathan",
  brandName: "Kelvin Studio",
  senderFullName: "Jonathan Kelvin",
  senderRole: "desenvolvedor de sites",
  priceFrom: 800,
  deliveryDays: 7,
  entryPct: 50,
  pixKey: "",
  pixHolder: "",
  contactPhone: "",
  offer: "",
  audience: "",
  proof: "",
  policies: { guarantee: "", hosting: "", payment: "", portfolio: "", price: "" },
};

function fakeMessage(i: number, turn: FakeTurn & { media?: InboundMedia | null }, now: number): Message {
  const incoming = turn.from === "lead";
  const at = new Date(now - (1000 - i) * 60_000).toISOString();
  return {
    id: `fake-${i}`,
    conversationId: "fake-conv",
    leadId: "sim-lead-0001",
    accountId: null,
    direction: incoming ? "in" : "out",
    kind: incoming ? "reply" : i === 0 ? "opening" : "reply",
    step: 0,
    // o motor grava mídia como "(audio)", "(image)"...
    body: incoming && turn.media ? `(${turn.media})` : turn.text,
    status: incoming ? "received" : "sent",
    variant: turn.variant ?? null,
    intent: null,
    scheduledFor: null,
    approvedAt: null,
    sentAt: at,
    providerMessageId: null,
    attempts: 0,
    error: null,
    createdBy: incoming ? "lead" : "system",
    batchDay: null,
    createdAt: at,
  };
}

/**
 * Monta um contexto sem banco: serve para os testes e para o simulador da tela do agente. O histórico
 * termina sempre na mensagem do lead que está sendo respondida.
 */
export function simulationContext(input: SimulationInput): AgentContext {
  const now = Date.UTC(2026, 9, 23, 15, 0, 0);
  const history: (FakeTurn & { media?: InboundMedia | null })[] = [
    ...(input.history ?? [{ from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio." }]),
    { from: "lead", text: input.text ?? "", media: input.media ?? null },
  ];
  const messages = history.map((t, i) => fakeMessage(i, t, now));
  const websiteKind = input.websiteKind ?? "none";
  const facts: AgentFacts = { ...BASE_FACTS, ...input.facts };
  // só existe prévia quando o cenário diz que existe (enviada, ou pelo menos com link)
  const demos =
    input.demoSent || input.demoUrl
      ? [{ status: "published", sentAt: input.demoSent ? new Date(now).toISOString() : null, views: input.demoSent ? 1 : 0 }]
      : [];
  const proposal = input.proposal ?? null;

  const ficha = buildFicha({
    lead: { stage: input.stage ?? "respondeu" },
    conversation: { status: "awaiting_human" },
    messages,
    demos,
    proposals: proposal ? [{ status: proposal.status, amountCents: proposal.amountCents }] : [],
    flow: facts.flow,
  });

  return {
    lead: {
      id: "sim-lead-0001",
      name: input.name ?? "Clínica Valéria Sousa",
      neighborhood: "Siqueira",
      city: "Fortaleza",
      category: "Spa de saúde",
      niche: "Estética",
      rating: 4.9,
      reviewsCount: 126,
      websiteKind,
    },
    messages,
    inbound: { text: input.text, media: input.media ?? null, intent: classifyReply(input.text, input.media ?? null).intent },
    facts,
    demoUrl: input.demoUrl ?? null,
    proposal,
    ficha,
  };
}
