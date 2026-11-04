import { describe, expect, it } from "vitest";
import { generateDemo } from "@/lib/deals/service";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import {
  approveMessages,
  blockLead,
  cancelMessages,
  getOverview,
  handleAckEvent,
  handleMessageEvent,
  prepareBatch,
  reopenMessages,
  requeueSimulated,
  tick,
  unblockLead,
} from "./engine";
import { buildAgentReport } from "@/lib/agent/report";
import { inWindow, localParts } from "./guardrails";
import { ProviderError, SimulatedProvider, type ProviderStatus, type WhatsAppProvider } from "./provider";
import type { WebhookEvent } from "./webhook";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const rng = () => 0.5;
const sleep = async () => {};
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

class RecordingProvider implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  connected = true;
  onWhatsApp: boolean | null = null;
  failWith: Error | null = null;
  sent: { phone: string; text: string }[] = [];
  typingCalls: [string, boolean][] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: this.connected, loggedIn: this.connected, mode: this.mode, detail: this.connected ? "WhatsApp conectado" : "desconectado" };
  }
  async typing(phone: string, on: boolean) {
    this.typingCalls.push([phone, on]);
  }
  async sendText(phone: string, text: string) {
    if (this.failWith) throw this.failWith;
    this.sent.push({ phone, text });
    return { id: `3EB0TEST${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return this.onWhatsApp;
  }
}

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  // o padrão do painel agora é "qualificar" (sem prévia); estes testes cobrem o fluxo com prévia, e o novo tem os seus
  await repo.saveSettings({ agentFlow: "previa" });
  return { repo, leads };
}

/** Cria uma mensagem já aprovada e vencida para um lead (atalho para testar o worker). */
async function queue(repo: MemoryRepo, lead: Lead, opts: { kind?: "opening" | "followup" | "reply"; at?: Date; status?: "approved" | "draft" } = {}) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  const [m] = await repo.createMessages([
    {
      conversationId: conv.id,
      leadId: lead.id,
      direction: "out",
      kind: opts.kind ?? "opening",
      body: `Olá ${lead.name}`,
      status: opts.status ?? "approved",
      createdBy: "system",
      scheduledFor: (opts.at ?? plus(NOW, -MIN)).toISOString(),
      approvedAt: NOW.toISOString(),
    },
  ]);
  return { conv, m };
}

const live = (repo: MemoryRepo) => repo.saveAutomation({ paused: false, dryRun: false });

describe("prepareBatch", () => {
  it("prepara no máximo o teto do dia, só rascunhos, das melhores notas para baixo", async () => {
    const { repo, leads } = await setup();
    const r = await prepareBatch(repo, NOW);
    expect(r).toMatchObject({ day: "2026-10-22", cap: 8, openings: 8, followUps: 0, alreadyPrepared: 0 });

    const msgs = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(msgs).toHaveLength(8);
    for (const m of msgs) {
      expect(m).toMatchObject({ status: "draft", direction: "out", createdBy: "system", batchDay: "2026-10-22", step: 0 });
      expect(m.body).not.toMatch(/PARE/);
    }
    // os melhores primeiro
    const chosen = new Set(msgs.map((m) => m.leadId));
    const bestEight = leads.slice(0, 8).map((l) => l.id);
    expect(bestEight.filter((id) => chosen.has(id)).length).toBeGreaterThanOrEqual(7);
    // nenhuma saiu
    expect((await repo.messageCounts()).prospectingSent).toBe(0);
  });

  it("chamar de novo no mesmo dia não passa do teto", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW);
    const again = await prepareBatch(repo, plus(NOW, 2 * 60 * MIN));
    expect(again.openings).toBe(0);
    expect(again.alreadyPrepared).toBe(8);
    expect(await repo.listMessages({ kinds: ["opening"], limit: 100 })).toHaveLength(8);
  });

  it("só leads Qualificados entram", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const r = await prepareBatch(repo, NOW);
    expect(r.openings).toBe(0);
  });

  it("nunca prepara lead de demonstração", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "demo" });
    const { rows } = await repo.listLeads({ eligible: true, limit: 100, offset: 0 });
    await repo.bulkSetStage(rows.map((x) => x.id), "qualificado");
    // em banco real (não demonstração) os fictícios nunca entram
    const r = await prepareBatch(repo, NOW, { allowDemoLeads: false });
    expect(r.openings).toBe(0);
    expect(r.skipped["lead de demonstração"]).toBeGreaterThan(0);
    // no modo demonstração, sim (não existe WhatsApp de verdade lá)
    expect((await prepareBatch(repo, NOW)).openings).toBeGreaterThan(0);
  });

  it("mesmo com envio real ligado, lead fictício nunca sai", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "demo" });
    const { rows } = await repo.listLeads({ eligible: true, limit: 1, offset: 0 });
    const provider = new RecordingProvider();
    await live(repo);
    const { m } = await queue(repo, (await repo.getLeads([rows[0].id]))[0]);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "cancelled", reason: "lead de demonstração" });
    expect(provider.sent).toHaveLength(0);
    expect((await repo.getMessage(m.id))!.status).toBe("cancelled");
  });

  it("pula quem pediu para não receber", async () => {
    const { repo, leads } = await setup();
    repo._addOptout(leads[0].phoneE164!);
    await prepareBatch(repo, NOW);
    const msgs = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(msgs.some((m) => m.leadId === leads[0].id)).toBe(false);
  });

  it("pula número que já se sabe que não tem WhatsApp", async () => {
    const { repo, leads } = await setup();
    await repo.updateLead(leads[0].id, { whatsappStatus: "no" });
    const r = await prepareBatch(repo, NOW);
    expect(r.skipped["número sem WhatsApp"]).toBe(1);
  });

  it("respeita o limite informado", async () => {
    const { repo } = await setup();
    expect((await prepareBatch(repo, NOW, { limit: 3 })).openings).toBe(3);
  });

  it("follow-up só depois de 2 dias, e o 2º depois de 5", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const { conv, m: opening } = await queue(repo, lead);
    await repo.setStage(lead.id, "contatado");
    const sentAt = NOW.toISOString();
    await repo.updateMessage(opening.id, { status: "sent", sentAt }); // a abertura de fato saiu
    await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: sentAt });

    // mesmo dia e dia seguinte: nada
    expect((await prepareBatch(repo, plus(NOW, 1 * DAY), { limit: 5 })).followUps).toBe(0);
    // 2 dias depois: 1º follow-up
    const r = await prepareBatch(repo, plus(NOW, 2 * DAY), { limit: 5 });
    expect(r.followUps).toBe(1);
    const [fu] = await repo.listMessages({ kinds: ["followup"], limit: 10 });
    expect(fu).toMatchObject({ step: 1, status: "draft", conversationId: conv.id });

    // com o follow-up ainda pendente, não duplica
    expect((await prepareBatch(repo, plus(NOW, 2 * DAY + 5 * MIN), { limit: 5 })).followUps).toBe(0);

    // 2º follow-up: touches = 2, 5 dias depois do último envio
    await repo.updateMessage(fu.id, { status: "sent" });
    await repo.updateConversation(conv.id, { touches: 2, lastOutboundAt: plus(NOW, 2 * DAY).toISOString() });
    expect((await prepareBatch(repo, plus(NOW, 4 * DAY), { limit: 5 })).followUps).toBe(0);
    expect((await prepareBatch(repo, plus(NOW, 7 * DAY), { limit: 5 })).followUps).toBe(1);

    // depois de 3 toques acabou
    await repo.updateConversation(conv.id, { touches: 3, lastOutboundAt: plus(NOW, 7 * DAY).toISOString() });
    expect((await prepareBatch(repo, plus(NOW, 30 * DAY), { limit: 5 })).followUps).toBe(0);
  });

  it("não faz follow-up de quem respondeu ou de quem o dono assumiu", async () => {
    const { repo, leads } = await setup();
    const a = await queue(repo, leads[0]);
    const b = await queue(repo, leads[1]);
    for (const l of [leads[0], leads[1]]) await repo.setStage(l.id, "contatado");
    await repo.updateConversation(a.conv.id, { touches: 1, lastOutboundAt: NOW.toISOString(), lastInboundAt: plus(NOW, MIN).toISOString() });
    await repo.updateConversation(b.conv.id, { touches: 1, lastOutboundAt: NOW.toISOString(), humanTakenOver: true });
    expect((await prepareBatch(repo, plus(NOW, 3 * DAY), { limit: 5 })).followUps).toBe(0);
  });
});

describe("approveMessages", () => {
  it("aprova e marca horários dentro das janelas, em ordem, sem passar do teto do dia", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW, { limit: 12 });
    const ids = (await repo.listMessages({ statuses: ["draft"], limit: 100 })).map((m) => m.id);
    const r = await approveMessages(repo, ids, NOW, rng);
    expect(r.approved).toBe(12);

    const approved = await repo.listMessages({ statuses: ["approved"], limit: 100 });
    const times = approved.map((m) => new Date(m.scheduledFor!)).sort((a, b) => a.getTime() - b.getTime());
    const cfg = (await repo.getSettings()).automation;
    for (const t of times) expect(inWindow(t, cfg), t.toISOString()).toBe(true);
    const perDay: Record<string, number> = {};
    for (const t of times) {
      const d = localParts(t, cfg.timezone).ymd;
      perDay[d] = (perDay[d] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(perDay))).toBeLessThanOrEqual(8);
    for (let i = 1; i < times.length; i++) expect(times[i].getTime() - times[i - 1].getTime()).toBeGreaterThanOrEqual(180_000);
  });

  it("um segundo lote começa depois do último horário já marcado", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW, { limit: 3 });
    const first = (await repo.listMessages({ statuses: ["draft"], limit: 10 })).map((m) => m.id);
    await approveMessages(repo, first, NOW, rng);
    const lastFirst = Math.max(...(await repo.listMessages({ statuses: ["approved"], limit: 10 })).map((m) => Date.parse(m.scheduledFor!)));

    await prepareBatch(repo, plus(NOW, 5 * MIN), { limit: 6 });
    const second = (await repo.listMessages({ statuses: ["draft"], limit: 10 })).map((m) => m.id);
    await approveMessages(repo, second, plus(NOW, 5 * MIN), rng);
    const secondTimes = (await repo.listMessages({ statuses: ["approved"], limit: 20 }))
      .filter((m) => second.includes(m.id))
      .map((m) => Date.parse(m.scheduledFor!));
    expect(Math.min(...secondTimes)).toBeGreaterThan(lastFirst);
  });

  it("só aprova rascunho (aprovar duas vezes não duplica nem reagenda)", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW, { limit: 2 });
    const ids = (await repo.listMessages({ statuses: ["draft"], limit: 10 })).map((m) => m.id);
    await approveMessages(repo, ids, NOW, rng);
    const before = await repo.listMessages({ statuses: ["approved"], limit: 10 });
    const again = await approveMessages(repo, ids, plus(NOW, MIN), rng);
    expect(again).toMatchObject({ approved: 0, skipped: 2 });
    expect(await repo.listMessages({ statuses: ["approved"], limit: 10 })).toEqual(before);
  });

  it("resposta a quem escreveu sai em segundos, mesmo fora da janela", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0], { kind: "reply", status: "draft" });
    const night = new Date("2026-10-22T23:30:00Z"); // 20:30 local, fora da janela
    await approveMessages(repo, [m.id], night, rng);
    const after = await repo.getMessage(m.id);
    expect(after!.status).toBe("approved");
    expect(Date.parse(after!.scheduledFor!) - night.getTime()).toBeLessThan(2 * MIN);
  });

  it("cancelar e reenfileirar as simuladas", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW, { limit: 3 });
    const ids = (await repo.listMessages({ statuses: ["draft"], limit: 10 })).map((m) => m.id);
    expect(await cancelMessages(repo, [ids[0]])).toBe(1);
    expect((await repo.getMessage(ids[0]))!.status).toBe("cancelled");

    await approveMessages(repo, ids.slice(1), NOW, rng);
    await repo.saveAutomation({ paused: false }); // simulação continua ligada
    await tick({ repo, provider: new SimulatedProvider(), now: plus(NOW, 2 * MIN), rng, sleep });
    expect((await repo.listMessages({ statuses: ["simulated"], limit: 10 })).length).toBe(1);
    expect(await requeueSimulated(repo, plus(NOW, 5 * MIN), rng)).toBe(1);
    expect((await repo.listMessages({ statuses: ["simulated"], limit: 10 })).length).toBe(0);
    expect((await repo.listMessages({ statuses: ["approved"], limit: 10 })).length).toBe(2);
  });
});

describe("tick: travas", () => {
  it("nasce pausado: não pega nada", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0]);
    const r = await tick({ repo, provider: new SimulatedProvider(), now: NOW, rng, sleep });
    expect(r.action).toBe("paused");
    expect((await repo.getMessage(m.id))!.status).toBe("approved");
  });

  it("sem nada vencido fica ocioso", async () => {
    const { repo } = await setup();
    await repo.saveAutomation({ paused: false });
    expect((await tick({ repo, provider: new SimulatedProvider(), now: NOW, rng, sleep })).action).toBe("idle");
  });

  it("simulação: registra, mas não muda lead, conversa nem aquecimento", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    const { m, conv } = await queue(repo, leads[0]);
    await repo.saveAutomation({ paused: false }); // dryRun continua true
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toEqual({ action: "simulated", messageId: m.id });
    expect(provider.sent).toHaveLength(0);
    expect(provider.typingCalls).toHaveLength(0);
    expect((await repo.getMessage(m.id))!.status).toBe("simulated");
    expect((await repo.getLead(leads[0].id))!.stage).toBe("qualificado");
    expect((await repo.getConversation(conv.id))!.touches).toBe(0);
    expect((await repo.getSettings()).automation.warmupStart).toBeNull();
    expect((await repo.messageCounts()).prospectingSent).toBe(0);
  });

  it("fora do horário: adia para a próxima janela", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0]);
    await repo.saveAutomation({ paused: false });
    const night = new Date("2026-10-22T23:00:00Z"); // 20:00 local
    const r = await tick({ repo, provider: new SimulatedProvider(), now: night, rng, sleep });
    expect(r).toMatchObject({ action: "deferred", reason: "fora do horário permitido" });
    const after = await repo.getMessage(m.id);
    expect(after!.status).toBe("approved");
    expect(after!.attempts).toBe(0);
    const cfg = (await repo.getSettings()).automation;
    expect(inWindow(new Date(after!.scheduledFor!), cfg)).toBe(true);
    expect(Date.parse(after!.scheduledFor!)).toBeGreaterThan(night.getTime());
  });

  it("fim de semana: adia para segunda", async () => {
    const { repo, leads } = await setup();
    await queue(repo, leads[0]);
    await repo.saveAutomation({ paused: false });
    const saturday = new Date("2026-10-24T14:00:00Z");
    const r = await tick({ repo, provider: new SimulatedProvider(), now: saturday, rng, sleep });
    expect(r.action).toBe("deferred");
    if (r.action === "deferred") expect(localParts(new Date(r.until), "America/Fortaleza").weekday).toBe(1);
  });

  it("teto do dia: a 3ª fica para o dia seguinte", async () => {
    const { repo, leads } = await setup();
    await repo.saveAutomation({ paused: false, caps: { week1: 2, week2: 2, steady: 2 }, gapMinSec: 60, gapMaxSec: 60 });
    for (const l of leads.slice(0, 3)) await queue(repo, l);
    const provider = new SimulatedProvider();
    expect((await tick({ repo, provider, now: NOW, rng, sleep })).action).toBe("simulated");
    expect((await tick({ repo, provider, now: plus(NOW, 2 * MIN), rng, sleep })).action).toBe("simulated");
    const third = await tick({ repo, provider, now: plus(NOW, 4 * MIN), rng, sleep });
    expect(third).toMatchObject({ action: "deferred", reason: "teto do dia atingido" });
    if (third.action === "deferred") expect(localParts(new Date(third.until), "America/Fortaleza").ymd).toBe("2026-10-23");
  });

  it("intervalo mínimo entre envios", async () => {
    const { repo, leads } = await setup();
    await repo.saveAutomation({ paused: false });
    await queue(repo, leads[0]);
    await queue(repo, leads[1]);
    const provider = new SimulatedProvider();
    expect((await tick({ repo, provider, now: NOW, rng, sleep })).action).toBe("simulated");
    const second = await tick({ repo, provider, now: plus(NOW, 30_000), rng, sleep });
    expect(second).toMatchObject({ action: "deferred", reason: "intervalo mínimo entre envios" });
    if (second.action === "deferred") expect(Date.parse(second.until) - NOW.getTime()).toBeGreaterThanOrEqual(180_000);
  });

  it("para sozinho se quase ninguém responde depois de 40 envios", async () => {
    const { repo, leads } = await setup();
    await repo.saveAutomation({ paused: false });
    // 40 abordagens enviadas, nenhuma resposta
    for (let i = 0; i < 40; i++) {
      const lead = leads[i % leads.length];
      const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
      await repo.createMessages([
        { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "x", status: "sent", createdBy: "system", sentAt: plus(NOW, -DAY).toISOString() },
      ]);
    }
    // as 40 saem de 19 conversas; para contar 40 envios precisamos de 40 mensagens (já há)
    await queue(repo, leads[0]);
    const r = await tick({ repo, provider: new SimulatedProvider(), now: NOW, rng, sleep });
    expect(r.action).toBe("paused");
    const cfg = (await repo.getSettings()).automation;
    expect(cfg.paused).toBe(true);
    expect(cfg.pausedReason).toMatch(/responderam/);
  });
});

describe("tick: envio real", () => {
  it("envia com 'digitando', atualiza tudo e marca o início do aquecimento", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { m, conv } = await queue(repo, leads[0]);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toEqual({ action: "sent", messageId: m.id });

    expect(provider.sent).toEqual([{ phone: leads[0].phoneE164, text: `Olá ${leads[0].name}` }]);
    expect(provider.typingCalls).toEqual([[leads[0].phoneE164, true], [leads[0].phoneE164, false]]);
    const sent = await repo.getMessage(m.id);
    expect(sent).toMatchObject({ status: "sent", providerMessageId: "3EB0TEST1", error: null });
    expect((await repo.getConversation(conv.id))!).toMatchObject({ touches: 1, lastOutboundAt: NOW.toISOString() });
    expect((await repo.getLead(leads[0].id))!.stage).toBe("contatado");
    expect((await repo.getSettings()).automation.warmupStart).toBe("2026-10-22");
    expect((await repo.getAutomationState()).lastSendAt).toBe(NOW.toISOString());
    expect((await repo.messageCounts()).prospectingSent).toBe(1);
    expect((await repo.listEvents({ types: ["mensagem_enviada"], limit: 5 })).length).toBe(1);
  });

  it("WhatsApp desconectado: nem pega a mensagem", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    provider.connected = false;
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "offline" });
    expect((await repo.getMessage(m.id))!.status).toBe("approved");
  });

  it("envio real ligado sem GOWA configurado: recusa", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    await queue(repo, leads[0]);
    const r = await tick({ repo, provider: new SimulatedProvider(), now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "offline" });
  });

  it("não envia para quem pediu para parar depois da aprovação", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    repo._addOptout(leads[0].phoneE164!);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "cancelled" });
    expect(provider.sent).toHaveLength(0);
    expect((await repo.getMessage(m.id))!.status).toBe("cancelled");
  });

  it("não envia prospecção em conversa que o dono assumiu, nem para lead perdido", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const a = await queue(repo, leads[0]);
    await repo.updateConversation(a.conv.id, { humanTakenOver: true });
    expect((await tick({ repo, provider, now: NOW, rng, sleep })).action).toBe("cancelled");

    const b = await queue(repo, leads[1]);
    await repo.setStage(leads[1].id, "perdido");
    expect((await tick({ repo, provider, now: plus(NOW, 10 * MIN), rng, sleep })).action).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    expect((await repo.getMessage(b.m.id))!.status).toBe("cancelled");
  });

  it("follow-up não sai se o lead respondeu nesse meio-tempo", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { conv } = await queue(repo, leads[0], { kind: "followup" });
    await repo.updateConversation(conv.id, { lastInboundAt: NOW.toISOString(), touches: 1 });
    expect((await tick({ repo, provider, now: NOW, rng, sleep })).action).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
  });

  it("número sem WhatsApp: cancela e marca o lead", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    provider.onWhatsApp = false;
    await live(repo);
    await queue(repo, leads[0]);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "cancelled", reason: "número sem WhatsApp" });
    expect((await repo.getLead(leads[0].id))!.whatsappStatus).toBe("no");
  });

  it("resposta a quem escreveu sai fora do horário comercial", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const night = new Date("2026-10-22T23:30:00Z");
    const { conv } = await queue(repo, leads[0], { kind: "reply", at: plus(night, -MIN) });
    await repo.updateConversation(conv.id, { lastInboundAt: plus(night, -5 * MIN).toISOString(), status: "awaiting_human" });
    const r = await tick({ repo, provider, now: night, rng, sleep });
    expect(r.action).toBe("sent");
    // resposta não conta como toque de prospecção
    expect((await repo.getConversation(conv.id))!.touches).toBe(0);
    expect((await repo.getLead(leads[0].id))!.stage).toBe("qualificado");
  });

  it("falha passageira: tenta de novo mais tarde; 3 falhas seguidas pausam tudo", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    provider.failWith = new ProviderError("GOWA fora do ar", true);
    await live(repo);
    await repo.saveAutomation({ gapMinSec: 60, gapMaxSec: 60 });
    const { m } = await queue(repo, leads[0]);

    let t = NOW;
    const r1 = await tick({ repo, provider, now: t, rng, sleep });
    expect(r1).toMatchObject({ action: "failed", paused: false });
    const retry = await repo.getMessage(m.id);
    expect(retry!.status).toBe("approved");
    expect(Date.parse(retry!.scheduledFor!)).toBeGreaterThan(t.getTime());
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(1);

    t = plus(t, 10 * MIN);
    await tick({ repo, provider, now: t, rng, sleep });
    t = plus(t, 10 * MIN);
    const r3 = await tick({ repo, provider, now: t, rng, sleep });
    expect(r3).toMatchObject({ action: "failed", paused: true });
    expect((await repo.getSettings()).automation).toMatchObject({ paused: true });
    expect((await repo.getSettings()).automation.pausedReason).toMatch(/falhas de envio seguidas/);
  });

  it("falha definitiva (não vale tentar de novo) marca como falhou", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    provider.failWith = new ProviderError("O GOWA recusou o usuário e a senha", false);
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    await tick({ repo, provider, now: NOW, rng, sleep });
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "failed", error: expect.stringContaining("recusou") });
  });

  it("sucesso zera a contagem de falhas seguidas", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    await repo.saveAutomationState({ consecutiveFailures: 2 });
    await queue(repo, leads[0]);
    await tick({ repo, provider, now: NOW, rng, sleep });
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(0);
  });
});

/** Provedor que deixa o teste agir no meio do envio (o dono clica em Cancelar enquanto o worker está enviando). */
class MidSendProvider extends RecordingProvider {
  onSend: (() => Promise<void>) | null = null;
  async sendText(phone: string, text: string) {
    await this.onSend?.();
    return super.sendText(phone, text);
  }
}

describe("cancelar da Fila", () => {
  it("cancela também a mensagem presa em 'enviando' (o botão não fazia nada com ela)", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0]);
    // o worker pegou e o painel reiniciou antes de terminar: ela fica em "sending" e nada mais a tira de lá
    const claimed = await repo.claimNextDueMessage(NOW.toISOString());
    expect(claimed).toMatchObject({ id: m.id, status: "sending" });

    expect(await cancelMessages(repo, [m.id])).toBe(1);
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "cancelled", error: "cancelada pelo dono" });
    // e o worker não a pega de novo
    await live(repo);
    expect((await tick({ repo, provider: new RecordingProvider(), now: NOW, rng, sleep })).action).toBe("idle");
  });

  it("não cancela o que já saiu", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    await tick({ repo, provider, now: NOW, rng, sleep });
    expect(await cancelMessages(repo, [m.id])).toBe(0);
    expect((await repo.getMessage(m.id))!.status).toBe("sent");
  });

  it("cancelada no meio do envio e a tentativa falha: o worker não a devolve à fila", async () => {
    const { repo, leads } = await setup();
    const provider = new MidSendProvider();
    provider.failWith = new ProviderError("GOWA fora do ar", true);
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    provider.onSend = async () => {
      expect(await cancelMessages(repo, [m.id])).toBe(1);
    };
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "failed" });
    expect((await repo.getMessage(m.id))!.status).toBe("cancelled");
  });

  it("cancelada no meio do envio mas a mensagem saiu: consta como enviada (o que saiu, saiu)", async () => {
    const { repo, leads } = await setup();
    const provider = new MidSendProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    provider.onSend = async () => {
      await cancelMessages(repo, [m.id]);
    };
    expect(await tick({ repo, provider, now: NOW, rng, sleep })).toEqual({ action: "sent", messageId: m.id });
    expect(provider.sent).toHaveLength(1);
    expect((await repo.getMessage(m.id))!.status).toBe("sent");
  });
});

describe("tick: erro depois de pegar a mensagem", () => {
  class BrokenCheckProvider extends RecordingProvider {
    async isOnWhatsApp(): Promise<boolean | null> {
      throw new Error("consulta do GOWA caiu");
    }
  }

  it("devolve a mensagem à fila em vez de deixá-la presa em 'enviando'", async () => {
    const { repo, leads } = await setup();
    const provider = new BrokenCheckProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);

    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "failed", error: "consulta do GOWA caiu", paused: false });
    const back = await repo.getMessage(m.id);
    expect(back).toMatchObject({ status: "approved", error: "consulta do GOWA caiu", attempts: 1 });
    expect(Date.parse(back!.scheduledFor!)).toBeGreaterThan(NOW.getTime());
    expect(provider.sent).toHaveLength(0);
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(1);
  });

  it("depois de 3 tentativas marca como falhou, e erros seguidos pausam a automação", async () => {
    const { repo, leads } = await setup();
    const provider = new BrokenCheckProvider();
    await live(repo);
    await repo.saveAutomation({ gapMinSec: 60, gapMaxSec: 60, maxConsecutiveFailures: 3 });
    const { m } = await queue(repo, leads[0]);

    let t = NOW;
    await tick({ repo, provider, now: t, rng, sleep });
    t = plus(t, 10 * MIN);
    await tick({ repo, provider, now: t, rng, sleep });
    t = plus(t, 10 * MIN);
    const r3 = await tick({ repo, provider, now: t, rng, sleep });
    expect(r3).toMatchObject({ action: "failed", paused: true });
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "failed", attempts: 3 });
    expect((await repo.getSettings()).automation.paused).toBe(true);
  });
});

describe("tick: lote do dia sozinho", () => {
  const BATCH_DAY = "2026-10-22";
  const configure = (repo: MemoryRepo, over: Record<string, unknown> = {}) =>
    repo.saveAutomation({ paused: false, dryRun: false, autonomy: "semi", autoBatch: true, ...over });
  const openings = (repo: MemoryRepo) => repo.listMessages({ kinds: ["opening"], limit: 100 });
  const batchEvents = async (repo: MemoryRepo) => (await repo.listEvents({ types: ["automacao"], limit: 50 })).filter((e) => String(e.payload.text).includes("lote do dia"));

  it("prepara e aprova a Fila uma vez por dia, dentro do teto, e ainda manda a primeira mensagem", async () => {
    const { repo } = await setup();
    await configure(repo);
    const provider = new RecordingProvider();
    await tick({ repo, provider, now: NOW, rng, sleep });
    const list = await openings(repo);
    expect(list).toHaveLength(8); // teto da primeira semana
    expect(list.every((m) => m.status !== "draft")).toBe(true);
    expect((await repo.getAutomationState()).lastAutoBatchDay).toBe(BATCH_DAY);

    await tick({ repo, provider, now: plus(NOW, 5 * MIN), rng, sleep });
    await tick({ repo, provider, now: plus(NOW, 10 * MIN), rng, sleep });
    expect(await openings(repo)).toHaveLength(8);
    expect(await batchEvents(repo)).toHaveLength(1); // não repete a cada volta do worker
  });

  it("no dia seguinte prepara de novo", async () => {
    const { repo } = await setup();
    await configure(repo);
    const provider = new RecordingProvider();
    await tick({ repo, provider, now: NOW, rng, sleep });
    await tick({ repo, provider, now: plus(NOW, DAY), rng, sleep }); // sexta, 10:00
    expect((await repo.getAutomationState()).lastAutoBatchDay).toBe("2026-10-23");
    expect(await batchEvents(repo)).toHaveLength(2);
  });

  it("desligado, no assistido, pausado ou fora do horário: nada é preparado", async () => {
    const provider = new RecordingProvider();
    for (const [name, over, at] of [
      ["autoBatch desligado", { autoBatch: false }, NOW],
      ["modo assistido", { autonomy: "copiloto" }, NOW],
      ["pausado", { paused: true }, NOW],
      ["fora do horário", {}, new Date("2026-10-22T01:30:00Z")], // 22:30 em Fortaleza
    ] as const) {
      const { repo } = await setup();
      await configure(repo, over);
      await tick({ repo, provider, now: at, rng, sleep });
      expect(await openings(repo), name).toHaveLength(0);
      expect((await repo.getAutomationState()).lastAutoBatchDay, name).toBeNull();
    }
  });

  it("lead de demonstração nunca sai de verdade, nem com o lote sozinho", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "demo" });
    const { rows } = await repo.listLeads({ eligible: true, limit: 100, offset: 0 });
    await repo.bulkSetStage(rows.map((x) => x.id), "qualificado");
    await configure(repo);
    const provider = new RecordingProvider();
    await tick({ repo, provider, now: NOW, rng, sleep });
    // em modo demonstração o lote nasce; o envio real de lead fictício continua barrado no worker
    expect(provider.sent).toHaveLength(0);
  });
});

describe("reabrir mensagem cancelada", () => {
  it("volta para rascunho, sem horário, e ao aprovar ganha horário novo", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0], { at: plus(NOW, 15 * 3_600_000) }); // agendada para amanhã de manhã
    await cancelMessages(repo, [m.id]);
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "cancelled" });

    expect(await reopenMessages(repo, [m.id])).toEqual({ reopened: 1, skipped: 0 });
    const reopened = (await repo.getMessage(m.id))!;
    expect(reopened).toMatchObject({ status: "draft", scheduledFor: null, approvedAt: null, error: null });

    // nada sai: rascunho não é enviado nem pelo worker
    await live(repo);
    expect(await tick({ repo, provider: new RecordingProvider(), now: NOW, rng, sleep })).toEqual({ action: "idle" });

    // aprovar de novo marca um horário novo
    await approveMessages(repo, [m.id], NOW, rng);
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "approved" });
    expect((await repo.getMessage(m.id))!.scheduledFor).not.toBeNull();
  });

  it("não reabre o que não está cancelado, o que não existe nem quem pediu para não receber", async () => {
    const { repo, leads } = await setup();
    const { m: approved } = await queue(repo, leads[0]);
    const { m: blocked, conv } = await queue(repo, leads[1]);
    await cancelMessages(repo, [blocked.id]);
    await repo.addOptout(conv.phoneE164, "PARE");

    const r = await reopenMessages(repo, [approved.id, blocked.id, "00000000-0000-4000-8000-000000000000"]);
    expect(r).toEqual({ reopened: 0, skipped: 3 });
    expect((await repo.getMessage(approved.id))!.status).toBe("approved");
    expect((await repo.getMessage(blocked.id))!.status).toBe("cancelled");
  });

  it("conversa marcada como bloqueada também não reabre", async () => {
    const { repo, leads } = await setup();
    const { m, conv } = await queue(repo, leads[0]);
    await cancelMessages(repo, [m.id]);
    await repo.updateConversation(conv.id, { status: "opted_out" });
    expect(await reopenMessages(repo, [m.id])).toEqual({ reopened: 0, skipped: 1 });
  });
});

describe("prévia enviada", () => {
  async function withLinkedReply() {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const demo = await generateDemo(repo, lead.id, { settings: await repo.getSettings() });
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const [m] = await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "out",
        kind: "reply",
        body: `Aqui está: https://x.app/p/${demo.slug} o que achou?`,
        status: "approved",
        createdBy: "user",
        scheduledFor: plus(NOW, -MIN).toISOString(),
      },
    ]);
    return { repo, lead, demo, m };
  }

  it("a prévia só consta como enviada quando a mensagem com o link sai DE VERDADE", async () => {
    const { repo, demo } = await withLinkedReply();
    await live(repo);
    const provider = new RecordingProvider();
    expect(await tick({ repo, provider, now: NOW, rng, sleep })).toMatchObject({ action: "sent" });
    expect((await repo.getDemo(demo.id))!.sentAt).toBe(NOW.toISOString());
  });

  it("em simulação nada sai, então a prévia continua sem data de envio", async () => {
    const { repo, demo } = await withLinkedReply();
    await repo.saveAutomation({ paused: false, dryRun: true });
    expect(await tick({ repo, provider: new SimulatedProvider(), now: NOW, rng, sleep })).toMatchObject({ action: "simulated" });
    expect((await repo.getDemo(demo.id))!.sentAt).toBeNull();
  });

  it("link de prévia de OUTRO lead não marca a prévia deste", async () => {
    const { repo, leads } = await setup();
    const [a, b] = leads;
    const demoB = await generateDemo(repo, b.id, { settings: await repo.getSettings() });
    const conv = await repo.ensureConversation(a.id, a.phoneE164!);
    await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: a.id,
        direction: "out",
        kind: "reply",
        body: `https://x.app/p/${demoB.slug}`,
        status: "approved",
        createdBy: "user",
        scheduledFor: plus(NOW, -MIN).toISOString(),
      },
    ]);
    await live(repo);
    await tick({ repo, provider: new RecordingProvider(), now: NOW, rng, sleep });
    expect((await repo.getDemo(demoB.id))!.sentAt).toBeNull();
  });
});

