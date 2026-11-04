import { startOfLocalDay } from "@/lib/outreach/guardrails";
import { lastLeadMessage } from "@/lib/outreach/last-inbound";
import type { Message } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { isAutoReply } from "./autosend";
import { buildFicha } from "./ficha";
import { parseAgentVariant } from "./variant";
import { TOPIC_LABEL, type NextActionKind, type Product, type Topic } from "./types";

/** O que o dono confere "no final do dia": o que o agente fez sozinho e o que ficou para ele. */
export interface AutoReplyRow {
  id: string;
  conversationId: string;
  leadId: string;
  leadName: string;
  topic: string;
  topicLabel: string;
  source: "rules" | "ai";
  body: string;
  at: string;
  status: Message["status"];
}

export interface NeedsYouRow {
  conversationId: string;
  leadId: string;
  leadName: string;
  /** A última coisa que o lead escreveu. */
  preview: string;
  at: string;
  /** O que fazer com este lead (da ficha): fazer a prévia, orçar o sistema, fechar o valor... */
  action: { kind: NextActionKind; label: string } | null;
  /** O que ele quer comprar, se a conversa já mostrou. */
  product: Product | null;
  /** Em ordem de importância para a fila do dono: prévia pedida e sistema primeiro, depois fechar o valor. */
  priority: number;
}

export interface AgentReport {
  autoToday: number;
  /** Aprovadas pelo agente e ainda esperando a hora de sair. */
  autoWaiting: number;
  recent: AutoReplyRow[];
  needYou: NeedsYouRow[];
  stages: { respondeu: number; proposta: number; ganho: number; perdido: number };
}

const MEDIA = /^\((audio|image|video|document|sticker|contact|location)\)$/;
const KEPT_OUT: Message["status"][] = ["draft", "cancelled", "failed"];

/** Fila do dono: o que é dinheiro na mesa vem antes do resto. */
const PRIORITY: Partial<Record<NextActionKind, number>> = {
  fazer_previa: 0,
  orcar_sistema: 1,
  criar_proposta: 2,
  marcar_sinal: 3,
  enviar_proposta: 3,
  enviar_exemplos: 4,
  ajustar_previa: 4,
  ouvir_audio: 5,
};

export async function buildAgentReport(repo: Repo, now: Date): Promise<AgentReport> {
  const settings = await repo.getSettings();
  const dayStart = startOfLocalDay(now, settings.automation).getTime();

  const outs = await repo.listMessages({
    kinds: ["reply"],
    direction: "out",
    statuses: ["approved", "sending", "sent", "delivered", "read", "simulated"],
    order: "desc",
    limit: 500,
  });
  const auto = outs.filter(isAutoReply);
  const recentRaw = auto.slice(0, 12);
  const leads = new Map((await repo.getLeads([...new Set(recentRaw.map((m) => m.leadId))])).map((l) => [l.id, l]));

  const recent: AutoReplyRow[] = recentRaw.map((m) => {
    const v = parseAgentVariant(m.variant);
    const topic = v?.topic ?? "other";
    return {
      id: m.id,
      conversationId: m.conversationId,
      leadId: m.leadId,
      leadName: leads.get(m.leadId)?.name ?? "Lead",
      topic,
      topicLabel: TOPIC_LABEL[topic as Topic] ?? topic,
      source: v?.source ?? "rules",
      body: m.body,
      at: m.sentAt ?? m.scheduledFor ?? m.createdAt,
      status: m.status,
    };
  });

  const { rows } = await repo.listConversations({ statuses: ["awaiting_human"], limit: 20 });
  const needLeads = new Map((await repo.getLeads(rows.map((c) => c.leadId))).map((l) => [l.id, l]));
  const needYou: NeedsYouRow[] = [];
  for (const c of rows) {
    const lead = needLeads.get(c.leadId);
    const last = await lastLeadMessage(repo, c.id);
    // a ficha diz o que fazer com este lead (só da conversa, sem coluna nova)
    let action: NeedsYouRow["action"] = null;
    let product: Product | null = null;
    if (lead) {
      const recentMsgs = await repo.listMessages({ conversationId: c.id, order: "desc", limit: 80 });
      const messages = recentMsgs.filter((m) => !KEPT_OUT.includes(m.status)).reverse();
      const [demos, proposals] = await Promise.all([repo.listDemos({ leadId: lead.id, limit: 20 }), repo.listProposals({ leadId: lead.id, limit: 20 })]);
      const ficha = buildFicha({ lead, conversation: c, messages, demos, proposals, flow: settings.agentFlow });
      action = ficha.nextAction;
      product = ficha.product;
    }
    needYou.push({
      conversationId: c.id,
      leadId: c.leadId,
      leadName: lead?.name ?? "Lead",
      preview: last ? (MEDIA.test(last.body) ? `(${last.body.slice(1, -1)})` : last.body) : "",
      at: c.lastInboundAt ?? c.updatedAt,
      action,
      product,
      priority: action ? (PRIORITY[action.kind] ?? 6) : 6,
    });
  }
  // prévia pedida e sistema na frente; dentro de cada grupo, o mais antigo primeiro (quem espera há mais tempo)
  needYou.sort((a, b) => a.priority - b.priority || a.at.localeCompare(b.at));

  const { stages } = await repo.stats();
  return {
    autoToday: auto.filter((m) => Date.parse(m.createdAt) >= dayStart).length,
    autoWaiting: auto.filter((m) => m.status === "approved" || m.status === "sending").length,
    recent,
    needYou,
    stages: { respondeu: stages.respondeu, proposta: stages.proposta, ganho: stages.ganho, perdido: stages.perdido },
  };
}
