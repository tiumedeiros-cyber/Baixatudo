import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./types";

describe("configurações: fluxo do agente", () => {
  it("o padrão é qualificar (sem prévia automática)", () => {
    expect(DEFAULT_SETTINGS.agentFlow).toBe("qualificar");
    expect(mergeSettings(null).agentFlow).toBe("qualificar");
  });

  it("configurações salvas antes de o campo existir passam a usar o padrão, sem migração", () => {
    const old = { ticketAverage: 900, offer: "Sites" };
    expect(mergeSettings(old).agentFlow).toBe("qualificar");
    expect(mergeSettings(old).ticketAverage).toBe(900);
  });

  it("quem escolheu o fluxo com prévia continua nele", () => {
    expect(mergeSettings({ agentFlow: "previa" }).agentFlow).toBe("previa");
  });
});
