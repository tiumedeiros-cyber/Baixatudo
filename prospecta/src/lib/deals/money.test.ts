import { describe, expect, it } from "vitest";
import { entryCents, formatCents, outstandingCents, parseMoneyToCents, receivedCents, remainingCents } from "./money";

const base = { amountCents: 80_000, entryPct: 50 } as const;

describe("parseMoneyToCents", () => {
  it.each([
    ["800", 80_000],
    ["800,50", 80_050],
    ["R$ 1.200", 120_000],
    ["1.200,00", 120_000],
    ["1200", 120_000],
    ["1.234.567,89", 123_456_789],
    ["  R$ 99,9 ", 9_990],
  ])("lê %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "0", "-5", "R$", ",", "0,00"])("recusa %j", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("formatCents", () => {
  it("mostra inteiro sem centavos e fracionado com centavos", () => {
    expect(formatCents(80_000).replace(/\s/g, " ")).toBe("R$ 800");
    expect(formatCents(80_050).replace(/\s/g, " ")).toBe("R$ 800,50");
    expect(formatCents(123_456_700).replace(/\s/g, " ")).toBe("R$ 1.234.567");
  });
});

describe("sinal e saldo", () => {
  it("50% de 800 é 400 e o saldo é 400", () => {
    expect(entryCents(base)).toBe(40_000);
    expect(remainingCents(base)).toBe(40_000);
  });

  it("arredonda para o centavo e sinal + saldo sempre fecham o total", () => {
    const odd = { amountCents: 100_001, entryPct: 33 };
    expect(entryCents(odd)).toBe(33_000);
    expect(entryCents(odd) + remainingCents(odd)).toBe(odd.amountCents);
  });

  it("sinal de 0% e de 100%", () => {
    expect(entryCents({ amountCents: 50_000, entryPct: 0 })).toBe(0);
    expect(remainingCents({ amountCents: 50_000, entryPct: 100 })).toBe(0);
  });
});

describe("recebido e a receber", () => {
  it("só conta o que foi marcado como pago", () => {
    expect(receivedCents({ ...base, status: "draft" })).toBe(0);
    expect(receivedCents({ ...base, status: "sent" })).toBe(0);
    expect(receivedCents({ ...base, status: "entry_paid" })).toBe(40_000);
    expect(receivedCents({ ...base, status: "paid" })).toBe(80_000);
    expect(receivedCents({ ...base, status: "cancelled" })).toBe(0);
  });

  it("a receber é o que falta nas propostas vivas; cancelada, rascunho e paga não entram", () => {
    expect(outstandingCents({ ...base, status: "draft" })).toBe(0);
    expect(outstandingCents({ ...base, status: "sent" })).toBe(80_000);
    expect(outstandingCents({ ...base, status: "accepted" })).toBe(80_000);
    expect(outstandingCents({ ...base, status: "entry_paid" })).toBe(40_000);
    expect(outstandingCents({ ...base, status: "paid" })).toBe(0);
    expect(outstandingCents({ ...base, status: "cancelled" })).toBe(0);
  });
});