describe("respostas que chegam", () => {
  const inbound = (phone: string, text: string | null, over: Partial<Extract<WebhookEvent, { kind: "message" }>> = {}): Extract<WebhookEvent, { kind: "message" }> => ({
    kind: "message",
    providerMessageId: `IN${Math.random().toString(36).slice(2, 10)}`,
    phoneE164: phone,
    fromMe: false,
    text,
    media: null,
    timestamp: null,
    ...over,
  });

  async function contacted() {
    const ctx = await setup();
    const lead = ctx.leads[0];
    const { conv, m } = await queue(ctx.repo, lead, { status: "approved" });
    await ctx.repo.updateMessage(m.id, { status: "sent", sentAt: NOW.toISOString(), providerMessageId: "OUT1" });
    await ctx.repo.setStage(lead.id, "contatado");
    await ctx.repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: NOW.toISOString() });
    return { ...ctx, lead, conv };
  }

  it("número desconhecido é ignorado", async () => {
    const { repo } = await contacted();
    expect(await handleMessageEvent(repo, inbound("+5585900000000", "oi"), NOW)).toMatchObject({ handled: false });
  });

  it("a resposta vem do número SEM o 9, mas o painel guardou COM o 9: acha a conversa mesmo assim", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await repo.ensureConversation(lead.id, "+5546991287444"); // como o painel guarda (com o 9)
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "oi", status: "sent", createdBy: "system", sentAt: NOW.toISOString() },
    ]);

    const r = await handleMessageEvent(repo, inbound("+554691287444", "pode"), plus(NOW, MIN)); // como o WhatsApp devolve
    expect(r).toMatchObject({ handled: true, intent: "interested" });
    expect((await repo.getConversation(conv.id))!.unread).toBe(1);
    expect(await handleMessageEvent(repo, inbound("+554691999999", "oi"), plus(NOW, 2 * MIN))).toMatchObject({ handled: false });
  });

  it("interessado: guarda, avisa o dono, move para Respondeu e rascunha a resposta", async () => {
    const { repo, lead, conv } = await contacted();
    const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode sim, manda aí"), plus(NOW, 5 * MIN));
    expect(r).toMatchObject({ handled: true, intent: "interested", optout: false, draftedReply: true });

    expect(await repo.getConversation(conv.id)).toMatchObject({ status: "awaiting_human", unread: 1 });
    expect((await repo.getLead(lead.id))!.stage).toBe("respondeu");
    const inMsgs = await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 5 });
    expect(inMsgs[0]).toMatchObject({ body: "Pode sim, manda aí", intent: "interested", status: "received", createdBy: "lead" });
    const drafts = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ kind: "reply", createdBy: "system" });
    expect((await repo.listEvents({ types: ["resposta_recebida"], limit: 5 })).length).toBe(1);
  });

  it("interessado com prévia no ar e endereço público: o rascunho já leva o link", async () => {
    const { repo, lead, conv } = await contacted();
    const demo = await generateDemo(repo, lead.id, { settings: await repo.getSettings() });
    await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode sim, manda aí"), plus(NOW, 5 * MIN), {
      publicBaseUrl: "https://painel.exemplo.com/",
    });
    const [draft] = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(draft.body).toContain(`https://painel.exemplo.com/p/${demo.slug}`);
  });

  it("sem endereço público ou com a prévia fora do ar, o rascunho não leva link", async () => {
    const a = await contacted();
    const demo = await generateDemo(a.repo, a.lead.id, { settings: await a.repo.getSettings() });
    await handleMessageEvent(a.repo, inbound(a.lead.phoneE164!, "Pode sim"), plus(NOW, 5 * MIN));
    const [d1] = await a.repo.listMessages({ conversationId: a.conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(d1.body).not.toContain("/p/");

    const b = await contacted();
    const archived = await generateDemo(b.repo, b.lead.id, { settings: await b.repo.getSettings() });
    await b.repo.updateDemo(archived.id, { status: "archived" });
    await handleMessageEvent(b.repo, inbound(b.lead.phoneE164!, "Pode sim"), plus(NOW, 5 * MIN), { publicBaseUrl: "https://x.app" });
    const [d2] = await b.repo.listMessages({ conversationId: b.conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(d2.body).not.toContain("/p/");
    expect(demo.slug).not.toBe(archived.slug);
  });

  it("cancela follow-ups pendentes de quem respondeu", async () => {
    const { repo, lead, conv } = await contacted();
    const [fu] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "followup", step: 1, body: "oi de novo", status: "approved", createdBy: "system", scheduledFor: plus(NOW, DAY).toISOString() },
    ]);
    await handleMessageEvent(repo, inbound(lead.phoneE164!, "quanto custa?"), plus(NOW, MIN));
    expect(await repo.getMessage(fu.id)).toMatchObject({ status: "cancelled", error: "o lead respondeu" });
  });

  it("PARE: bloqueia o número, perde o lead, cancela o resto e não deixa rascunho que não poderia sair", async () => {
    const { repo, lead, conv } = await contacted();
    const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN));
    expect(r).toMatchObject({ intent: "optout", optout: true, draftedReply: false });

    expect((await repo.findOptouts([lead.phoneE164!])).has(lead.phoneE164!)).toBe(true);
    expect((await repo.getConversation(conv.id))!.status).toBe("opted_out");
    expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
    expect(await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 })).toHaveLength(0);
    expect((await repo.listEvents({ types: ["optout"], limit: 5 })).length).toBe(1);

    // mesmo que alguém aprove uma mensagem para esse número à mão, o worker nunca envia
    const provider = new RecordingProvider();
    await live(repo);
    const [manual] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "reply", body: "oi", status: "approved", createdBy: "user", scheduledFor: NOW.toISOString() },
    ]);
    expect((await tick({ repo, provider, now: plus(NOW, 10 * MIN), rng, sleep })).action).toBe("cancelled");
    expect((await repo.getMessage(manual.id))!.status).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
  });

  it("depois do PARE a conversa continua bloqueada, mesmo que a pessoa escreva de novo", async () => {
    const { repo, lead, conv } = await contacted();
    await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN));

    const later = await handleMessageEvent(repo, inbound(lead.phoneE164!, "kkkk tudo bem? pode sim"), plus(NOW, 5 * MIN));
    expect(later).toMatchObject({ handled: true, optout: false, draftedReply: false });
    const after = (await repo.getConversation(conv.id))!;
    expect(after.status).toBe("opted_out"); // não vira "Precisa de você"
    expect(after.unread).toBe(2); // mas o dono ainda vê que chegou mensagem
    expect((await repo.getLead(lead.id))!.stage).toBe("perdido"); // não volta para "Respondeu"
    expect(await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 })).toHaveLength(0);
    expect((await repo.findOptouts([lead.phoneE164!])).has(lead.phoneE164!)).toBe(true);
  });

  it("sem interesse: encerra a conversa e perde o lead", async () => {
    const { repo, lead, conv } = await contacted();
    await handleMessageEvent(repo, inbound(lead.phoneE164!, "Não tenho interesse, obrigado"), plus(NOW, MIN));
    expect((await repo.getConversation(conv.id))!.status).toBe("closed");
    expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
  });

  it("preço: rascunho cita o ticket médio das configurações", async () => {
    const { repo, lead, conv } = await contacted();
    await repo.saveSettings({ ticketAverage: 900 });
    await handleMessageEvent(repo, inbound(lead.phoneE164!, "Qual o valor?"), plus(NOW, MIN));
    const [draft] = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(draft.body).toMatch(/R\$\s?900/);
  });

  it("áudio: vai para o dono e nada sai para o lead (o agente não pede para escrever, quem ouve é você)", async () => {
    const { repo, lead, conv } = await contacted();
    const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, null, { media: "audio" }), plus(NOW, MIN));
    expect(r).toMatchObject({ handled: true, intent: "audio", draftedReply: false });
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    expect(await repo.listMessages({ conversationId: conv.id, direction: "out", kinds: ["reply"], limit: 5 })).toHaveLength(0);
  });

  it("imagem: no assistido vira rascunho pedindo para escrever; figurinha não pede resposta", async () => {
    const { repo, lead, conv } = await contacted();
    const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, null, { media: "image" }), plus(NOW, MIN));
    expect(r).toMatchObject({ handled: true, intent: "media", draftedReply: true });
    const [draft] = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 });
    expect(draft.body).toMatch(/por escrito/);

    const s = await contacted();
    const rs = await handleMessageEvent(s.repo, inbound(s.lead.phoneE164!, null, { media: "sticker" }), plus(NOW, MIN));
    expect(rs).toMatchObject({ handled: true, draftedReply: false });
    expect(await s.repo.listMessages({ conversationId: s.conv.id, direction: "out", statuses: ["draft"], limit: 5 })).toHaveLength(0);
  });

  describe("atendimento sozinho (nível 3)", () => {
    const semi = (repo: MemoryRepo, over: Record<string, unknown> = {}) => repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false, ...over });
    const outs = (repo: MemoryRepo, convId: string) => repo.listMessages({ conversationId: convId, direction: "out", kinds: ["reply"], order: "asc", limit: 20 });
    const SEC = 1000;

    it("responde sozinho o que é seguro: já nasce aprovada, com hora de gente, marcada como do agente, e a conversa não pede você", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "Como funciona?"), plus(NOW, MIN), { rng });
      expect(r).toMatchObject({ handled: true, draftedReply: true, repliedAlone: true });
      const [m] = await outs(repo, conv.id);
      expect(m).toMatchObject({ status: "approved", variant: "agente+auto:how_works", createdBy: "system" });
      const wait = Date.parse(m.scheduledFor!) - plus(NOW, MIN).getTime();
      expect(wait).toBeGreaterThanOrEqual(20 * SEC);
      expect(wait).toBeLessThanOrEqual(90 * SEC);
      expect((await repo.getConversation(conv.id))!.status).toBe("active");
      expect((await repo.listEvents({ types: ["automacao"], limit: 10 })).some((e) => String(e.payload.text).includes("respondeu sozinho"))).toBe(true);
    });

    it("de ponta a ponta: o worker manda a resposta do agente na hora marcada", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Quanto custa e quanto tempo demora?"), plus(NOW, MIN), { rng });
      const provider = new RecordingProvider();
      const t = await tick({ repo, provider, now: plus(NOW, 5 * MIN), rng, sleep });
      expect(t.action).toBe("sent");
      expect(provider.sent).toHaveLength(1);
      expect(provider.sent[0].text).toMatch(/R\$\s?800/);
      expect((await outs(repo, conv.id))[0].status).toBe("sent");
    });

    it("no modo assistido nada sai sozinho", async () => {
      const { repo, lead, conv } = await contacted();
      await repo.saveAutomation({ autonomy: "copiloto", paused: false, dryRun: false });
      const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "Como funciona?"), plus(NOW, MIN), { rng });
      expect(r).toMatchObject({ draftedReply: true, repliedAlone: false });
      expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "draft", variant: "agente:how_works" });
      expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    });

    it("com a automação pausada fica rascunho (não deixa resposta velha esperando para sair depois)", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo, { paused: true });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Como funciona?"), plus(NOW, MIN), { rng });
      expect((await outs(repo, conv.id))[0].status).toBe("draft");
    });

    it("o que é do dono continua com ele enquanto ele não escreveu a resposta: garantia, domínio, exemplos, achou caro, fora do roteiro", async () => {
      for (const [text, media] of [["Tem garantia?", null], ["Precisa pagar domínio?", null], ["Tem exemplos de sites?", null], ["Achei caro", null], ["Vocês fazem loja virtual?", null]] as const) {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        await handleMessageEvent(repo, inbound(lead.phoneE164!, text, { media }), plus(NOW, MIN), { rng });
        const sent = (await outs(repo, conv.id)).filter((m) => m.status !== "draft");
        expect(sent, String(text ?? media)).toHaveLength(0);
        expect((await repo.getConversation(conv.id))!.status, String(text ?? media)).toBe("awaiting_human");
      }
    });

    it("imagem: o agente pede para escrever sozinho e a conversa continua pedindo você; áudio não recebe nada, só chama você", async () => {
      {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, null, { media: "image" }), plus(NOW, MIN), { rng });
        expect(r).toMatchObject({ draftedReply: true, repliedAlone: true });
        const [m] = await outs(repo, conv.id);
        expect(m).toMatchObject({ status: "approved", variant: "agente+auto:media" });
        expect(m.body).toMatch(/por escrito/);
        expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      }
      {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, null, { media: "audio" }), plus(NOW, MIN), { rng });
        expect(r).toMatchObject({ draftedReply: false });
        expect(await outs(repo, conv.id)).toHaveLength(0);
        expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      }
    });

    describe("perguntas livres e respostas do dono", () => {
      const llm = (reply: string | null, needed = false) => ({
        name: "fake",
        model: "fake",
        async complete() {
          return JSON.stringify({ reply, topic: "other", asked: null, handoff: { needed, reason: needed ? "Confirmar com o dono." : null } });
        },
      });
      const ask = "Vocês fazem loja virtual?";

      it("a IA responde sozinha o que as regras não conhecem, e a conversa não pede você", async () => {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, ask), plus(NOW, MIN), {
          rng,
          agent: { llm: llm("Meu foco é site de uma página, mas posso ver o que você precisa. Quer que eu monte a prévia?") },
        });
        expect(r).toMatchObject({ draftedReply: true, repliedAlone: true });
        const [m] = await outs(repo, conv.id);
        expect(m).toMatchObject({ status: "approved", variant: "agente-ia+auto:other" });
        expect((await repo.getConversation(conv.id))!.status).toBe("active");
      });

      it("se a própria IA diz que precisa confirmar, a resposta sai mas a conversa segue em 'Precisa de você'", async () => {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, ask), plus(NOW, MIN), {
          rng,
          agent: { llm: llm("Sobre loja virtual eu preciso confirmar um detalhe e já te respondo.", true) },
        });
        expect(r).toMatchObject({ repliedAlone: true });
        expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "approved" });
        expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      });

      it("com 'Responde perguntas livres' desligado, a resposta da IA vira rascunho", async () => {
        const { repo, lead, conv } = await contacted();
        await semi(repo, { autoFreeform: false });
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, ask), plus(NOW, MIN), {
          rng,
          agent: { llm: llm("Meu foco é site de uma página. Quer que eu monte a prévia?") },
        });
        expect(r).toMatchObject({ draftedReply: true, repliedAlone: false });
        expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "draft", variant: "agente-ia:other" });
        expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      });

      it("se a IA reprovar na trava ou preferir calar, nada sai sozinho", async () => {
        const a = await contacted();
        await semi(a.repo);
        await handleMessageEvent(a.repo, inbound(a.lead.phoneE164!, ask), plus(NOW, MIN), { rng, agent: { llm: llm("Fazemos por R$ 99 hoje mesmo!") } });
        expect(await outs(a.repo, a.conv.id)).toHaveLength(0);
        expect((await a.repo.getConversation(a.conv.id))!.status).toBe("awaiting_human");

        const b = await contacted();
        await semi(b.repo);
        await handleMessageEvent(b.repo, inbound(b.lead.phoneE164!, ask), plus(NOW, MIN), { rng, agent: { llm: llm(null, true) } });
        expect(await outs(b.repo, b.conv.id)).toHaveLength(0);
      });

      it("sem IA, a pergunta fora do roteiro continua esperando por você", async () => {
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        await handleMessageEvent(repo, inbound(lead.phoneE164!, ask), plus(NOW, MIN), { rng });
        expect(await outs(repo, conv.id)).toHaveLength(0);
        expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      });

      it("a resposta que o dono escreveu em Configurações sai sozinha, do jeito que ele escreveu", async () => {
        const text = "Você só paga o restante se aprovar o site pronto. Uma rodada de ajustes está incluída.";
        const { repo, lead, conv } = await contacted();
        await semi(repo);
        await repo.saveSettings({ policyGuarantee: text });
        // mesmo com IA ligada, o texto do dono não é reescrito
        const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "Tem garantia?"), plus(NOW, MIN), { rng, agent: { llm: llm("Garantia total de 100%!") } });
        expect(r).toMatchObject({ repliedAlone: true });
        const [m] = await outs(repo, conv.id);
        expect(m).toMatchObject({ status: "approved", variant: "agente+auto:guarantee" });
        expect(m.body).toContain(text);
        expect((await repo.getConversation(conv.id))!.status).toBe("active");
      });

      it("desconto escrito pelo dono (com valor próprio) sai sozinho; sem a resposta dele continua rascunho", async () => {
        const a = await contacted();
        await semi(a.repo);
        await a.repo.saveSettings({ policyPrice: "Entendo. Se fechar esta semana, faço por R$ 700." });
        await handleMessageEvent(a.repo, inbound(a.lead.phoneE164!, "Achei caro"), plus(NOW, MIN), { rng });
        const [m] = await outs(a.repo, a.conv.id);
        expect(m).toMatchObject({ status: "approved", variant: "agente+auto:too_expensive" });
        expect(m.body).toMatch(/R\$ 700/);

        const b = await contacted();
        await semi(b.repo);
        await handleMessageEvent(b.repo, inbound(b.lead.phoneE164!, "Achei caro"), plus(NOW, MIN), { rng });
        expect((await outs(b.repo, b.conv.id))[0]).toMatchObject({ status: "draft" });
      });

      it("a resposta do dono não sai no modo assistido: vira rascunho para ele aprovar", async () => {
        const { repo, lead, conv } = await contacted();
        await repo.saveSettings({ policyGuarantee: "Você só paga o restante se aprovar." });
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Tem garantia?"), plus(NOW, MIN), { rng });
        expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "draft", variant: "agente:guarantee" });
      });
    });

    it("dinheiro só com o fechamento sozinho ligado", async () => {
      const setup = async (autoClose: boolean) => {
        const ctx = await contacted();
        await semi(ctx.repo, { autoClose });
        const demo = await generateDemo(ctx.repo, ctx.lead.id, { settings: await ctx.repo.getSettings() });
        await ctx.repo.updateDemo(demo.id, { sentAt: NOW.toISOString() });
        await handleMessageEvent(ctx.repo, inbound(ctx.lead.phoneE164!, "Gostei muito!"), plus(NOW, MIN), { rng });
        return outs(ctx.repo, ctx.conv.id);
      };
      const off = await setup(false);
      expect(off[0]).toMatchObject({ status: "draft" });
      expect(off[0].body).toMatch(/R\$\s?800/);
      const on = await setup(true);
      expect(on[0]).toMatchObject({ status: "approved", variant: "agente+auto:compliment" });
    });

    it("tetos: por conversa e por dia, e depois disso volta a ser rascunho", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo, { autoMaxPerConversation: 2 });
      for (const [i, text] of ["Como funciona?", "Quanto tempo demora?", "Quem é você?"].entries()) {
        await handleMessageEvent(repo, inbound(lead.phoneE164!, text), plus(NOW, (i + 1) * MIN), { rng });
      }
      const list = await outs(repo, conv.id);
      expect(list.filter((m) => m.status === "approved")).toHaveLength(2);
      expect(list.filter((m) => m.status === "draft")).toHaveLength(1);

      const day = await contacted();
      await semi(day.repo, { autoMaxPerDay: 1 });
      await handleMessageEvent(day.repo, inbound(day.lead.phoneE164!, "Como funciona?"), plus(NOW, MIN), { rng });
      const other = day.leads[1];
      const c2 = await day.repo.ensureConversation(other.id, other.phoneE164!);
      await day.repo.createMessages([{ conversationId: c2.id, leadId: other.id, direction: "out", kind: "opening", body: "oi", status: "sent", createdBy: "system", sentAt: NOW.toISOString() }]);
      await handleMessageEvent(day.repo, inbound(other.phoneE164!, "Como funciona?"), plus(NOW, 2 * MIN), { rng });
      expect((await outs(day.repo, c2.id))[0].status).toBe("draft");
    });

    it("se o dono assumiu a conversa (respondeu pelo celular), o agente não responde mais sozinho", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      await repo.updateConversation(conv.id, { humanTakenOver: true });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Como funciona?"), plus(NOW, MIN), { rng });
      expect((await outs(repo, conv.id))[0].status).toBe("draft");
    });

    it("fora do horário a resposta espera a próxima janela, não sai de madrugada", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      const night = new Date("2026-10-22T01:30:00Z"); // 22:30 em Fortaleza, quinta
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Como funciona?"), night, { rng });
      const [m] = await outs(repo, conv.id);
      expect(m.status).toBe("approved");
      const at = new Date(m.scheduledFor!);
      expect(inWindow(at, (await repo.getSettings()).automation)).toBe(true);
      expect(at.getTime() - night.getTime()).toBeGreaterThan(8 * 3600_000);
    });

    it("a trava de fatos roda de novo antes de sair sozinho: preço errado nas Configurações não é o problema, valor inventado é", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      const liar = {
        name: "fake",
        model: "fake",
        async complete() {
          return JSON.stringify({ reply: "Fazemos por R$ 99 hoje mesmo. Quer ver a prévia?", topic: "price", asked: null, handoff: { needed: false, reason: null } });
        },
      };
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "quanto custa?"), plus(NOW, MIN), { rng, agent: { llm: liar } });
      const [m] = await outs(repo, conv.id);
      expect(m.body).not.toMatch(/R\$\s?99/); // a trava da IA já derrubou e valeu a resposta das regras
      expect(m.body).toMatch(/R\$\s?800/);
    });

    it("lead diz 'pode' com endereço público: a prévia nasce sozinha e o link vai na resposta; sem endereço público não gera nada", async () => {
      const a = await contacted();
      await semi(a.repo);
      await handleMessageEvent(a.repo, inbound(a.lead.phoneE164!, "Pode sim"), plus(NOW, MIN), { rng, publicBaseUrl: "https://painel.exemplo.com" });
      const demos = await a.repo.listDemos({ leadId: a.lead.id, limit: 5 });
      expect(demos).toHaveLength(1);
      const [m] = await outs(a.repo, a.conv.id);
      expect(m).toMatchObject({ status: "approved", variant: "agente+auto:yes" });
      expect(m.body).toContain(`https://painel.exemplo.com/p/${demos[0].slug}`);

      const b = await contacted();
      await semi(b.repo);
      await handleMessageEvent(b.repo, inbound(b.lead.phoneE164!, "Pode sim"), plus(NOW, MIN), { rng });
      expect(await b.repo.listDemos({ leadId: b.lead.id, limit: 5 })).toHaveLength(0);
      const [mb] = await outs(b.repo, b.conv.id);
      expect(mb.body).not.toContain("/p/");
      expect(mb.variant).toBe("agente+auto:q-objetivo");
    });

    describe("fechamento sozinho", () => {
      const KEY = "85988887777";
      const setup = async (over: Record<string, unknown> = {}, pixKey: string = KEY) => {
        const ctx = await contacted();
        await semi(ctx.repo, { autoClose: true, ...over });
        await ctx.repo.saveSettings({ pixKey, pixHolder: "Jonathan K." });
        const demo = await generateDemo(ctx.repo, ctx.lead.id, { settings: await ctx.repo.getSettings() });
        await ctx.repo.updateDemo(demo.id, { sentAt: NOW.toISOString() });
        return ctx;
      };
      const all = (repo: MemoryRepo, convId: string) => outs(repo, convId);

      it("gostou → oferta com valor, sinal e prazo; aceitou → cria a proposta e passa o Pix; dono só marca o sinal", async () => {
        const { repo, lead, conv } = await setup();
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Gostei muito!"), plus(NOW, MIN), { rng });
        const offer = (await all(repo, conv.id)).find((m) => m.variant === "agente+auto:compliment")!;
        expect(offer).toMatchObject({ status: "approved" });
        expect(offer.body).toMatch(/R\$\s?800[\s\S]*7 dias[\s\S]*50%[\s\S]*Pix/);
        expect(offer.body).not.toContain(KEY); // a chave só vai depois do aceite
        expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);

        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode passar o Pix"), plus(NOW, 3 * MIN), { rng });
        const [proposal] = await repo.listProposals({ leadId: lead.id, limit: 5 });
        expect(proposal).toMatchObject({ status: "sent", amountCents: 80_000, entryPct: 50, deliveryDays: 7, title: "Site de 1 página" });
        expect((await repo.getLead(lead.id))!.stage).toBe("proposta");
        const pix = (await all(repo, conv.id)).find((m) => m.variant === "agente+auto:payment")!;
        expect(pix).toMatchObject({ status: "approved" });
        expect(pix.body).toContain(KEY);
        expect(pix.body).toMatch(/R\$\s?400/);
        expect((await repo.listEvents({ types: ["automacao"], limit: 20 })).some((e) => String(e.payload.text).includes("criou a proposta"))).toBe(true);
      });

      it("um 'pode' antes de o lead ter visto a oferta NÃO cria proposta nem manda Pix", async () => {
        const { repo, lead, conv } = await setup();
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode fechar"), plus(NOW, MIN), { rng });
        expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);
        const [first] = await all(repo, conv.id);
        expect(first.body).toMatch(/R\$\s?800/); // a primeira resposta é a oferta, com o valor
        expect(first.body).not.toContain(KEY);
      });

      it("sem 'Pode fechar sozinho' nada de dinheiro sai sozinho nem a proposta é criada", async () => {
        const { repo, lead, conv } = await setup({ autoClose: false });
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Gostei muito!"), plus(NOW, MIN), { rng });
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode passar o Pix"), plus(NOW, 3 * MIN), { rng });
        expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);
        const list = await all(repo, conv.id);
        expect(list.find((m) => m.variant === "agente:compliment")).toMatchObject({ status: "draft" }); // a oferta com valor é dinheiro: espera você
        expect(list.some((m) => m.body.includes(KEY))).toBe(false); // e a chave Pix nunca sai sem o fechamento ligado
      });

      it("sem chave Pix cadastrada não fecha sozinho: fica rascunho para você", async () => {
        const { repo, lead, conv } = await setup({}, "");
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Gostei muito!"), plus(NOW, MIN), { rng });
        await handleMessageEvent(repo, inbound(lead.phoneE164!, "Pode passar o Pix"), plus(NOW, 3 * MIN), { rng });
        expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);
        expect((await all(repo, conv.id)).filter((m) => m.body.includes("85988887777"))).toHaveLength(0);
      });
    });

    it("quem pediu PARE nunca recebe resposta, nem sozinha", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN), { rng });
      expect(r).toMatchObject({ optout: true, draftedReply: false });
      expect(await outs(repo, conv.id)).toHaveLength(0);
    });
  });

  describe("desbloquear número", () => {
    const outs = (repo: MemoryRepo, convId: string) => repo.listMessages({ conversationId: convId, direction: "out", kinds: ["reply"], order: "asc", limit: 30 });
    const semi = (repo: MemoryRepo) => repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false });

    it("quem pediu PARE e voltou a escrever: o dono libera e o agente responde o que ficou sem resposta, e o worker manda", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN), { rng });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Na verdade, como funciona?"), plus(NOW, 5 * MIN), { rng }); // escreveu bloqueado
      expect((await repo.getConversation(conv.id))!.status).toBe("opted_out");
      expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
      expect(await outs(repo, conv.id)).toHaveLength(0); // bloqueado: ninguém responde

      const r = await unblockLead(repo, lead.id, plus(NOW, 10 * MIN), { rng });
      expect(r).toMatchObject({ unblocked: true, answered: true, repliedAlone: true });
      expect((await repo.findOptouts([lead.phoneE164!])).size).toBe(0);
      const c = (await repo.getConversation(conv.id))!;
      expect(c).toMatchObject({ status: "active", humanTakenOver: false });
      expect((await repo.getLead(lead.id))!.stage).toBe("respondeu"); // saiu de Perdido
      const [m] = await outs(repo, conv.id);
      expect(m).toMatchObject({ status: "approved", variant: "agente+auto:how_works" });

      const provider = new RecordingProvider();
      const t = await tick({ repo, provider, now: plus(NOW, 30 * MIN), rng, sleep });
      expect(t.action).toBe("sent");
      expect(provider.sent).toHaveLength(1);
    });

    it("no modo assistido a resposta à mensagem pendente vira rascunho para você aprovar", async () => {
      const { repo, lead, conv } = await contacted();
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN));
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "como funciona?"), plus(NOW, 5 * MIN));
      const r = await unblockLead(repo, lead.id, plus(NOW, 10 * MIN));
      expect(r).toMatchObject({ unblocked: true, answered: true, repliedAlone: false });
      expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "draft", variant: "agente:how_works" });
      expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    });

    it("se a última coisa foi o próprio PARE, só libera: nada é respondido agora, e a próxima mensagem dele já é atendida", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN), { rng });
      const r = await unblockLead(repo, lead.id, plus(NOW, 10 * MIN), { rng });
      expect(r).toMatchObject({ unblocked: true, answered: false });
      expect(await outs(repo, conv.id)).toHaveLength(0);
      expect((await repo.getConversation(conv.id))!.status).toBe("active");

      const later = await handleMessageEvent(repo, inbound(lead.phoneE164!, "oi, quero ver como funciona"), plus(NOW, 60 * MIN), { rng });
      expect(later).toMatchObject({ handled: true, repliedAlone: true });
      expect((await outs(repo, conv.id))[0]).toMatchObject({ status: "approved" });
    });

    it("bloqueio manual também pode ser desfeito; quem nunca respondeu volta para Contatado", async () => {
      const { repo, lead, conv } = await contacted();
      await blockLead(repo, lead.id, "bloqueado manualmente pelo dono");
      expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
      const r = await unblockLead(repo, lead.id, plus(NOW, MIN));
      expect(r.unblocked).toBe(true);
      expect((await repo.getLead(lead.id))!.stage).toBe("contatado");
      expect((await repo.getConversation(conv.id))!.status).toBe("active");
    });

    it("número que não está bloqueado não é mexido", async () => {
      const { repo, lead } = await contacted();
      const r = await unblockLead(repo, lead.id, plus(NOW, MIN));
      expect(r).toMatchObject({ unblocked: false, reason: expect.stringMatching(/não está bloqueado/) });
    });

    it("quem disse 'sem interesse' depois de bloqueado não recebe resposta ao ser liberado", async () => {
      const { repo, lead, conv } = await contacted();
      await semi(repo);
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "PARE"), plus(NOW, MIN), { rng });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "não tenho interesse"), plus(NOW, 5 * MIN), { rng });
      const r = await unblockLead(repo, lead.id, plus(NOW, 10 * MIN), { rng });
      expect(r).toMatchObject({ unblocked: true, answered: false });
      expect(await outs(repo, conv.id)).toHaveLength(0);
    });
  });

  describe("fluxo qualificar (sem prévia automática)", () => {
    const KEY = "85988887777";
    const OFFER_BODY = /R\$\s?800[\s\S]*7 dias[\s\S]*50%[\s\S]*Pix/;
    const flow = async (opts: { autoClose?: boolean; pix?: boolean } = {}) => {
      const ctx = await contacted();
      await ctx.repo.saveSettings({ agentFlow: "qualificar", ...(opts.pix === false ? {} : { pixKey: KEY, pixHolder: "Jonathan K." }) });
      await ctx.repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false, autoClose: opts.autoClose ?? true });
      return ctx;
    };
    const outs = (repo: MemoryRepo, convId: string) => repo.listMessages({ conversationId: convId, direction: "out", kinds: ["reply"], order: "asc", limit: 30 });
    const say = (repo: MemoryRepo, phone: string, text: string | null, minute: number, over: Partial<Extract<WebhookEvent, { kind: "message" }>> = {}, opts: Parameters<typeof handleMessageEvent>[3] = {}) =>
      handleMessageEvent(repo, inbound(phone, text, over), plus(NOW, minute * MIN), { rng, ...opts });

    it("as abordagens novas não oferecem prévia", async () => {
      const { repo } = await setup();
      await repo.saveSettings({ agentFlow: "qualificar" });
      await prepareBatch(repo, NOW);
      const msgs = await repo.listMessages({ kinds: ["opening"], limit: 100 });
      expect(msgs.length).toBeGreaterThan(0);
      for (const m of msgs) {
        expect(m.body).not.toMatch(/pr[eé]via/i);
        expect(m.body).not.toMatch(/PARE/);
      }
    });

    it("'pode': o agente pergunta o que ele quer, sozinho, e não gera prévia mesmo com endereço público", async () => {
      const { repo, lead, conv } = await flow();
      const r = await say(repo, lead.phoneE164!, "Pode sim", 1, {}, { publicBaseUrl: "https://painel.exemplo.com" });
      expect(r).toMatchObject({ repliedAlone: true });
      expect(await repo.listDemos({ leadId: lead.id, limit: 5 })).toHaveLength(0);
      const [m] = await outs(repo, conv.id);
      expect(m).toMatchObject({ status: "approved", variant: "agente+auto:q-tipo" });
      expect(m.body).toMatch(/landing page/);
      expect(m.body).not.toMatch(/pr[eé]via/i);
    });

    it("site: qualifica, faz a oferta, e o aceite cria a proposta e passa o Pix, tudo sem prévia", async () => {
      const { repo, lead, conv } = await flow();
      await say(repo, lead.phoneE164!, "quero um site para a minha clínica", 1);
      await say(repo, lead.phoneE164!, "quero receber mais contatos pelo WhatsApp", 3);
      // depois do objetivo vem o material, e só então a oferta
      expect((await outs(repo, conv.id)).some((m) => m.variant === "agente+auto:q-material")).toBe(true);
      expect((await outs(repo, conv.id)).some((m) => OFFER_BODY.test(m.body))).toBe(false);
      await say(repo, lead.phoneE164!, "tenho logo e fotos", 5);
      const offer = (await outs(repo, conv.id)).find((m) => m.variant === "agente+auto:answer")!;
      expect(offer).toMatchObject({ status: "approved" });
      expect(offer.body).toMatch(OFFER_BODY);
      expect(offer.body).not.toContain(KEY);
      expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);

      await say(repo, lead.phoneE164!, "pode passar o Pix", 7);
      const [proposal] = await repo.listProposals({ leadId: lead.id, limit: 5 });
      expect(proposal).toMatchObject({ status: "sent", amountCents: 80_000, entryPct: 50, deliveryDays: 7 });
      expect((await repo.getLead(lead.id))!.stage).toBe("proposta");
      const pix = (await outs(repo, conv.id)).find((m) => m.body.includes(KEY))!;
      expect(pix).toMatchObject({ status: "approved" });
      expect(pix.body).toMatch(/R\$\s?400/);
      expect(await repo.listDemos({ leadId: lead.id, limit: 5 })).toHaveLength(0);
    });

    it("sem 'Pode fechar sozinho', a oferta vira rascunho para você e nada de dinheiro sai", async () => {
      const { repo, lead, conv } = await flow({ autoClose: false });
      await say(repo, lead.phoneE164!, "quero um site", 1);
      await say(repo, lead.phoneE164!, "quero mais contatos", 3);
      await say(repo, lead.phoneE164!, "tenho logo e fotos", 5);
      const list = await outs(repo, conv.id);
      const offer = list.find((m) => OFFER_BODY.test(m.body))!;
      expect(offer).toMatchObject({ status: "draft" });
      // você aprova a oferta e ela sai; só então o "pode" do lead é um aceite
      await repo.updateMessage(offer.id, { status: "sent", sentAt: plus(NOW, 6 * MIN).toISOString() });
      await say(repo, lead.phoneE164!, "pode passar o Pix", 7);
      expect((await outs(repo, conv.id)).find((m) => m.status === "draft" && /chave Pix/.test(m.body))).toBeTruthy(); // a resposta fica para você
      expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);
      expect((await outs(repo, conv.id)).some((m) => m.body.includes(KEY))).toBe(false);
      expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    });

    it("sistema: o agente conduz o roteiro de perguntas até o fim e entrega o resumo ao dono, sem valor e sem proposta", async () => {
      const { repo, lead, conv } = await flow();
      const phone = lead.phoneE164!;
      await say(repo, phone, "preciso de um sistema de agendamento online para a minha clínica de estética", 1);
      const first = (await outs(repo, conv.id))[0];
      expect(first).toMatchObject({ status: "approved", variant: "agente+auto:q-dor" });
      expect(first.body).toMatch(/Sistema depende[\s\S]*Como vocês fazem isso hoje/);
      expect(first.body).not.toMatch(/R\$|pr[eé]via/i);
      // o roteiro ainda não precisa do dono: a conversa fica com o agente
      expect((await repo.getConversation(conv.id))!.status).toBe("active");

      await say(repo, phone, "hoje é tudo no caderno e a recepção perde muita coisa", 3);
      await say(repo, phone, "a recepção e os clientes", 5);
      await say(repo, phone, "não", 7); // "não" solto é a resposta de "precisa ligar a algo?", não uma recusa
      const variants = (await outs(repo, conv.id)).map((m) => m.variant);
      expect(variants).toEqual(["agente+auto:q-dor", "agente+auto:q-usuarios", "agente+auto:q-integracoes", "agente+auto:q-prazo"]);
      expect((await repo.getConversation(conv.id))!.status).toBe("active");
      expect((await repo.getLead(lead.id))!.stage).not.toBe("perdido");

      await say(repo, phone, "uns 30 dias", 9);
      const last = (await outs(repo, conv.id)).at(-1)!;
      expect(last).toMatchObject({ status: "approved", variant: "agente+auto:answer" });
      expect(last.body).toMatch(/analisar com calma/);
      expect(last.body).not.toMatch(/R\$/);
      // agora sim chama o dono, com o mapa do pedido pronto
      expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
      const report = await buildAgentReport(repo, plus(NOW, 10 * MIN));
      expect(report.needYou[0]).toMatchObject({ conversationId: conv.id, product: "sistema", action: { kind: "orcar_sistema" } });

      const before = (await outs(repo, conv.id)).length;
      await say(repo, phone, "e quanto custa?", 11);
      await say(repo, phone, "pode fechar", 13);
      expect(await outs(repo, conv.id)).toHaveLength(before); // o resto é com você
      expect(await repo.listProposals({ leadId: lead.id, limit: 5 })).toHaveLength(0);
    });

    it("automação: o mesmo roteiro, com as perguntas de processo e de canal", async () => {
      const { repo, lead, conv } = await flow();
      const phone = lead.phoneE164!;
      await say(repo, phone, "quero automatizar o atendimento do WhatsApp da clínica", 1);
      const [first] = await outs(repo, conv.id);
      expect(first).toMatchObject({ status: "approved", variant: "agente+auto:q-dor" });
      expect(first.body).toMatch(/Automação depende[\s\S]*Como isso é feito hoje/);
      await say(repo, phone, "hoje a recepcionista responde tudo na mão", 3);
      const second = (await outs(repo, conv.id))[1];
      expect(second.variant).toBe("agente+auto:q-usuarios");
      expect(second.body).toMatch(/Por onde os seus clientes chamam/);
    });

    it("recusa de verdade no meio do roteiro ainda encerra a conversa", async () => {
      const { repo, lead, conv } = await flow();
      const phone = lead.phoneE164!;
      await say(repo, phone, "preciso de um sistema de agendamento online para a minha clínica de estética", 1);
      await say(repo, phone, "na verdade não tenho interesse, obrigado", 3);
      expect((await repo.getConversation(conv.id))!.status).toBe("closed");
      expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
    });

    it("prévia pedida: o agente confirma, espera, e continua depois que você manda o link", async () => {
      const { repo, lead, conv } = await flow();
      await say(repo, lead.phoneE164!, "quero ver uma prévia", 1, {}, { publicBaseUrl: "https://painel.exemplo.com" });
      expect(await repo.listDemos({ leadId: lead.id, limit: 5 })).toHaveLength(0); // nada automático
      const [confirm] = await outs(repo, conv.id);
      expect(confirm).toMatchObject({ status: "approved", variant: "agente+auto:wants_preview" });
      expect(confirm.body).toMatch(/Vou montar a prévia/);
      expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");

      await say(repo, lead.phoneE164!, "e o valor?", 3);
      expect(await outs(repo, conv.id)).toHaveLength(1); // enquanto você faz a prévia, o agente espera

      // você manda o link pelo celular: não é "assumir a conversa"
      await say(repo, lead.phoneE164!, "Segue a prévia: https://previa.exemplo.com.br/clinica", 10, { fromMe: true });
      const c = (await repo.getConversation(conv.id))!;
      expect(c.humanTakenOver).toBe(false);
      expect(c.status).toBe("active");
      const delivered = (await repo.listMessages({ conversationId: conv.id, kinds: ["manual"], limit: 5 }))[0];
      expect(delivered.variant).toBe("previa-enviada");

      await say(repo, lead.phoneE164!, "gostei muito!", 20);
      const offer = (await outs(repo, conv.id)).find((m) => m.variant === "agente+auto:compliment")!;
      expect(offer).toMatchObject({ status: "approved" });
      expect(offer.body).toMatch(OFFER_BODY);
    });

    it("só o link vale como entrega: mensagem sem link, ou link sem prévia pedida, é você assumindo a conversa", async () => {
      const a = await flow();
      await say(a.repo, a.lead.phoneE164!, "quero ver uma prévia", 1);
      await say(a.repo, a.lead.phoneE164!, "Já estou fazendo, em breve te mando", 5, { fromMe: true });
      expect((await a.repo.getConversation(a.conv.id))!.humanTakenOver).toBe(true);

      const b = await flow();
      await say(b.repo, b.lead.phoneE164!, "oi", 1);
      await say(b.repo, b.lead.phoneE164!, "Veja meu portfólio: https://jk.studio", 5, { fromMe: true });
      expect((await b.repo.getConversation(b.conv.id))!.humanTakenOver).toBe(true);
    });

    it("lead de uma abordagem antiga que oferecia prévia: o 'pode' vira pedido de prévia para você", async () => {
      const { repo, lead, conv } = await flow();
      const [opening] = await repo.listMessages({ conversationId: conv.id, direction: "out", kinds: ["opening"], limit: 1 });
      await repo.updateMessage(opening.id, { body: "Oi! Posso te mostrar uma prévia de como ficaria?" });
      await say(repo, lead.phoneE164!, "pode", 1);
      const list = await outs(repo, conv.id);
      expect(list[0].variant).toBe("agente+auto:wants_preview");
    });

    it("com o fluxo antigo (com prévia) tudo continua como era", async () => {
      const { repo, lead, conv } = await contacted(); // setup() deixa o fluxo com prévia
      await say(repo, lead.phoneE164!, "quero ver a prévia", 1);
      const [d] = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft"], limit: 5 });
      expect(d.variant).toBe("agente:q-objetivo");
    });
  });

  describe("agente de atendimento", () => {
    const drafts =(repo: MemoryRepo, convId: string) => repo.listMessages({ conversationId: convId, direction: "out", statuses: ["draft"], limit: 10 });

    it("marca quem escreveu o rascunho e a pergunta feita (para não repetir)", async () => {
      const { repo, lead, conv } = await contacted();
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "pode sim"), plus(NOW, MIN));
      const [d] = await drafts(repo, conv.id);
      expect(d.variant).toBe("agente:q-objetivo");
      expect(d.body).toMatch(/O que você mais quer que o site faça/);
    });

    it("não repete a pergunta: depois de enviada e respondida, o próximo rascunho segue em frente", async () => {
      const { repo, lead, conv } = await contacted();
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "pode sim"), plus(NOW, MIN));
      const [q] = await drafts(repo, conv.id);
      await repo.updateMessage(q.id, { status: "sent", sentAt: plus(NOW, 2 * MIN).toISOString() });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "quero mostrar meus serviços e atrair clientes"), plus(NOW, 3 * MIN));
      const next = (await drafts(repo, conv.id)).filter((m) => m.id !== q.id);
      expect(next).toHaveLength(1);
      expect(next[0].variant).toBe("agente:answer");
      expect(next[0].body).toMatch(/Anotado/);
    });

    it('"já tenho site" e "agora não" NÃO perdem o lead: o agente responde e o dono decide', async () => {
      for (const [text, topic] of [["já tenho site", "has_site"], ["agora não", "not_now"], ["talvez depois", "not_now"], ["vou pensar", "think"]] as const) {
        const { repo, lead, conv } = await contacted();
        await handleMessageEvent(repo, inbound(lead.phoneE164!, text), plus(NOW, MIN));
        expect((await repo.getConversation(conv.id))!.status, text).toBe("awaiting_human");
        expect((await repo.getLead(lead.id))!.stage, text).toBe("respondeu");
        const [d] = await drafts(repo, conv.id);
        expect(d.variant, text).toBe(`agente:${topic}`);
      }
    });

    it('"quanto tempo demora" responde o prazo das configurações, não o preço', async () => {
      const { repo, lead, conv } = await contacted();
      await repo.saveSettings({ deliveryDays: 12 });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "Quanto tempo demora?"), plus(NOW, MIN));
      const [d] = await drafts(repo, conv.id);
      expect(d.body).toMatch(/12 dias/);
      expect(d.body).not.toMatch(/R\$/);
    });

    it("com prévia enviada e proposta, usa os valores da proposta", async () => {
      const { repo, lead, conv } = await contacted();
      const demo = await generateDemo(repo, lead.id, { settings: await repo.getSettings() });
      await repo.updateDemo(demo.id, { sentAt: NOW.toISOString() });
      await repo.createProposal({ leadId: lead.id, title: "Site", amountCents: 150_000, entryPct: 30, deliveryDays: 9 });
      const [p] = await repo.listProposals({ leadId: lead.id, limit: 1 });
      await repo.updateProposal(p.id, { status: "sent", sentAt: NOW.toISOString() });
      await handleMessageEvent(repo, inbound(lead.phoneE164!, "quanto era mesmo?"), plus(NOW, MIN));
      const [d] = await drafts(repo, conv.id);
      expect(d.body).toMatch(/R\$\s?1\.500/);
      expect(d.body).toMatch(/R\$\s?450/);
    });

    it("com IA ligada, o rascunho vem da IA e fica marcado; sem passar na trava, volta para as regras", async () => {
      const llm = (reply: string) => ({
        name: "fake",
        model: "fake",
        async complete() {
          return JSON.stringify({ reply, topic: "price", asked: null, handoff: { needed: false, reason: null } });
        },
      });
      const a = await contacted();
      await handleMessageEvent(a.repo, inbound(a.lead.phoneE164!, "quanto custa?"), plus(NOW, MIN), {
        agent: { llm: llm("Os sites partem de R$ 800. Posso montar a prévia antes de você decidir?") },
      });
      const [da] = await drafts(a.repo, a.conv.id);
      expect(da.variant).toBe("agente-ia:price");

      const b = await contacted();
      await handleMessageEvent(b.repo, inbound(b.lead.phoneE164!, "quanto custa?"), plus(NOW, MIN), {
        agent: { llm: llm("Fazemos por R$ 99 hoje mesmo! Quer ver a prévia?") },
      });
      const [db] = await drafts(b.repo, b.conv.id);
      expect(db.variant).toBe("agente:price");
      expect(db.body).toMatch(/R\$\s?800/);
      const feed = await b.repo.listEvents({ types: ["automacao"], limit: 10 });
      expect(feed.some((e) => String(e.payload.text).includes("reprovada pela trava"))).toBe(true);
    });

    it("se a IA falhar, a resposta do lead continua gravada e o rascunho das regras sai", async () => {
      const broken = {
        name: "fake",
        model: "fake",
        async complete(): Promise<string> {
          throw new Error("sem internet");
        },
      };
      const { repo, lead, conv } = await contacted();
      const r = await handleMessageEvent(repo, inbound(lead.phoneE164!, "como funciona?"), plus(NOW, MIN), { agent: { llm: broken } });
      expect(r).toMatchObject({ handled: true, draftedReply: true });
      expect((await drafts(repo, conv.id))[0].variant).toBe("agente:how_works");
    });
  });

  it("mensagem repetida (o webhook reenvia) é ignorada", async () => {
    const { repo, lead, conv } = await contacted();
    const evt = inbound(lead.phoneE164!, "pode sim");
    await handleMessageEvent(repo, evt, plus(NOW, MIN));
    expect(await handleMessageEvent(repo, evt, plus(NOW, 2 * MIN))).toMatchObject({ handled: false, reason: "mensagem repetida" });
    expect(await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 10 })).toHaveLength(1);
    expect((await repo.getConversation(conv.id))!.unread).toBe(1);
  });

  it("o eco da nossa própria mensagem (is_from_me com o mesmo id) é ignorado", async () => {
    const { repo, lead } = await contacted();
    const echo = inbound(lead.phoneE164!, "Olá", { fromMe: true, providerMessageId: "OUT1" });
    expect(await handleMessageEvent(repo, echo, NOW)).toMatchObject({ handled: false, reason: "mensagem repetida" });
  });

  it("o dono respondeu pelo celular: a automação sai de cena naquela conversa", async () => {
    const { repo, lead, conv } = await contacted();
    const [pending] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "followup", step: 1, body: "x", status: "approved", createdBy: "system", scheduledFor: plus(NOW, DAY).toISOString() },
    ]);
    const evt = inbound(lead.phoneE164!, "Oi! Aqui é o Jonathan, vi sua mensagem", { fromMe: true, providerMessageId: "PHONE1" });
    expect(await handleMessageEvent(repo, evt, plus(NOW, MIN))).toMatchObject({ handled: true, intent: "manual" });
    expect((await repo.getConversation(conv.id))!.humanTakenOver).toBe(true);
    expect((await repo.getMessage(pending.id))!.status).toBe("cancelled");
    const manual = await repo.listMessages({ conversationId: conv.id, kinds: ["manual"], limit: 5 });
    expect(manual[0]).toMatchObject({ direction: "out", createdBy: "user", status: "sent" });
  });
});

