import { deadScore } from "./ingest";
import { scoreLead } from "./score";
import type { Lead, ScoreItem, Settings, WebsiteKind } from "./types";

/** Recalcula nota e detalhamento de um lead existente (ex.: depois de analisar o site). */
export function rescore(
  lead: Lead,
  settings: Settings,
  override: { websiteKind?: WebsiteKind } = {},
): { score: number; scoreBreakdown: ScoreItem[] } {
  const dead = deadScore(lead.ineligibleReason);
  if (dead) return { score: dead.score, scoreBreakdown: dead.items };

  const { score, items } = scoreLead(
    {
      websiteKind: override.websiteKind ?? lead.websiteKind,
      rating: lead.rating,
      reviewsCount: lead.reviewsCount,
      isMobile: lead.isMobile,
      hasPhone: !!lead.phoneE164,
      niche: lead.niche,
      category: lead.category,
      // A presença vem do perfil do Maps; reaproveita o que foi pontuado na entrada.
      hasPresence: lead.scoreBreakdown.some((i) => i.key === "presenca" && i.points > 0),
    },
    { highTicketTerms: settings.highTicketTerms },
  );
  return { score, scoreBreakdown: items };
}
