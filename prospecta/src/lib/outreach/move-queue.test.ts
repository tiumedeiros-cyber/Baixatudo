import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import type { Account } from "./accounts";
import { approveMessages, prepareLeadsForAccount, tickAll } from "./engine";
import { describeMove, moveQueue } from "./move-queue";
import type { ProviderStatus, WhatsAppProvider } from "./provider";

/**
 * "O número JK 01 foi restringido e os envios ficaram parados na lista" (dono, 29/10): passar a fila de um número para outro.
 * Só o que nunca saiu muda de número; nada é enviado e nada é apagado.
 */

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const rng = () => 0.5;
const sleep = async () => {};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

class Recorder implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  connected = true;
  sent: { phone: string; text: string }[] = [];
  constructor(readonly label: string) {}
  async status(): Promise<ProviderStatus> {
    return { connected: this.connected, loggedIn: this.connected, mode: this.mode, detail: this.connected ? "WhatsApp conectado" : "desconectado" };
  }
  async typing() {}
  async sendText(phone: string, text: string) {
    this.sent.push({ phone, text });
    return { id: `${this.label}-${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar" });
  const caps = { week1: null, week2: null, steady: 6 };
  const src = await repo.createAccount({ name: "JK 01", gowaDeviceId: "dev1", paused: false, caps });
  const dest = await repo.createAccount({ name: "JK 02", gowaDeviceId: "dev2", paused: false, caps });
  let seed = 100;
  /** Escreve as aberturas dos leads como rascunhos do número e (se pedido) as aprova. */
  const prepare = async (account: Account, chosen: Lead[], approve = true) => {
    const r = await prepareLeadsForAccount(repo, NOW, { leadIds: chosen.map((l) => l.id), accountId: account.id, rng: seeded(seed++) });
    expect(r.prepared).toBe(chosen.length);
    const drafts = await repo.listMessages({ accountId: account.id, kinds: ["opening"], statuses: ["draft"], order: "asc", limit: 50 });
    if (approve) await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
    return drafts.map((m) => m.id);
  };
  return { repo, leads, src, dest, prepare };
}

const convOf = async (repo: MemoryRepo, messageId: string) => (await repo.getMessage(messageId))!.conversationId;
const pendingOf = (repo: MemoryRepo, account: Account, statuses: ("draft" | "approved" | "sending")[] = ["draft", "approved", "sending"]) =>
  repo.listMessages({ accountId: account.id, direction: "out", statuses, limit: 100 });

describe("passar a fila para outro número", () => {
  it("passa aprovadas e rascunhos com a conversa, e põe as aprovadas no fim da fila do destino", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    const own = await prepare(dest, leads.slice(4, 6));
    const ownBefore = new Map((await repo.listMessages({ accountId: dest.id, statuses: ["approved"], limit: 20 })).map((m) => [m.id, m.scheduledFor]));
    expect(ownBefore.size).toBe(2);
    const lastOwn = [...ownBefore.values()].map((x) => Date.parse(x!)).reduce((a, b) => Math.max(a, b), 0);

    // 4 no JK 01: 3 aprovadas e 1 rascunho
    const mine = await prepare(src, leads.slice(0, 4), false);
    await approveMessages(repo, mine.slice(0, 3), NOW, rng);

    const r = await moveQueue(repo, src.id, dest.id, NOW, rng);
    expect(r).toMatchObject({ moved: 4, rescheduled: 3, drafts: 1, toPaused: false, stayed: { followups: 0, sending: 0, talking: 0 } });

    // nada ficou para trás
    expect(await pendingOf(repo, src)).toHaveLength(0);
    // as 4 agora são do JK 02, as aprovadas depois de tudo o que ele já tinha, e a conversa foi junto
    for (const [i, id] of mine.entries()) {
      const m = (await repo.getMessage(id))!;
      expect(m.accountId).toBe(dest.id);
      expect(m.status).toBe(i < 3 ? "approved" : "draft");
      if (i < 3) expect(Date.parse(m.scheduledFor!)).toBeGreaterThan(lastOwn);
      expect((await repo.getConversation(m.conversationId))!.accountId).toBe(dest.id);
    }
    // o que o JK 02 já tinha continua com o mesmo horário
    for (const id of own) expect((await repo.getMessage(id))!.scheduledFor).toBe(ownBefore.get(id));
    expect((await pendingOf(repo, dest, ["approved"])).map((m) => m.id).sort()).toEqual([...own, ...mine.slice(0, 3)].sort());
    // nada saiu
    expect(await repo.listMessages({ direction: "out", statuses: ["sent", "delivered", "read", "simulated", "cancelled"], limit: 50 })).toHaveLength(0);
    const events = await repo.listEvents({ types: ["automacao"], limit: 10 });
    expect(JSON.stringify(events.map((e) => e.payload))).toMatch(/4 aberturas passadas de JK 01 para JK 02 \(3 aprovadas com horário novo, 1 rascunhos\)/);
  });

  it("cutucadas, mensagem 'enviando' e conversas que já aconteceram ficam no número de origem", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    const ids = await prepare(src, leads.slice(0, 5));
    await repo.updateMessage(ids[0], { status: "sending" }); // o worker pegou e não terminou
    const talked = await convOf(repo, ids[1]);
    await repo.updateConversation(talked, { touches: 1, lastOutboundAt: NOW.toISOString() }); // já foi contatado
    const wrote = await convOf(repo, ids[2]);
    await repo.updateConversation(wrote, { lastInboundAt: NOW.toISOString() }); // já escreveu
    // uma cutuca de quem já foi abordado pelo JK 01
    const lead = leads[6];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    await repo.updateConversation(conv.id, { accountId: src.id, touches: 1, lastOutboundAt: NOW.toISOString() });
    const [followup] = await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "out", kind: "followup", step: 1, body: "Bom dia, conseguiu ver minha mensagem?", status: "draft", createdBy: "system" }]);

    const r = await moveQueue(repo, src.id, dest.id, NOW, rng);
    expect(r).toMatchObject({ moved: 2, rescheduled: 2, drafts: 0, stayed: { followups: 1, sending: 1, talking: 2 } });

    expect((await repo.getMessage(ids[0]))).toMatchObject({ status: "sending", accountId: src.id });
    expect((await repo.getMessage(followup.id))).toMatchObject({ status: "draft", accountId: src.id });
    for (const id of [talked, wrote, conv.id]) expect((await repo.getConversation(id))!.accountId).toBe(src.id);
    for (const id of ids.slice(3)) expect((await repo.getMessage(id))).toMatchObject({ status: "approved", accountId: dest.id });
    // as que ficaram atrás continuam do JK 01 (as aprovadas das conversas que já aconteceram não foram tocadas)
    expect((await repo.getMessage(ids[1]))).toMatchObject({ status: "approved", accountId: src.id });
    expect((await repo.getMessage(ids[2]))).toMatchObject({ status: "approved", accountId: src.id });
  });

  it("recusa o mesmo número e número aposentado; pode repetir sem mexer em nada", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    await expect(moveQueue(repo, src.id, src.id, NOW, rng)).rejects.toThrow(/Escolha outro número/);
    await expect(moveQueue(repo, "nao-existe", dest.id, NOW, rng)).rejects.toThrow(/Esse número não existe mais/);
    await expect(moveQueue(repo, src.id, "nao-existe", NOW, rng)).rejects.toThrow(/O número de destino não existe mais/);
    await repo.updateAccount(dest.id, { retired: true });
    await expect(moveQueue(repo, src.id, dest.id, NOW, rng)).rejects.toThrow(/O número de destino não existe mais/);
    await repo.updateAccount(dest.id, { retired: false });

    await prepare(src, leads.slice(0, 2));
    expect((await moveQueue(repo, src.id, dest.id, NOW, rng)).moved).toBe(2);
    const again = await moveQueue(repo, src.id, dest.id, NOW, rng);
    expect(again.moved).toBe(0);
    expect(describeMove(again)).toMatchObject({ ok: false });
    expect(describeMove(again).message).toMatch(/^Nada para passar/);
  });

  it("o número original (mensagens e conversa sem número guardado) também passa a fila", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const lead = (await repo.listLeads({ eligible: true, sort: "score", limit: 5, offset: 0 })).rows[0];
    const original = await repo.createAccount({ name: "Número 1", legacy: true });
    const other = await repo.createAccount({ name: "Número 2", gowaDeviceId: "dev2", paused: false });
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    expect(conv.accountId).toBeNull();
    const [m] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", step: 0, body: "Bom dia! Aqui é o Jonathan. Posso fazer uma pergunta rápida?", status: "approved", createdBy: "system", scheduledFor: "2026-10-23T11:35:00.000Z" },
    ]);
    const r = await moveQueue(repo, original.id, other.id, NOW, rng);
    expect(r).toMatchObject({ moved: 1, rescheduled: 1 });
    expect(await repo.getMessage(m.id)).toMatchObject({ accountId: other.id, status: "approved" });
    expect((await repo.getConversation(conv.id))!.accountId).toBe(other.id);
  });

  it("a mensagem passada sai pelo aparelho do destino; o número de origem, desconectado, não manda nada", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    await repo.saveAutomation({ paused: false, dryRun: false });
    const p1 = new Recorder("jk01");
    const p2 = new Recorder("jk02");
    p1.connected = false; // o JK 01 caiu
    const providerFor = (a: Account) => (a.id === src.id ? p1 : p2);

    const ids = await prepare(src, leads.slice(0, 2));
    const r = await moveQueue(repo, src.id, dest.id, NOW, rng);
    expect(r.rescheduled).toBe(2);

    const t = new Date(Date.parse(r.lastAt!) + 60_000);
    await tickAll({ repo, provider: p2, providerFor, now: t, rng, sleep });
    expect(p1.sent).toHaveLength(0);
    expect(p2.sent.length).toBeGreaterThanOrEqual(1);
    const sent = await repo.listMessages({ direction: "out", statuses: ["sent"], limit: 10 });
    expect(sent).toHaveLength(1);
    expect(sent[0].accountId).toBe(dest.id);
    expect(ids).toContain(sent[0].id);
    const conv = (await repo.getConversation(sent[0].conversationId))!;
    expect(new Set(p2.sent.map((x) => x.phone))).toEqual(new Set([conv.phoneE164]));
  });
});

describe("o que o dono lê depois de passar", () => {
  it("diz o que mudou, quando sai, o que ficou e avisa quando o destino está pausado", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    const ids = await prepare(src, leads.slice(0, 3));
    await repo.updateMessage(ids[0], { status: "sending" });
    await repo.updateAccount(dest.id, { paused: true });
    const d = describeMove(await moveQueue(repo, src.id, dest.id, NOW, rng));
    expect(d.ok).toBe(true);
    expect(d.message).toMatch(/^2 aberturas passadas do JK 01 para o JK 02, junto com as conversas\./);
    expect(d.message).toMatch(/2 aprovadas ganharam horário novo no fim da fila dele, de \d{2}\/\d{2} às \d{2}:\d{2} a \d{2}\/\d{2} às \d{2}:\d{2}/);
    expect(d.message).toMatch(/o JK 02 está pausado/);
    expect(d.message).toMatch(/Nada foi enviado agora\./);
    expect(d.message).toMatch(/Ficaram no JK 01: 1 ficou travada em “enviando”/);
  });

  it("só rascunhos: não fala de horário e diz que seguem esperando o OK", async () => {
    const { repo, leads, src, dest, prepare } = await setup();
    await prepare(src, leads.slice(0, 2), false);
    const d = describeMove(await moveQueue(repo, src.id, dest.id, NOW, rng));
    expect(d.message).toMatch(/2 rascunhos seguem esperando o seu OK na Fila\./);
    expect(d.message).not.toMatch(/horário novo/);
  });
});