describe("recibos de entrega e leitura", () => {
  it("só avançam: enviada → entregue → lida, nunca para trás", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0]);
    await repo.updateMessage(m.id, { status: "sent", providerMessageId: "X1" });

    expect(await handleAckEvent(repo, { kind: "ack", providerMessageIds: ["X1"], receipt: "delivered" })).toBe(1);
    expect((await repo.getMessage(m.id))!.status).toBe("delivered");
    expect(await handleAckEvent(repo, { kind: "ack", providerMessageIds: ["X1"], receipt: "read" })).toBe(1);
    expect((await repo.getMessage(m.id))!.status).toBe("read");
    expect(await handleAckEvent(repo, { kind: "ack", providerMessageIds: ["X1"], receipt: "delivered" })).toBe(0);
    expect((await repo.getMessage(m.id))!.status).toBe("read");
  });

  it("lida direto (sem entregue antes) também vale; id desconhecido é ignorado", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0]);
    await repo.updateMessage(m.id, { status: "sent", providerMessageId: "X2" });
    expect(await handleAckEvent(repo, { kind: "ack", providerMessageIds: ["X2", "NAO-EXISTE"], receipt: "read" })).toBe(1);
  });
});

describe("resumo para o painel", () => {
  it("reúne contadores, teto do dia, próximo envio e taxa de resposta", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW, { limit: 3 });
    const ids = (await repo.listMessages({ statuses: ["draft"], limit: 10 })).map((m) => m.id);
    await approveMessages(repo, ids, NOW, rng);
    const o = await getOverview(repo, new SimulatedProvider(), NOW);
    expect(o).toMatchObject({ providerMode: "simulado", connected: false, capToday: 8, sentToday: 0, replyRate: null });
    expect(o.counts.approved).toBe(3);
    expect(o.nextAt).not.toBeNull();
    expect(o.cfg).toMatchObject({ paused: true, dryRun: true, autonomy: "copiloto" });
  });
});

