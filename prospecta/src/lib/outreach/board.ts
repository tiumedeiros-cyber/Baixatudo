import { buildFicha } from "@/lib/agent/ficha";
import { parseAgentVariant } from "@/lib/agent/variant";
import { isCustom } from "@/lib/agent/discovery";
import type { Ficha, Heat, NextActionKind, Product } from "@/lib/agent/types";
import type { Repo } from "@/lib/repo/types";
import { isAutoReplyMessage } from "./autoreply";
import { previewOf } from "./preview";
import { loadRoster, ownerOf } from "./roster";
import type { Conversation, Message } from "./types";

/**
 * O quadro de conversas (Kanban): cada conversa cai em UMA raia, conforme quem precisa agir. As raias da esquerda são as
 * do dono (intervir, criar ou orçar, fechar o valor), depois o que está andando (sinal, agente, com você) e, no fim, o que
 * está parado (sem resposta, encerradas). A raia é calculada do estado da conversa e da ficha, sem coluna nova no banco.
 */

export type LaneId = "intervir" | "criar" | "fechar" | "sinal" | "agente" | "voce" | "sem_resposta" | "encerradas";

export interface LaneDef {
  id: LaneId;
  title: string;
  /** Uma frase que diz o que fazer com o que está na raia. */
  hint: string;
  tone: "danger" | "accent" | "warn" | "info" | "ghost";
  /** Raia que pede ação do dono: aparece em destaque e com o aviso quando está vazia. */
  mine: boolean;
}

export const LANES: LaneDef[] = [
  { id: "intervir", title: "Intervir", hint: "Dúvida, áudio ou algo que o agente não resolve. Responda você.", tone: "danger", mine: true },
  { id: "criar", title: "Criar ou orçar", hint: "Pediu prévia, sistema ou automação. O agente já levantou o que precisa.", tone: "accent", mine: true },
  { id: "fechar", title: "Fechar o valor", hint: "Quer o site e falta criar a proposta e mandar o Pix.", tone: "warn", mine: true },
  { id: "sinal", title: "Aguardando o sinal", hint: "Proposta enviada. Quando o Pix cair, marque no Financeiro.", tone: "info", mine: false },
  { id: "agente", title: "Com o agente", hint: "O agente está conversando e qualificando. Nada para você fazer.", tone: "ghost", mine: false },
  { id: "voce", title: "Com você", hint: "Você assumiu a conversa. O agente não escreve aqui.", tone: "ghost", mine: false },
  { id: "sem_resposta", title: "Sem resposta", hint: "Abordagem na fila ou enviada, e o lead ainda não respondeu.", tone: "ghost", mine: false },
  { id: "encerradas", title: "Encerradas", hint: "Sem interesse ou bloqueadas. Se voltarem a escrever, desbloqueie na conversa.", tone: "ghost", mine: false },
];

/** As raias em três faixas: o que é seu, o que está andando e o que está parado. Cada faixa vira uma linha do quadro. */
export const BANDS: { id: string; title: string; lanes: LaneId[] }[] = [
  { id: "sua_vez", title: "Sua vez", lanes: ["intervir", "criar", "fechar"] },
  { id: "andando", title: "Em andamento", lanes: ["sinal", "agente", "voce"] },
  { id: "parado", title: "Parado", lanes: ["sem_resposta", "encerradas"] },
];

/** Ações da ficha que são do dono e em qual raia elas caem quando a conversa está esperando por ele. */
const ACTION_LANE: Partial<Record<NextActionKind, LaneId>> = {
  fazer_previa: "criar",
  orcar_sistema: "criar",
  gerar_previa: "criar",
  enviar_previa: "criar",
  ajustar_previa: "criar",
  criar_proposta: "fechar",
  enviar_proposta: "fechar",
  marcar_sinal: "sinal",
};

