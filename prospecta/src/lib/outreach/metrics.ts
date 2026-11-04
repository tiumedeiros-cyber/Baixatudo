import type { Repo } from "@/lib/repo/types";
import { stripStyle } from "./style";
import { ANGLES, SHORT_ANGLES, type OpeningGroup } from "./templates";
import type { Conversation, Message } from "./types";

export interface VariantStat {
  variant: string;
  label: string;
  sent: number;
  replied: number;
  /** Taxa de resposta (0 a 1). Nulo se ninguém recebeu. */
  rate: number | null;
}

const GROUP_LABEL: Record<string, string> = {
  none: "Sem site",
  social: "Só Instagram",
  weak: "Site fraco",
};

const ANGLE_LABEL: Record<string, string> = Object.fromEntries([...Object.values(ANGLES).flat(), ...SHORT_ANGLES].map((a) => [a.id, a.label]));

export interface OpeningVariant {
  group: OpeningGroup;
  /** O ângulo (fluxo "qualificar") ou o número do modelo (fluxo antigo). */
  angle: string;
  /** Escrita pela IA (sufixo "-ia"). */
  ia: boolean;
}

/** "abertura-none-google-ia" → grupo, ângulo e se foi a IA. Nulo se o nome não é de uma abertura. */
export function parseOpeningVariant(variant: string | null | undefined): OpeningVariant | null {
  const m = variant ? /^abertura-(none|social|weak)-(.+?)(-ia)?(?:~g\d+i\d+q\d+(?:r\d+)?)?$/.exec(variant) : null;
  return m ? { group: m[1] as OpeningGroup, angle: m[2], ia: !!m[3] } : null;
}

/** "abertura-social-2" vira "Só Instagram · variação 2" e "abertura-none-google-ia" vira "Sem site · Achei no Google (IA)". */
export function variantLabel(variant: string): string {
  const v = parseOpeningVariant(variant);
  if (!v) return variant;
  const what = /^\d+$/.test(v.angle) ? `variação ${v.angle}` : (ANGLE_LABEL[v.angle] ?? v.angle);
  return `${GROUP_LABEL[v.group]} · ${what}${v.ia ? " (IA)" : ""}`;
}

/**
 * Taxa de resposta por variação de abertura (o teste A/B de graça). Só conta abertura que saiu de
 * verdade, e "respondeu" é a conversa ter recebido qualquer mensagem do lead depois.
 */
export function computeVariantStats(openings: Message[], conversations: Conversation[]): VariantStat[] {
  const replied = new Set(conversations.filter((c) => c.lastInboundAt).map((c) => c.id));
  const by = new Map<string, { sent: number; replied: number }>();
  for (const m of openings) {
    if (m.direction !== "out" || m.kind !== "opening") continue;
    if (!["sent", "delivered", "read"].includes(m.status)) continue;
    // o código de estilo (saudação, apresentação, pergunta) muda a cada abertura: o teste A/B agrupa por ângulo
    const key = m.variant ? stripStyle(m.variant) : "sem-variacao";
    const row = by.get(key) ?? { sent: 0, replied: 0 };
    row.sent++;
    if (replied.has(m.conversationId)) row.replied++;
    by.set(key, row);
  }
  return [...by.entries()]
    .map(([variant, r]) => ({
      variant,
      label: variantLabel(variant),
      sent: r.sent,
      replied: r.replied,
      rate: r.sent > 0 ? r.replied / r.sent : null,
    }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.sent - a.sent || a.variant.localeCompare(b.variant));
}

export async function openingVariantStats(repo: Repo): Promise<VariantStat[]> {
  const [openings, conversations] = await Promise.all([
    repo.listMessages({ kinds: ["opening"], statuses: ["sent", "delivered", "read"], limit: 5000 }),
    repo.listConversations({ limit: 1000 }),
  ]);
  return computeVariantStats(openings, conversations.rows);
}