describe("tick: o que pausou a automação em 26/10", () => {
  it("mensagem sem texto sai da fila sem contar como falha de envio (e nunca vai ao WhatsApp)", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);
    await repo.updateMessage(m.id, { body: "   " });

    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "cancelled", messageId: m.id, reason: "mensagem sem texto" });
    expect(provider.sent).toHaveLength(0);
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "cancelled", error: "mensagem sem texto" });
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(0);
  });

  it("a mensagem saiu inteira e o banco falhou ao gravar 'enviada': fica enviada, não volta à fila nem vira texto em branco", async () => {
    const { repo, leads } = await setup();
    const provider = new RecordingProvider();
    await live(repo);
    const { m } = await queue(repo, leads[0]);

    const original = repo.updateMessage.bind(repo);
    let broke = false;
    repo.updateMessage = async (id, patch) => {
      if (!broke && patch.status === "sent") {
        broke = true;
        throw new Error("banco fora do ar");
      }
      return original(id, patch);
    };

    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toEqual({ action: "sent", messageId: m.id });
    expect(provider.sent).toHaveLength(1);
    const saved = await repo.getMessage(m.id);
    expect(saved).toMatchObject({ status: "sent", providerMessageId: "3EB0TEST1" });
    expect(saved!.body).toBe(`Olá ${leads[0].name}`); // o texto não foi esvaziado
    expect(saved!.error).toMatch(/banco fora do ar/);
    // não conta como falha: a mensagem chegou
    expect((await repo.getAutomationState()).consecutiveFailures).toBe(0);

    // e nada é reenviado nas voltas seguintes
    await tick({ repo, provider, now: plus(NOW, 10 * MIN), rng, sleep });
    expect(provider.sent).toHaveLength(1);
  });

  it("não aprova rascunho em branco", async () => {
    const { repo, leads } = await setup();
    const { m } = await queue(repo, leads[0], { status: "draft" });
    await repo.updateMessage(m.id, { body: "" });
    expect(await approveMessages(repo, [m.id], NOW, rng)).toMatchObject({ approved: 0, skipped: 1 });
    expect((await repo.getMessage(m.id))!.status).toBe("draft");
  });
});

