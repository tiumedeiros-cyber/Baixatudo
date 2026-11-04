import { madeClosingOffer } from "@/lib/agent/autonomy";
import { askedQuestion, parseAgentVariant } from "@/lib/agent/variant";
import type { Lead } from "@/lib/leads/types";
import type { Repo } from "@/lib/repo/types";
import { isAutoReplyMessage } from "./autoreply";
import { variantLabel } from "./metrics";
import { stripStyle } from "./style";
import type { Message } from "./types";

/**
 * O funil do agente, passo a passo, para saber ONDE a conversa esfria antes de mexer em texto. Tudo sai do que já está gravado
 * (mensagens, variantes e etapa do lead): nada novo no banco. Cada passo conta conversas, e "uma pessoa respondeu" não conta robô
 * (a resposta automática do negócio fica de fora, como no resto do painel).
 */

const SENT: Message["status"][] = ["sent", "delivered", "read"];
/** Quem escreveu até 20 s depois da nossa mensagem ainda não respondeu a ela: respondeu ao que veio antes. */
const GRACE_MS = 20_000;

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  /** Quanto do passo anterior chegou aqui (0 a 1). Nulo no primeiro passo e quando o passo tem mais conversas que o anterior. */
  ofPrev: number | null;
  /**
   * Tem mais conversas aqui que no passo anterior: chegaram por outro caminho (os roteiros de antes do atual pulavam a apresentação).
   * Um percentual maior que 100% só confunde, então fica sem percentual.
   */
  outOfOrder: boolean;
  /** Quanto das aberturas chegou aqui (0 a 1). */
  ofStart: number | null;
}

export interface FunnelGroup {
  key: string;
  label: string;
  sent: number;
  people: number;
  presented: number;
  afterPresentation: number;
}

export interface FunnelReport {
  days: number;
  sent: number;
  steps: FunnelStep[];
  byAngle: FunnelGroup[];
  byNiche: FunnelGroup[];
  /** Onde se perdeu: nunca respondeu, só o robô respondeu, uma pessoa respondeu mas calou depois da apresentação. */
  lost: { silent: number; botOnly: number; stoppedAfterPresentation: number };
}

const at = (m: Message): number => Date.parse(m.sentAt ?? m.createdAt);

export function computeFunnel(messages: Message[], leads: Map<string, Pick<Lead, "stage" | "niche">>, now: Date, days = 30): FunnelReport {
  const since = now.getTime() - days * 86_400_000;
  const byConv = new Map<string, Message[]>();
  for (const m of messages) byConv.set(m.conversationId, [...(byConv.get(m.conversationId) ?? []), m]);

  const count = { sent: 0, answered: 0, person: 0, presented: 0, afterPresentation: 0, solution: 0, goal: 0, offer: 0, proposal: 0, won: 0 };
  const lost = { silent: 0, botOnly: 0, stoppedAfterPresentation: 0 };
  const angles = new Map<string, FunnelGroup>();
  const niches = new Map<string, FunnelGroup>();
  const group = (map: Map<string, FunnelGroup>, key: string, label: string): FunnelGroup => {
    const g = map.get(key) ?? { key, label, sent: 0, people: 0, presented: 0, afterPresentation: 0 };
    map.set(key, g);
    return g;
  };

  for (const msgs of byConv.values()) {
    const sorted = [...msgs].sort((a, b) => at(a) - at(b));
    const opening = sorted.find((m) => m.direction === "out" && m.kind === "opening" && SENT.includes(m.status) && at(m) >= since);
    if (!opening) continue;
    const opened = at(opening);
    const inbound = sorted.filter((m) => m.direction === "in" && at(m) >= opened);
    const people = inbound.filter((m) => !isAutoReplyMessage(m));
    const presentedMsg = sorted.find((m) => m.direction === "out" && SENT.includes(m.status) && ["apresentacao", "no_need_site"].includes(parseAgentVariant(m.variant)?.topic ?? ""));
    const solutionMsg = sorted.find((m) => m.direction === "out" && SENT.includes(m.status) && askedQuestion(m.variant) === "objetivo");
    const wroteAfter = (m: Message | undefined) => !!m && people.some((p) => at(p) > at(m) + GRACE_MS);
    const lead = leads.get(opening.leadId);

    const reached = {
      answered: inbound.length > 0,
      person: people.length > 0,
      presented: !!presentedMsg,
      afterPresentation: wroteAfter(presentedMsg),
      solution: !!solutionMsg,
      goal: wroteAfter(solutionMsg),
      offer: madeClosingOffer(sorted),
      proposal: lead?.stage === "proposta" || lead?.stage === "ganho",
      won: lead?.stage === "ganho",
    };
    count.sent++;
    for (const k of Object.keys(reached) as (keyof typeof reached)[]) if (reached[k]) count[k]++;
    if (!reached.answered) lost.silent++;
    else if (!reached.person) lost.botOnly++;
    if (reached.presented && !reached.afterPresentation) lost.stoppedAfterPresentation++;

    const niche = lead?.niche?.split(",")[0]?.trim().toLowerCase() || "sem ramo";
    const angleKey = opening.variant ? stripStyle(opening.variant) : "sem-variacao";
    for (const g of [group(angles, angleKey, variantLabel(angleKey)), group(niches, niche, niche.charAt(0).toUpperCase() + niche.slice(1))]) {
      g.sent++;
      if (reached.person) g.people++;
      if (reached.presented) g.presented++;
      if (reached.afterPresentation) g.afterPresentation++;
    }
  }

  const rows: [string, string, number][] = [
    ["sent", "Aberturas enviadas", count.sent],
    ["answered", "Responderam (pessoa ou robô)", count.answered],
    ["person", "Uma pessoa respondeu", count.person],
    ["presented", "Receberam a apresentação", count.presented],
    ["afterPresentation", "Escreveram depois da apresentação", count.afterPresentation],
    ["solution", "Ouviram a solução", count.solution],
    ["goal", "Disseram o que querem", count.goal],
    ["offer", "Receberam o valor", count.offer],
    ["proposal", "Chegaram à proposta", count.proposal],
    ["won", "Fecharam", count.won],
  ];
  const steps: FunnelStep[] = rows.map(([id, label, n], i) => ({
    id,
    label,
    count: n,
    ofPrev: i === 0 || n > rows[i - 1][2] ? null : rows[i - 1][2] > 0 ? n / rows[i - 1][2] : null,
    outOfOrder: i > 0 && n > rows[i - 1][2],
    ofStart: count.sent > 0 ? n / count.sent : null,
  }));
  const sortGroups = (map: Map<string, FunnelGroup>) => [...map.values()].sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label));
  return { days, sent: count.sent, steps, byAngle: sortGroups(angles), byNiche: sortGroups(niches), lost };
}

/** Lê o banco e monta o funil dos últimos `days` dias. */
export async function loadFunnel(repo: Repo, now: Date, days = 30): Promise<FunnelReport> {
  const messages = await repo.listMessages({ limit: 10_000, order: "asc" });
  const leadIds = [...new Set(messages.map((m) => m.leadId))];
  const leads = new Map((await repo.getLeads(leadIds)).map((l) => [l.id, l]));
  return computeFunnel(messages, leads, now, days);
}
