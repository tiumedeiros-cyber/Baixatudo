import { norm } from "@/lib/utils";
import type { ScoreItem, WebsiteKind } from "./types";

export interface ScoreInput {
  websiteKind: WebsiteKind;
  rating: number | null;
  reviewsCount: number;
  isMobile: boolean;
  hasPhone: boolean;
  niche: string | null;
  category: string | null;
  /** Tem fotos ou horário de funcionamento no Maps: negócio vivo. */
  hasPresence: boolean;
}

export interface ScoreResult {
  score: number;
  items: ScoreItem[];
}

/** Pontos máximos por critério. A soma é 100. */
export const SCORE_MAX = {
  site: 35,
  reputacao: 15,
  volume: 15,
  contato: 20,
  nicho: 10,
  presenca: 5,
} as const;

const SITE_POINTS: Record<WebsiteKind, { points: number; detail: string }> = {
  none: { points: 35, detail: "Não tem site" },
  social: { points: 35, detail: "Só rede social ou link de bio, sem site próprio" },
  weak: { points: 22, detail: "Tem uma página, mas fraca" },
  real: { points: 0, detail: "Já tem site" },
};

function reputation(rating: number | null): { points: number; detail: string } {
  if (rating == null) return { points: 0, detail: "Sem nota no Maps" };
  const label = `Nota ${rating.toFixed(1).replace(".", ",")}`;
  if (rating >= 4.5) return { points: 15, detail: `${label}: excelente` };
  if (rating >= 4.3) return { points: 12, detail: `${label}: muito boa` };
  if (rating >= 4.0) return { points: 8, detail: `${label}: boa` };
  if (rating >= 3.5) return { points: 4, detail: `${label}: regular` };
  return { points: 0, detail: `${label}: baixa` };
}

function volume(reviews: number): { points: number; detail: string } {
  const label = `${reviews} avaliações`;
  if (reviews >= 100) return { points: 15, detail: `${label}: muito movimento` };
  if (reviews >= 50) return { points: 12, detail: `${label}: bom movimento` };
  if (reviews >= 30) return { points: 10, detail: `${label}: movimento` };
  if (reviews >= 10) return { points: 5, detail: `${label}: pouco movimento` };
  return { points: 0, detail: `${label}: quase sem sinal` };
}

export function scoreLead(input: ScoreInput, cfg: { highTicketTerms: string[] }): ScoreResult {
  const site = SITE_POINTS[input.websiteKind];
  const rep = reputation(input.rating);
  const vol = volume(input.reviewsCount);

  const contact = input.isMobile
    ? { points: 20, detail: "Tem celular (WhatsApp provável)" }
    : input.hasPhone
      ? { points: 5, detail: "Só telefone fixo" }
      : { points: 0, detail: "Sem telefone" };

  const haystack = norm(`${input.niche ?? ""} ${input.category ?? ""}`);
  const matched = cfg.highTicketTerms.find((t) => t && haystack.includes(norm(t)));
  const niche = matched
    ? { points: 10, detail: "Nicho de ticket alto" }
    : { points: 0, detail: "Nicho de ticket comum" };

  const presence = input.hasPresence
    ? { points: 5, detail: "Perfil ativo (fotos ou horário)" }
    : { points: 0, detail: "Perfil sem fotos nem horário" };

  const items: ScoreItem[] = [
    { key: "site", label: "Site", max: SCORE_MAX.site, ...site },
    { key: "reputacao", label: "Reputação", max: SCORE_MAX.reputacao, ...rep },
    { key: "volume", label: "Movimento", max: SCORE_MAX.volume, ...vol },
    { key: "contato", label: "Contato", max: SCORE_MAX.contato, ...contact },
    { key: "nicho", label: "Nicho", max: SCORE_MAX.nicho, ...niche },
    { key: "presenca", label: "Presença", max: SCORE_MAX.presenca, ...presence },
  ];

  const score = Math.max(0, Math.min(100, items.reduce((sum, i) => sum + i.points, 0)));
  return { score, items };
}

export type ScoreBand = "hot" | "warm" | "mild" | "cold";

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "mild";
  return "cold";
}
