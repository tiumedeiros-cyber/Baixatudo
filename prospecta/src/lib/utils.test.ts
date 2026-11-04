import { describe, expect, it } from "vitest";
import { cn, formatBRL, norm, timeAgo } from "./utils";

describe("norm", () => {
  it("tira acento, caixa e espaço sobrando", () => {
    expect(norm("  Clínica   ODONTOLÓGICA ")).toBe("clinica odontologica");
    expect(norm(null)).toBe("");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-21T12:00:00Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("faixas", () => {
    expect(timeAgo(ago(10_000), now)).toBe("agora");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("há 5 min");
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("há 3 h");
    expect(timeAgo(ago(26 * 3_600_000), now)).toBe("ontem");
    expect(timeAgo(ago(5 * 86_400_000), now)).toBe("há 5 d");
  });
  it("data futura não fica negativa", () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe("agora");
  });
});

describe("formatBRL / cn", () => {
  it("formata reais sem centavos", () => {
    expect(formatBRL(800).replace(/\s/g, " ")).toBe("R$ 800");
  });
  it("cn resolve conflitos do Tailwind", () => {
    expect(cn("px-2", "px-4", false && "x")).toBe("px-4");
  });
});
