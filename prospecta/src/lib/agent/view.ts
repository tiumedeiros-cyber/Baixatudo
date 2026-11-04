import type { Lead } from "@/lib/leads/types";
import type { InboundMedia } from "@/lib/outreach/classify";
import { classifyReply } from "@/lib/outreach/classify";
import { lastLeadMessage } from "@/lib/outreach/last-inbound";
import type { Conversation } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { loadAgentContext } from "./context";
import { buildFicha } from "./ficha";
import { rulesReply } from "./rules";
import type { Ficha, Handoff, NextAction, Topic } from "./types";

const MEDIA_BODY = /^\((audio|image|video|document|sticker|contact|location)\)$/;

export interface AgentView {
  ficha: Ficha;
  /** Assunto da última mensagem do lead. */
  topic: Topic | null;
  /** O que o agente pede que o dono confira (calculado pelas regras, que são fixas e baratas). */
  handoff: Handoff;
  nextAction: NextAction | null;
}

/** Tudo que a tela da conversa mostra do agente: a ficha, o assunto, o aviso e o próximo passo. */
export async function loadAgentView(repo: Repo, conv: Conversation, lead: Lead): Promise<AgentView> {
  const last = await lastLeadMessage(repo, conv.id);
  if (!last) {
    const [messages, demos, proposals] = await Promise.all([
      repo.listMessages({ conversationId: conv.id, order: "asc", limit: 80 }),
      repo.listDemos({ leadId: lead.id, limit: 20 }),
      repo.listProposals({ leadId: lead.id, limit: 20 }),
    ]);
    const ficha = buildFicha({ lead, conversation: conv, messages, demos, proposals });
    return { ficha, topic: null, handoff: { needed: false, reason: null }, nextAction: ficha.nextAction };
  }
  const media = (MEDIA_BODY.exec(last.body)?.[1] as InboundMedia | undefined) ?? null;
  const text = media ? null : last.body;
  const ctx = await loadAgentContext(repo, conv, lead, { text, media, intent: last.intent ?? classifyReply(text, media).intent });
  const out = rulesReply(ctx);
  return { ficha: ctx.ficha, topic: out.topic, handoff: out.handoff, nextAction: out.nextAction };
}
