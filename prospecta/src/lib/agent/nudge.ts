import { isAutoReplyMessage } from "@/lib/outreach/autoreply";
import type { AutomationConfig } from "@/lib/outreach/config";
import { inWindow } from "@/lib/outreach/guardrails";
import type { Message } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { madeClosingOffer } from "./autonomy";
import { countAutoReplies, isAutoReply, scheduleAutoReply } from "./autosend";
import { portfolioSent, portfolioUrl } from "./portfolio";
import { parseAgentVariant } from "./variant";

/**
 * Cutucada depois do silêncio. O lead conversou, viu o portfólio ou o valor (ou recebeu o Pix) e sumiu. Passadas algumas
 * horas o agente puxa a conversa UMA vez ("Conseguiu dar uma olhada nos trabalhos?"). Se mesmo assim ninguém responder em um
 * dia, a conversa vem para o dono fechar à mão (receber o Pix, conferir, combinar o início). Só roda com "Pode fechar sozinho"
 * ligado, só dentro dos horários de envio e dentro dos tetos do agente; uma cutucada por conversa, nunca mais.
 */

export const NUDGE_VARIANT = "agente+auto:nudge";
/** Quanto tempo de silêncio depois da nossa última mensagem antes de cutucar. */
export const NUDGE_AFTER_MS = 4 * 3_600_000;
/** Quanto tempo depois da cutucada, ainda sem resposta, a conversa vai para o dono. */
export const HAND_TO_OWNER_AFTER_MS = 24 * 3_600_000;
/** Quantas conversas por varredura (a varredura roda no máximo a cada 5 minutos). */
export const MAX_NUDGES_PER_SCAN = 3;
const SCAN_EVERY_MS = 5 * 60_000;

export type NudgeKind = "portfolio" | "offer" | "pix";

export function nudgeText(kind: NudgeKind): string {
  switch (kind) {
    case "portfolio":
      return "Conseguiu dar uma olhada nos trabalhos? Se fizer sentido, me avisa que a gente já combina o início do projeto.";
    case "offer":
      return "Ficou alguma dúvida sobre o valor? Se estiver tudo certo, me avisa que já te passo os dados para começarmos.";
    case "pix":
      return "Conseguiu fazer o Pix do sinal? Se precisar de ajuda com isso, é só me falar.";
  }
}

const isNudge = (m: Pick<Message, "variant" | "direction">) => m.direction === "out" && parseAgentVariant(m.variant)?.topic === "nudge";

const SENT: Message["status"][] = ["sent", "delivered", "read"];

export interface NudgeResult {
  nudged: number;
  handedToOwner: number;
}

const lastScan = new WeakMap<Repo, number>();

/**
 * Varre as conversas ativas e cutuca quem sumiu depois do portfólio, do valor ou do Pix. `force` ignora o intervalo entre
 * varreduras (os testes e o botão manual). Nunca lança: uma falha aqui não pode atrapalhar o envio.
 */
export async function runNudges(
  repo: Repo,
  now: Date,
  cfg: AutomationConfig,
  rng: () => number,
  opts: { force?: boolean; max?: number } = {},
): Promise<NudgeResult> {
  const result: NudgeResult = { nudged: 0, handedToOwner: 0 };
  if (cfg.autonomy !== "semi" || !cfg.autoClose || cfg.paused || !inWindow(now, cfg)) return result;
  const last = lastScan.get(repo) ?? 0;
  if (!opts.force && now.getTime() - last < SCAN_EVERY_MS) return result;
  lastScan.set(repo, now.getTime());

  try {
    const settings = await repo.getSettings();
    const url = portfolioUrl(settings.policyPortfolio);
    const max = opts.max ?? MAX_NUDGES_PER_SCAN;
    const { rows } = await repo.listConversations({ statuses: ["active"], limit: 200 });

    for (const conv of rows) {
      if (!conv.lastInboundAt || conv.humanTakenOver) continue;
      const recent = await repo.listMessages({ conversationId: conv.id, order: "desc", limit: 40 });
      const msgs = recent.filter((m) => !["draft", "cancelled", "failed"].includes(m.status) && !isAutoReplyMessage(m)).reverse();
      const lastMsg = msgs.at(-1);
      if (!lastMsg || lastMsg.direction !== "out" || !SENT.includes(lastMsg.status)) continue;
      const age = now.getTime() - Date.parse(lastMsg.sentAt ?? lastMsg.createdAt);

      // a cutucada não respondida há um dia: a conversa é do dono
      if (isNudge(lastMsg)) {
        if (age >= HAND_TO_OWNER_AFTER_MS) {
          const lead = await repo.getLead(conv.leadId);
          await repo.updateConversation(conv.id, { status: "awaiting_human" });
          await repo.addEvents([{ leadId: conv.leadId, type: "automacao", payload: { text: `${lead?.name ?? "O lead"} não respondeu à cutucada: a conversa veio para você fechar à mão` } }]);
          result.handedToOwner++;
        }
        continue;
      }

      if (result.nudged >= max) continue;
      if (age < NUDGE_AFTER_MS) continue;
      if (lastMsg.kind !== "reply" || lastMsg.createdBy !== "system" || !isAutoReply(lastMsg)) continue;
      if (msgs.some(isNudge)) continue; // uma cutucada por conversa, nunca mais
      if (msgs.filter((m) => m.direction === "in").length < 2) continue; // só quem de fato conversou

      const lead = await repo.getLead(conv.leadId);
      if (!lead || lead.stage === "ganho" || lead.stage === "perdido") continue;
      const proposals = await repo.listProposals({ leadId: lead.id, limit: 5 });
      if (proposals.some((p) => ["accepted", "entry_paid", "paid"].includes(p.status))) continue; // já fechou: nada a cutucar
      const kind: NudgeKind | null = proposals.some((p) => p.status === "sent")
        ? "pix"
        : madeClosingOffer(msgs)
          ? "offer"
          : url && portfolioSent(msgs, url)
            ? "portfolio"
            : null;
      if (!kind) continue;

      const counts = await countAutoReplies(repo, conv.id, now, cfg);
      if (counts.inConversation >= cfg.autoMaxPerConversation || counts.today >= cfg.autoMaxPerDay) continue;

      await repo.createMessages([
        {
          conversationId: conv.id,
          leadId: lead.id,
          direction: "out",
          kind: "reply",
          body: nudgeText(kind),
          status: "approved",
          variant: NUDGE_VARIANT,
          createdBy: "system",
          approvedAt: now.toISOString(),
          scheduledFor: scheduleAutoReply(now, cfg, rng).toISOString(),
        },
      ]);
      await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente cutucou ${lead.name} depois do silêncio (${kind === "pix" ? "Pix" : kind === "offer" ? "valor" : "portfólio"})` } }]);
      result.nudged++;
    }
  } catch (error) {
    console.error("cutucada:", error);
  }
  return result;
}
