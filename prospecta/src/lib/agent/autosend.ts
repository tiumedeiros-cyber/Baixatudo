import type { AutomationConfig } from "@/lib/outreach/config";
import { inWindow, nextOpening, startOfLocalDay } from "@/lib/outreach/guardrails";
import type { Message, MessageStatus } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { parseAgentVariant } from "./variant";

/** Estados de uma resposta que saiu (ou vai sair) sem o dono aprovar. Cancelada, falha e rascunho não contam. */
const COUNTED: MessageStatus[] = ["approved", "sending", "sent", "delivered", "read", "simulated"];

export const isAutoReply = (m: Pick<Message, "variant" | "kind" | "direction">): boolean =>
  m.direction === "out" && m.kind === "reply" && !!parseAgentVariant(m.variant)?.auto;

/** Quantas respostas o agente já mandou sozinho nesta conversa e hoje (fuso configurado). */
export async function countAutoReplies(
  repo: Repo,
  conversationId: string,
  now: Date,
  cfg: AutomationConfig,
): Promise<{ inConversation: number; today: number }> {
  const all = (await repo.listMessages({ kinds: ["reply"], direction: "out", statuses: COUNTED, order: "desc", limit: 1000 })).filter(isAutoReply);
  const dayStart = startOfLocalDay(now, cfg).getTime();
  return {
    inConversation: all.filter((m) => m.conversationId === conversationId).length,
    today: all.filter((m) => Date.parse(m.createdAt) >= dayStart).length,
  };
}

/**
 * Quando a resposta automática sai: um tempo de gente (20 a 90 s) e, se cair fora do horário permitido, na
 * próxima janela. Responder 3 da manhã em 20 segundos denuncia que é robô; esperar a manhã não.
 */
export function scheduleAutoReply(now: Date, cfg: AutomationConfig, rng: () => number): Date {
  const base = new Date(now.getTime() + 20_000 + Math.round(rng() * 70_000));
  if (inWindow(base, cfg)) return base;
  return new Date(nextOpening(base, cfg).getTime() + Math.round(rng() * 5 * 60_000));
}