describe("handleMessageEvent: robô que responde em segundos", () => {
  const RECEBEMOS = "Recebemos sua proposta sobre criação de site. Já encaminhei para nossa equipe e alguém responderá aqui neste chat.";

  async function sentOpening(repo: MemoryRepo, lead: Lead, sentAt: Date) {
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan Kelvin, desenvolvedor.", status: "sent", createdBy: "system", sentAt: sentAt.toISOString() },
    ]);
    await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: sentAt.toISOString() });
    await repo.setStage(lead.id, "contatado");
    return conv;
  }

  const message = (phone: string, text: string, at: Date): Extract<WebhookEvent, { kind: "message" }> => ({
    kind: "message",
    phoneE164: phone,
    text,
    media: null,
    fromMe: false,
    providerMessageId: `IN-${at.getTime()}`,
    timestamp: at.toISOString(),
  });

  it("o recebimento automático chega em segundos: é marcado como robô e a conversa continua 'sem resposta'", async () => {
    const { repo, leads } = await setup();
    const conv = await sentOpening(repo, leads[0], NOW);
    const r = await handleMessageEvent(repo, message(conv.phoneE164, RECEBEMOS, plus(NOW, 45_000)), plus(NOW, 45_000));
    expect(r).toMatchObject({ handled: true, intent: "auto_reply", draftedReply: false });
    const inbound = (await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 5 }))[0];
    expect(inbound.variant).toBe("resposta-automatica");
    expect((await repo.getConversation(conv.id))!.lastInboundAt).toBeNull();
    expect((await repo.getLead(leads[0].id))!.stage).toBe("contatado");
  });

  it("o mesmo texto horas depois é uma pessoa: conversa normal e rascunho do agente", async () => {
    const { repo, leads } = await setup();
    const conv = await sentOpening(repo, leads[0], NOW);
    const later = plus(NOW, 5 * 60 * MIN);
    const r = await handleMessageEvent(repo, message(conv.phoneE164, RECEBEMOS, later), later);
    expect(r).toMatchObject({ handled: true });
    expect((r as { intent: string }).intent).not.toBe("auto_reply");
    expect((await repo.getLead(leads[0].id))!.stage).toBe("respondeu");
  });

  it("depois que uma pessoa já respondeu, o tempo curto não vira robô (conversa em andamento)", async () => {
    const { repo, leads } = await setup();
    const conv = await sentOpening(repo, leads[0], NOW);
    await repo.updateConversation(conv.id, { lastInboundAt: plus(NOW, 30 * MIN).toISOString(), lastOutboundAt: plus(NOW, 30.5 * MIN).toISOString() });
    const soon = plus(NOW, 31 * MIN);
    const r = await handleMessageEvent(repo, message(conv.phoneE164, RECEBEMOS, soon), soon);
    expect((r as { intent: string }).intent).not.toBe("auto_reply");
  });
});
