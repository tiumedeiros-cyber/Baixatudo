import { describe, expect, it } from "vitest";
import { computeVariantStats, parseOpeningVariant, variantLabel } from "./metrics";
import type { Conversation, Message } from "./types";

const msg = (over: Partial<Message>): Message => ({
  id: crypto.randomUUID(),
  conversationId: "c1",
  leadId: "l1",
  accountId: null,
  direction: "out",
  kind: "opening",
  step: 0,
  body: "oi",
  status: "sent",
  variant: "abertura-none-1",
  intent: null,
  scheduledFor: null,
  approvedAt: null,
  sentAt: null,
  providerMessageId: null,
  attempts: 0,
  error: null,
  createdBy: "system",
  batchDay: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  ...over,
});

const conv = (id: string, replied: boolean): Conversation => ({
  id,
  leadId: `lead-${id}`,
  phoneE164: `+55859${id}`,
  accountId: null,
  status: "active",
  humanTakenOver: false,
  touches: 1,
  unread: 0,
  lastInboundAt: replied ? "2026-10-22T10:00:00.000Z" : null,
  lastOutboundAt: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
});

describe("variantLabel", () => {
  it("traduz o nome técnico", () => {
    expect(variantLabel("abertura-none-1")).toBe("Sem site · variação 1");
    expect(variantLabel("abertura-social-3")).toBe("Só Instagram · variação 3");
    expect(variantLabel("abertura-weak-2")).toBe("Site fraco · variação 2");
    expect(variantLabel("outra-coisa")).toBe("outra-coisa");
  });

  it("traduz os ângulos do banco e marca o que a IA escreveu", () => {
    expect(variantLabel("abertura-none-elogio")).toBe("Sem site · Elogio e dor");
    expect(variantLabel("abertura-none-elogio-ia")).toBe("Sem site · Elogio e dor (IA)");
    expect(variantLabel("abertura-social-vitrine-ia")).toBe("Só Instagram · Tudo num lugar só (IA)");
    expect(variantLabel("abertura-weak-direta")).toBe("Site fraco · Direta, curta");
    expect(variantLabel("abertura-none-angulo-novo")).toBe("Sem site · angulo-novo");
  });
});

describe("parseOpeningVariant", () => {
  it("separa grupo, ângulo e origem", () => {
    expect(parseOpeningVariant("abertura-social-procurada-ia")).toEqual({ group: "social", angle: "procurada", ia: true });
    expect(parseOpeningVariant("abertura-none-2")).toEqual({ group: "none", angle: "2", ia: false });
    expect(parseOpeningVariant("agente:price")).toBeNull();
    expect(parseOpeningVariant(null)).toBeNull();
  });
});

describe("computeVariantStats", () => {
  it("conta envios e respostas por variação e ordena pela melhor taxa", () => {
    const stats = computeVariantStats(
      [
        msg({ conversationId: "a", variant: "abertura-none-1" }),
        msg({ conversationId: "b", variant: "abertura-none-1" }),
        msg({ conversationId: "c", variant: "abertura-none-2", status: "read" }),
        msg({ conversationId: "d", variant: "abertura-none-2", status: "delivered" }),
        msg({ conversationId: "e", variant: "abertura-none-2" }),
      ],
      [conv("a", true), conv("b", false), conv("c", true), conv("d", true), conv("e", false)],
    );
    expect(stats.map((s) => [s.variant, s.sent, s.replied])).toEqual([
      ["abertura-none-2", 3, 2],
      ["abertura-none-1", 2, 1],
    ]);
    expect(stats[0].rate).toBeCloseTo(2 / 3);
    expect(stats[1].rate).toBe(0.5);
  });

  it("ignora o que não saiu de verdade, follow-ups e mensagens recebidas", () => {
    const stats = computeVariantStats(
      [
        msg({ status: "simulated" }),
        msg({ status: "draft" }),
        msg({ status: "failed" }),
        msg({ kind: "followup", variant: "followup-1" }),
        msg({ direction: "in", status: "received" }),
      ],
      [conv("c1", true)],
    );
    expect(stats).toEqual([]);
  });

  it("sem variação registrada entra num grupo próprio", () => {
    const stats = computeVariantStats([msg({ variant: null })], [conv("c1", false)]);
    expect(stats).toMatchObject([{ variant: "sem-variacao", sent: 1, replied: 0, rate: 0 }]);
  });
});