/** A raia da conversa. Função pura: o mesmo estado dá sempre a mesma raia. */
export function laneOf(c: Pick<Conversation, "status" | "humanTakenOver" | "lastInboundAt">, ficha: (Pick<Ficha, "nextAction" | "proposal"> & Partial<Pick<Ficha, "lastTopic">>) | null): LaneId {
  if (c.status === "opted_out" || c.status === "closed") return "encerradas";
  if (!c.lastInboundAt) return "sem_resposta";
  if (c.status === "awaiting_human") {
    // "paguei": é com o dono agora (conferir o Pix na conta e começar o site), mesmo com a proposta na raia do sinal
    const settled = ficha?.proposal?.status === "entry_paid" || ficha?.proposal?.status === "paid";
    if (ficha?.lastTopic === "paid" && !settled) return "intervir";
    const action = ficha?.nextAction?.kind;
    return (action && ACTION_LANE[action]) || "intervir";
  }
  if (ficha?.proposal && (ficha.proposal.status === "sent" || ficha.proposal.status === "accepted")) return "sinal";
  return c.humanTakenOver ? "voce" : "agente";
}

export interface BoardCard {
  id: string;
  leadName: string;
  /** A última coisa dita, já com o prefixo de quem falou. */
  preview: string;
  /** Quando a conversa se mexeu pela última vez. */
  at: string;
  /** Desde quando está esperando por você (a última mensagem dele), nas raias do dono. */
  waitingSince: string | null;
  unread: number;
  heat: Heat | null;
  product: Product | null;
  /** O que fazer com este lead, em uma frase (da ficha). */
  action: string | null;
  /** O que ele respondeu de mais importante (o que precisa fazer, o objetivo), para ler sem abrir a conversa. */
  summary: string | null;
  /** Valor da proposta, na raia do sinal. */
  amountCents: number | null;
  humanTakenOver: boolean;
  /** O número de WhatsApp desta conversa (só com vários números e sem filtro por número). */
  numberName?: string | null;
}

