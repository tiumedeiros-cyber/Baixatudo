import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { sendManualNow } from "./engine";
import { ProviderError, SimulatedProvider, type ProviderStatus, type WhatsAppProvider } from "./provider";

/** 03:00 em Fortaleza: fora da janela de envio da automação. O dono escreve a qualquer hora. */
const NIGHT = new Date("2026-10-22T06:00:00Z");

class RecordingProvider implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  connected = true;
  failWith: Error | null = null;
  calls = 0;
  sent: { phone: string; text: string }[] = [];
  typingCalls: [string, boolean][] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: this.connected, loggedIn: this.connected, mode: this.mode, detail: this.connected ? "WhatsApp conectado" : "GOWA no ar, mas desconectado do WhatsApp" };
  }
  async typing(phone: string, on: boolean) {
    this.typingCalls.push([phone, on]);
  }
  async sendText(phone: string, text: string) {
    this.calls++;
    if (this.failWith) throw this.failWith;
    this.sent.push({ phone, text });
    return { id: `3EB0MANUAL${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return null;
  }
}

async function setup(automation: { paused: boolean; dryRun: boolean }) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 10, offset: 0 });
  const lead = rows[0];
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.saveAutomation(automation);
  return { repo, lead, conv };
}

const send = (repo: MemoryRepo, provider: WhatsAppProvider, lead: Awaited<ReturnType<typeof setup>>["lead"], conv: Awaited<ReturnType<typeof setup>>["conv"], body = "Oi, aqui é o Jonathan. Posso te mandar um exemplo?") =>
  sendManualNow({ repo, provider, now: NIGHT }, { conv, lead, body });

describe("sendManualNow: o que o dono escreve sai na hora", () => {
  it("sai direto, sem 'digitando…', mesmo com a automação pausada e fora do horário", async () => {
    const { repo, lead, conv } = await setup({ paused: true, dryRun: false });
    const provider = new RecordingProvider();
    const r = await send(repo, provider, lead, conv);

    expect(r).toMatchObject({ sent: true, simulated: false });
    expect(provider.sent).toEqual([{ phone: lead.phoneE164, text: "Oi, aqui é o Jonathan. Posso te mandar um exemplo?" }]);
    expect(provider.typingCalls).toEqual([]);

    const [m] = await repo.listMessages({ conversationId: conv.id, limit: 10 });
    expect(m).toMatchObject({ kind: "manual", direction: "out", status: "sent", createdBy: "user", providerMessageId: "3EB0MANUAL1", sentAt: NIGHT.toISOString(), error: null });
    expect(await repo.getConversation(conv.id)).toMatchObject({ lastOutboundAt: NIGHT.toISOString(), touches: 0 });
    // não é prospecção: a etapa do lead não muda e o contador de abordagens não sobe
    expect((await repo.getLead(lead.id))!.stage).toBe(lead.stage);
    expect((await repo.messageCounts()).prospectingSent).toBe(0);
    // o intervalo entre envios da automação passa a contar a partir daqui
    expect((await repo.getAutomationState()).lastSendAt).toBe(NIGHT.toISOString());
    expect((await repo.listEvents({ types: ["mensagem_enviada"], limit: 5 })).length).toBe(1);
  });

  it("o intervalo mínimo e o teto do dia da automação não seguram o dono", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: false });
    await repo.saveAutomationState({ lastSendAt: NIGHT.toISOString() }); // acabou de sair outra mensagem
    const provider = new RecordingProvider();
    expect(await send(repo, provider, lead, conv)).toMatchObject({ sent: true });
    expect(await send(repo, provider, lead, conv, "E aí?")).toMatchObject({ sent: true });
    expect(provider.sent.map((s) => s.text)).toEqual(["Oi, aqui é o Jonathan. Posso te mandar um exemplo?", "E aí?"]);
  });

  it("WhatsApp desconectado: não envia e não deixa mensagem pendurada", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: false });
    const provider = new RecordingProvider();
    provider.connected = false;
    const r = await send(repo, provider, lead, conv);

    expect(r).toMatchObject({ sent: false });
    expect(r.sent === false && r.reason).toMatch(/desconectado/);
    expect(provider.calls).toBe(0);
    expect(await repo.listMessages({ conversationId: conv.id, limit: 10 })).toHaveLength(0);
  });

  it("envio real ligado sem GOWA configurado: recusa", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: false });
    const r = await send(repo, new SimulatedProvider(), lead, conv);
    expect(r).toMatchObject({ sent: false });
    expect(await repo.listMessages({ conversationId: conv.id, limit: 10 })).toHaveLength(0);
  });

  it("em simulação só registra, não manda nada de verdade", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: true });
    const provider = new RecordingProvider();
    const r = await send(repo, provider, lead, conv);

    expect(r).toMatchObject({ sent: true, simulated: true });
    expect(provider.calls).toBe(0);
    const [m] = await repo.listMessages({ conversationId: conv.id, limit: 10 });
    expect(m).toMatchObject({ kind: "manual", status: "simulated" });
  });

  it("quem pediu para parar continua protegido", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: false });
    repo._addOptout(lead.phoneE164!);
    const provider = new RecordingProvider();
    const r = await send(repo, provider, lead, conv);

    expect(r).toMatchObject({ sent: false });
    expect(r.sent === false && r.reason).toMatch(/não receber/);
    expect(provider.calls).toBe(0);
  });

  it("falha do WhatsApp: mostra o erro, não tenta de novo sozinha e não pausa a automação", async () => {
    const { repo, lead, conv } = await setup({ paused: false, dryRun: false });
    const provider = new RecordingProvider();
    provider.failWith = new ProviderError("GOWA respondeu 500: instável", true);
    const r = await send(repo, provider, lead, conv);

    expect(r).toMatchObject({ sent: false });
    expect(r.sent === false && r.reason).toMatch(/500/);
    expect(provider.calls).toBe(1);
    const [m] = await repo.listMessages({ conversationId: conv.id, limit: 10 });
    expect(m).toMatchObject({ kind: "manual", status: "failed" });
    // nada volta para a fila: o worker só pega "aprovada"
    expect(await repo.claimNextDueMessage(NIGHT.toISOString())).toBeNull();
    expect((await repo.getSettings()).automation.paused).toBe(false);
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(0);
  });
});
