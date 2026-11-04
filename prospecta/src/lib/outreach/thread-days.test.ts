import { describe, expect, it } from "vitest";
import { clock, dayKey, dayLabel, groupByDay } from "./thread-days";

const TZ = "America/Fortaleza";

describe("datas da conversa", () => {
  it("usa o fuso do painel, não o do servidor", () => {
    // 02:30 UTC ainda é o dia anterior em Fortaleza (UTC-3)
    expect(dayKey("2026-10-27T02:30:00Z", TZ)).toBe("2026-10-26");
    expect(clock("2026-10-27T02:30:00Z", TZ)).toBe("23:30");
  });

  it("dá nome a hoje e a ontem e data curta aos outros dias", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    expect(dayLabel("2026-10-26", now, TZ)).toBe("Hoje");
    expect(dayLabel("2026-10-25", now, TZ)).toBe("Ontem");
    expect(dayLabel("2026-10-23", now, TZ)).toMatch(/^sex, 23\/10$/);
  });

  it("agrupa por dia sem reordenar", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    const items = [
      { id: 1, at: "2026-10-24T12:00:00Z" },
      { id: 2, at: "2026-10-25T12:00:00Z" },
      { id: 3, at: "2026-10-26T11:00:00Z" },
      { id: 4, at: "2026-10-26T14:00:00Z" },
    ];
    const groups = groupByDay(items, (i) => i.at, TZ, now);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["sáb, 24/10", [1]],
      ["Ontem", [2]],
      ["Hoje", [3, 4]],
    ]);
  });

  it("não junta dias iguais que não são vizinhos", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    const items = [
      { id: 1, at: "2026-10-25T12:00:00Z" },
      { id: 2, at: "2026-10-26T12:00:00Z" },
      { id: 3, at: "2026-10-25T13:00:00Z" },
    ];
    expect(groupByDay(items, (i) => i.at, TZ, now)).toHaveLength(3);
  });
});