export interface BoardLane extends LaneDef {
  cards: BoardCard[];
  total: number;
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** A frase que resume o pedido: o escopo do sistema, o objetivo do site ou o que ele disse querer. */
export function summaryLine(f: Pick<Ficha, "answers" | "product">): string | null {
  const a = f.answers;
  const first = isCustom(f.product) ? (a.escopo ?? a.dor ?? a.tipo) : (a.objetivo ?? a.tipo ?? a.material);
  return first ? clip(first, 110) : null;
}

/** O lead viu o portfólio ou o valor, não respondeu nem à cutucada: é com o dono. */
const STALLED_ACTION = "Sumiu depois do portfólio ou do valor: retome e feche à mão (Pix e conferência)";
const OWNER_FALLBACK = "Abrir a conversa e responder você mesmo";

/** O que o dono faz com este cartão. "Esperar" não serve numa raia dele: se a conversa pede você, o passo é abrir e responder. */
export function ownerAction(ficha: Pick<Ficha, "nextAction"> | null): string {
  const action = ficha?.nextAction;
  return action && action.kind !== "esperar" ? action.label : OWNER_FALLBACK;
}

const KEPT_OUT: Message["status"][] = ["draft", "cancelled", "failed"];
const MAX_CONVERSATIONS = 150;
/** Quantas conversas ativas montam a ficha completa (uma consulta cada). As demais caem na raia só pelo estado. */
const MAX_WITH_FICHA = 80;
const HISTORY_LIMIT = 120;

/**
 * Carrega as conversas e as distribui nas raias. O resumo de cada cartão sai de UMA consulta de mensagens recentes; só as
 * conversas ativas, com resposta do lead, pagam a consulta do histórico para montar a ficha.
 */
export async function loadConversationBoard(repo: Repo, opts: { accountId?: string | null } = {}): Promise<{ lanes: BoardLane[]; total: number }> {
  const settings = await repo.getSettings();
  const roster = await loadRoster(repo);
  const { rows, total } = await repo.listConversations({ limit: MAX_CONVERSATIONS, ...(opts.accountId ? { accountId: opts.accountId } : {}) });
  const [leads, proposals, recent] = await Promise.all([
    repo.getLeads(rows.map((c) => c.leadId)),
    repo.listProposals({ limit: 500 }),
    repo.listMessages({ order: "desc", limit: 600, ...(opts.accountId ? { accountId: opts.accountId } : {}) }),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const proposalsByLead = new Map<string, { status: string; amountCents: number }[]>();
  for (const p of proposals) proposalsByLead.set(p.leadId, [...(proposalsByLead.get(p.leadId) ?? []), { status: p.status, amountCents: p.amountCents }]);
  const previews = new Map<string, string>();
  for (const m of recent) {
    if (previews.has(m.conversationId)) continue;
    const text = previewOf(m);
    if (text !== null) previews.set(m.conversationId, text);
  }

  const lanes: BoardLane[] = LANES.map((l) => ({ ...l, cards: [], total: 0 }));
  const byId = new Map(lanes.map((l) => [l.id, l]));
  const active = rows.filter((c) => !!c.lastInboundAt && c.status !== "closed" && c.status !== "opted_out").slice(0, MAX_WITH_FICHA);
  const fichaFor = new Set(active.map((c) => c.id));

  const built = await Promise.all(
    rows.map(async (c) => {
      const lead = leadById.get(c.leadId);
      const preview = previews.get(c.id) ?? "Sem mensagens";
      let ficha: Ficha | null = null;
      let stalled = false;
      if (lead && fichaFor.has(c.id)) {
        const history = await repo.listMessages({ conversationId: c.id, order: "desc", limit: HISTORY_LIMIT });
        // a última coisa dita foi a cutucada do agente, e o lead não respondeu: a conversa veio para o dono fechar à mão
        const latest = history.find((m) => !KEPT_OUT.includes(m.status) && !isAutoReplyMessage(m));
        stalled = !!latest && latest.direction === "out" && parseAgentVariant(latest.variant)?.topic === "nudge";
        const messages = history.filter((m) => !KEPT_OUT.includes(m.status)).reverse();
        ficha = buildFicha({ lead, conversation: c, messages, demos: [], proposals: proposalsByLead.get(lead.id) ?? [], flow: settings.agentFlow });
      }
      const lane = laneOf(c, ficha);
      const proposal = ficha?.proposal ?? null;
      const card: BoardCard = {
        id: c.id,
        leadName: lead?.name ?? "Lead",
        preview: clip(preview, 140),
        at: c.lastInboundAt ?? c.lastOutboundAt ?? c.createdAt,
        waitingSince: byId.get(lane)?.mine ? c.lastInboundAt : null,
        unread: c.unread,
        heat: ficha ? ficha.heat : null,
        product: ficha?.product ?? null,
        action: byId.get(lane)?.mine ? (stalled ? STALLED_ACTION : ownerAction(ficha)) : null,
        summary: ficha ? summaryLine(ficha) : null,
        amountCents: lane === "sinal" && proposal ? proposal.amountCents : null,
        humanTakenOver: c.humanTakenOver,
        // com vários números, cada cartão diz de qual é (quando a tela já está filtrada por um número, não precisa repetir)
        numberName: roster.multi && !opts.accountId ? (ownerOf(roster, c.accountId)?.name ?? null) : null,
      };
      return { lane, card };
    }),
  );

  for (const { lane, card } of built) {
    const target = byId.get(lane)!;
    target.cards.push(card);
    target.total++;
  }
  for (const lane of lanes) {
    // nas raias do dono, quem espera há mais tempo vem primeiro; nas outras, o mais recente
    lane.cards.sort(lane.mine ? (a, b) => (a.waitingSince ?? a.at).localeCompare(b.waitingSince ?? b.at) : (a, b) => b.at.localeCompare(a.at));
  }
  return { lanes, total };
}
