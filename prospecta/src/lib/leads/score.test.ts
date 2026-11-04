import { describe, expect, it } from "vitest";
import { SCORE_MAX, scoreBand, scoreLead, type ScoreInput } from "./score";
import { DEFAULT_HIGH_TICKET_TERMS } from "./niches";

const cfg = { highTicketTerms: DEFAULT_HIGH_TICKET_TERMS };

const BEST: ScoreInput = {
  websiteKind: "none",
  rating: 4.8,
  reviewsCount: 120,
  isMobile: true,
  hasPhone: true,
  niche: "Estética",
  category: "Clínica de estética",
  hasPresence: true,
};

describe("scoreLead", () => {
  it("os máximos somam 100", () => {
    expect(Object.values(SCORE_MAX).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("melhor lead possível vale 100", () => {
    expect(scoreLead(BEST, cfg).score).toBe(100);
  });

  it("pior lead possível vale 0", () => {
    const worst: ScoreInput = {
      websiteKind: "real",
      rating: null,
      reviewsCount: 0,
      isMobile: false,
      hasPhone: false,
      niche: "Padaria",
      category: "Padaria",
      hasPresence: false,
    };
    expect(scoreLead(worst, cfg).score).toBe(0);
  });

  it("só rede social pontua igual a sem site", () => {
    expect(scoreLead({ ...BEST, websiteKind: "social" }, cfg).score).toBe(100);
  });

  it("site fraco vale menos que sem site e mais que site bom", () => {
    const none = scoreLead({ ...BEST, websiteKind: "none" }, cfg).score;
    const weak = scoreLead({ ...BEST, websiteKind: "weak" }, cfg).score;
    const real = scoreLead({ ...BEST, websiteKind: "real" }, cfg).score;
    expect(none).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThan(real);
  });

  it("telefone fixo rende 5 de 20 no contato", () => {
    const r = scoreLead({ ...BEST, isMobile: false }, cfg);
    expect(r.items.find((i) => i.key === "contato")?.points).toBe(5);
  });

  it("degraus de reputação", () => {
    const pts = (rating: number | null) =>
      scoreLead({ ...BEST, rating }, cfg).items.find((i) => i.key === "reputacao")?.points;
    expect([pts(4.5), pts(4.3), pts(4.0), pts(3.5), pts(3.0), pts(null)]).toEqual([15, 12, 8, 4, 0, 0]);
  });

  it("degraus de movimento", () => {
    const pts = (reviewsCount: number) =>
      scoreLead({ ...BEST, reviewsCount }, cfg).items.find((i) => i.key === "volume")?.points;
    expect([pts(100), pts(50), pts(30), pts(10), pts(9)]).toEqual([15, 12, 10, 5, 0]);
  });

  it("nicho de ticket alto ignora acento e caixa", () => {
    const r = scoreLead({ ...BEST, niche: null, category: "Clínica Odontológica" }, cfg);
    expect(r.items.find((i) => i.key === "nicho")?.points).toBe(10);
    const none = scoreLead({ ...BEST, niche: "Padaria", category: "Padaria" }, cfg);
    expect(none.items.find((i) => i.key === "nicho")?.points).toBe(0);
  });

  it("cada item explica o motivo", () => {
    for (const item of scoreLead(BEST, cfg).items) expect(item.detail.length).toBeGreaterThan(3);
  });
});

describe("scoreBand", () => {
  it("faixas", () => {
    expect([scoreBand(100), scoreBand(80), scoreBand(79), scoreBand(60), scoreBand(40), scoreBand(39)]).toEqual([
      "hot",
      "hot",
      "warm",
      "warm",
      "mild",
      "cold",
    ]);
  });
});
