import type { Repo } from "@/lib/repo/types";
import { AUTO_REPLY_LABEL, AUTO_REPLY_VARIANT, arrivedFast, detectAutoReply, isAutoReplyMessage } from "./autoreply";
import type { Message } from "./types";

/**
 * Conversas antigas em que quem "respondeu" foi um robô (saudação do WhatsApp Business, menu, aviso de ausência). Antes de o
 * motor reconhecer robô (história 6.6) essas mensagens entravam como resposta de verdade: a conversa ia para "Precisa de você",
 * a etapa virava "Respondeu" e o agente escrevia um rascunho para o robô. Aqui a gente conserta o que já está gravado, do mesmo
 * jeito que o motor trata hoje: marca a mensagem como resposta automática e devolve a conversa a "sem resposta".
 *
 * Nada é apagado: o texto do robô fica gravado (só ganha a marca) e o rascunho do agente vira "cancelado". Só mexe em conversa
 * onde TODA mensagem recebida é de robô e o dono ainda não escreveu nada à mão: se uma pessoa de verdade falou, ou se o dono já
 * respondeu, a conversa fica como está. O que o agente já mandou ao robô não tem como desfazer; entra no relatório.
 */

export interface RobotConversation {
  conversationId: string;
  leadId: string;
  leadName: string;
  /** Mensagens do robô que vão ganhar a marca. */
  robotMessages: number;
  /** Rascunhos e respostas aprovadas, ainda não enviadas, escritas para o robô: viram "cancelado". */
  unsentReplies: number;
  /** Respostas que o agente já tinha enviado ao robô (não dá para desfazer). */
  sentReplies: number;
  /** Primeira linha do que o robô disse, para o dono reconhecer. */
  sample: string;
  kind: string;
  /** A etapa volta de "Respondeu" para "Contatado" quando era essa. */
  resetsStage: boolean;
}

const UNSENT: Message["status"][] = ["draft", "approved"];
const SENT: Message["status"][] = ["sent", "delivered", "read", "simulated"];
const MAX_CONVERSATIONS = 500;

const firstLine = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 110 ? `${t.slice(0, 109).trimEnd()}…` : t;
};

/**
 * A mensagem recebida chegou em segundos depois de uma abordagem nossa e ainda não havia resposta de pessoa: é o mesmo critério
 * do motor (`fast`), refeito sobre o histórico gravado.
 */
function arrivedAfterOutreach(messages: Message[], m: Message): boolean {
  const at = m.sentAt ?? m.createdAt;
  return messages.some((o) => o.direction === "out" && (o.kind === "opening" || o.kind === "followup") && SENT.includes(o.status) && !!o.sentAt && arrivedFast(at, o.sentAt));
}

/** A resposta é de robô? Texto e velocidade juntos, como no motor. */
function isRobotText(messages: Message[], m: Message): boolean {
  return detectAutoReply(m.body, { fast: arrivedAfterOutreach(messages, m) }).auto;
}

/** As conversas que dá para consertar, sem mexer em nada. */
export async function findRobotConversations(repo: Repo): Promise<RobotConversation[]> {
  const { rows } = await repo.listConversations({ statuses: ["active", "awaiting_human"], limit: MAX_CONVERSATIONS });
  const candidates = rows.filter((c) => !!c.lastInboundAt && !c.humanTakenOver);
  if (candidates.length === 0) return [];
  const leads = new Map((await repo.getLeads(candidates.map((c) => c.leadId))).map((l) => [l.id, l]));

  const found: RobotConversation[] = [];
  for (const c of candidates) {
    const messages = await repo.listMessages({ conversationId: c.id, order: "asc", limit: 300 });
    const received = messages.filter((m) => m.direction === "in" && m.status === "received" && !isAutoReplyMessage(m));
    const robots = received.filter((m) => !/^\((audio|image|video|document|sticker|contact|location)\)$/.test(m.body) && isRobotText(messages, m));
    // uma pessoa de verdade falou (ou mandou mídia): a conversa é de verdade
    if (robots.length === 0 || robots.length !== received.length) continue;
    // o dono já respondeu à mão depois do robô: ele decidiu seguir, não mexemos
    if (messages.some((m) => m.direction === "out" && m.createdBy === "user" && SENT.includes(m.status))) continue;

    const agentReplies = messages.filter((m) => m.direction === "out" && m.kind === "reply" && m.createdBy === "system");
    const lead = leads.get(c.leadId);
    const check = detectAutoReply(robots[0].body, { fast: arrivedAfterOutreach(messages, robots[0]) });
    found.push({
      conversationId: c.id,
      leadId: c.leadId,
      leadName: lead?.name ?? "Lead",
      robotMessages: robots.length,
      unsentReplies: agentReplies.filter((m) => UNSENT.includes(m.status)).length,
      sentReplies: agentReplies.filter((m) => SENT.includes(m.status)).length,
      sample: firstLine(robots[0].body),
      kind: check.kind ? AUTO_REPLY_LABEL[check.kind] : "Resposta automática",
      resetsStage: lead?.stage === "respondeu",
    });
  }
  return found;
}

export interface RobotCleanupResult {
  fixed: number;
  messagesMarked: number;
  repliesCancelled: number;
  items: RobotConversation[];
}

/** Conserta as conversas de `findRobotConversations` (ou só as de `onlyIds`). Pode rodar de novo sem efeito: o que já foi consertado não aparece mais. */
export async function cleanRobotConversations(repo: Repo, onlyIds?: string[]): Promise<RobotCleanupResult> {
  const all = await findRobotConversations(repo);
  const items = onlyIds ? all.filter((i) => onlyIds.includes(i.conversationId)) : all;
  let messagesMarked = 0;
  let repliesCancelled = 0;

  for (const item of items) {
    const messages = await repo.listMessages({ conversationId: item.conversationId, order: "asc", limit: 300 });
    for (const m of messages) {
      if (m.direction !== "in" || m.status !== "received" || isAutoReplyMessage(m) || !isRobotText(messages, m)) continue;
      await repo.updateMessage(m.id, { variant: AUTO_REPLY_VARIANT, intent: "other" });
      messagesMarked++;
    }
    const unsent = messages.filter((m) => m.direction === "out" && m.kind === "reply" && m.createdBy === "system" && UNSENT.includes(m.status));
    repliesCancelled += await repo.bulkUpdateMessages(
      unsent.map((m) => m.id),
      UNSENT,
      { status: "cancelled", error: "resposta a um robô: cancelada na correção" },
    );
    await repo.updateConversation(item.conversationId, { status: "active", lastInboundAt: null, unread: 0 });
    const events: Parameters<Repo["addEvents"]>[0] = [
      { leadId: item.leadId, type: "automacao", payload: { text: `${item.leadName}: a resposta era de um robô (${item.kind.toLowerCase()}); a conversa voltou a "sem resposta"` } },
    ];
    if (item.resetsStage) {
      await repo.setStage(item.leadId, "contatado");
      events.push({ leadId: item.leadId, type: "etapa", payload: { name: item.leadName, from: "respondeu", to: "contatado" } });
    }
    await repo.addEvents(events);
  }
  return { fixed: items.length, messagesMarked, repliesCancelled, items };
}
