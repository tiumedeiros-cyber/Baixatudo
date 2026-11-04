import { describe, expect, it } from "vitest";
import { MAX_WARNINGS, checkMessage } from "@/lib/agent/humanize";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { accountMatchesDevice, effectiveConfig, type Account } from "./accounts";
import {
  approveMessages,
  handleMessageEvent,
  prepareBatch,
  prepareLeadsForAccount,
  rewriteOpenings,
  tick,
  tickAll,
} from "./engine";
import { localParts } from "./guardrails";
import { GowaAdmin } from "./gowa-admin";
import { GowaProvider } from "./gowa";
import {
  addAccount,
  checkAccountName,
  freeDevices,
  getNumbersOverview,
  listReleasedGroups,
  relinkAccount,
  retireAccount,
  setAccountPaused,
  syncDevices,
} from "./numbers";
import { ProviderError, type ProviderStatus, type WhatsAppProvider } from "./provider";
import { checkQueue } from "./reschedule";
import { loadRoster } from "./roster";
import { ANGLES, buildOpening, type TemplateContext, type TemplateLead } from "./templates";
import { chooseOpeningStyle, emptyHistory, historyFrom, lruPick, remember, similarity } from "./variation";
import { parseOpeningVariant } from "./metrics";
import { parseStyleCode } from "./style";
import { parseWebhook } from "./webhook";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const MIN = 60_000;
const rng = () => 0.5;
const sleep = async () => {};
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);

/** Sorteio repetível (para o teste de variação não depender de sorte). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

class RecordingProvider implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  connected = true;
  /** O aparelho foi apagado no GOWA. */
  missing = false;
  failWith: Error | null = null;
  sent: { phone: string; text: string }[] = [];
  constructor(readonly label: string) {}
  async status(): Promise<ProviderStatus> {
    if (this.missing) return { connected: false, loggedIn: false, mode: this.mode, missing: true, detail: "O aparelho deste número foi apagado do GOWA" };
    return { connected: this.connected, loggedIn: this.connected, mode: this.mode, detail: this.connected ? "WhatsApp conectado" : "desconectado" };
  }
  async typing() {}
  async sendText(phone: string, text: string) {
    if (this.failWith) throw this.failWith;
    this.sent.push({ phone, text });
    return { id: `${this.label}-${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

async function setup(opts: { flow?: "qualificar" | "previa"; accounts?: number } = {}) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: opts.flow ?? "qualificar" });
  // o número original (como a migração cria) e os extras pedidos
  const one = await repo.createAccount({ name: "Número 1", legacy: true });
  const accounts: Account[] = [one];
  for (let i = 2; i <= (opts.accounts ?? 2); i++) {
    accounts.push(await repo.createAccount({ name: `Número ${i}`, gowaDeviceId: `dev${i}`, caps: { week1: null, week2: null, steady: 3 } }));
  }
  return { repo, leads, accounts };
}

const live = (repo: MemoryRepo) => repo.saveAutomation({ paused: false, dryRun: false });

describe("números: cadastro e elenco", () => {
  it("com um número só (ou nenhum) o painel é o de sempre; a partir do segundo há vários", async () => {
    const repo = createMemoryRepo();
    expect((await loadRoster(repo)).multi).toBe(false);
    const one = await repo.createAccount({ name: "Número 1", legacy: true });
    expect((await loadRoster(repo)).multi).toBe(false);
    await repo.createAccount({ name: "Número 2" });
    const roster = await loadRoster(repo);
    expect(roster.multi).toBe(true);
    expect(roster.defaultId).toBe(one.id);
  });

  it("o nome do número: obrigatório, até 60 letras e sem repetir", () => {
    const others = [{ id: "a", name: "Número 1", retired: false }, { id: "b", name: "Antigo", retired: true }];
    expect(checkAccountName("  ", others)).toMatch(/Dê um nome/);
    expect(checkAccountName("x".repeat(61), others)).toMatch(/no máximo 60/);
    expect(checkAccountName("número 1", others)).toMatch(/Já existe/);
    expect(checkAccountName("Número 1", others, "a")).toBeNull(); // ele mesmo
    expect(checkAccountName("Antigo", others)).toBeNull(); // aposentado libera o nome
    expect(checkAccountName("Estética SP", others)).toBeNull();
  });

  it("número novo nasce pausado, com teto devagar, e não se repete o nome", async () => {
    const { repo } = await setup({ accounts: 1 });
    const two = await addAccount(repo, { name: "Número 2", gowaDeviceId: "num-abc123" });
    expect(two).toMatchObject({ paused: true, legacy: false, gowaDeviceId: "num-abc123", caps: { week1: 8, week2: 15, steady: 25 } });
    await expect(addAccount(repo, { name: "número 2", gowaDeviceId: "num-zzz" })).rejects.toThrow(/Já existe/);
  });

  it("reconhece o aparelho que o webhook cita (id, endereço ou só os dígitos)", () => {
    const acc = { gowaDeviceId: "num-abc", phoneE164: "+5585988887777", jid: "5585988887777@s.whatsapp.net" };
    expect(accountMatchesDevice(acc, "num-abc")).toBe(true);
    expect(accountMatchesDevice(acc, "5585988887777@s.whatsapp.net")).toBe(true);
    expect(accountMatchesDevice(acc, "5585988887777:12@s.whatsapp.net")).toBe(true);
    expect(accountMatchesDevice(acc, "5511999990000@s.whatsapp.net")).toBe(false);
    expect(accountMatchesDevice(acc, null)).toBe(false);
  });

  it("as regras de um número: as gerais com o teto e o aquecimento dele por cima", async () => {
    const { repo, accounts } = await setup();
    const cfg = (await repo.getSettings()).automation;
    expect(effectiveConfig(accounts[0], cfg)).toBe(cfg); // o original usa as gerais
    expect(effectiveConfig(accounts[1], cfg).caps).toEqual({ week1: null, week2: null, steady: 3 });
    expect(effectiveConfig(accounts[1], cfg).windows).toEqual(cfg.windows);
  });
});

describe("liberar leads para um número", () => {
  it("o agente escreve a abertura de cada lead como conversa DO número escolhido", async () => {
    const { repo, leads, accounts } = await setup();
    const ids = leads.slice(0, 6).map((l) => l.id);
    const r = await prepareLeadsForAccount(repo, NOW, { leadIds: ids, accountId: accounts[1].id, rng: seeded(7) });
    expect(r).toMatchObject({ account: "Número 2", prepared: 6, capPerDay: 3 });
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    expect(drafts).toHaveLength(6);
    for (const m of drafts) {
      expect(m).toMatchObject({ status: "draft", accountId: accounts[1].id, direction: "out", createdBy: "system" });
      expect(m.body).not.toMatch(/PARE/);
    }
    for (const id of ids) expect((await repo.findConversationByLead(id))!.accountId).toBe(accounts[1].id);
    expect((await repo.messageCounts()).prospectingSent).toBe(0); // nada saiu
  });

  it("o mesmo lead não vai para a Fila duas vezes, e quem já foi abordado fica com o número que abordou", async () => {
    const { repo, leads, accounts } = await setup();
    const ids = leads.slice(0, 3).map((l) => l.id);
    await prepareLeadsForAccount(repo, NOW, { leadIds: ids, accountId: accounts[1].id, rng: seeded(1) });
    const again = await prepareLeadsForAccount(repo, NOW, { leadIds: ids, accountId: accounts[0].id, rng: seeded(1) });
    expect(again.prepared).toBe(0);
    expect(again.skipped).toEqual({ "já está na Fila": 3 });

    // um deles já foi abordado pelo Número 2: nenhum outro número o abre
    const sent = (await repo.listMessages({ conversationId: (await repo.findConversationByLead(ids[0]))!.id, limit: 5 }))[0];
    await repo.updateMessage(sent.id, { status: "sent", sentAt: NOW.toISOString() });
    await repo.updateConversation(sent.conversationId, { touches: 1, lastOutboundAt: NOW.toISOString() });
    const other = await prepareLeadsForAccount(repo, plus(NOW, MIN), { leadIds: [ids[0]], accountId: accounts[0].id, rng: seeded(2) });
    expect(other.skipped).toEqual({ "já foi abordado": 1 });
  });

  it("rascunhos cancelados ainda não falaram com ninguém: o lead pode mudar de número", async () => {
    const { repo, leads, accounts } = await setup();
    const id = leads[0].id;
    await prepareLeadsForAccount(repo, NOW, { leadIds: [id], accountId: accounts[1].id, rng: seeded(3) });
    const [draft] = await repo.listMessages({ leadId: id, limit: 5 });
    await repo.updateMessage(draft.id, { status: "cancelled" });
    const moved = await prepareLeadsForAccount(repo, NOW, { leadIds: [id], accountId: accounts[0].id, rng: seeded(3) });
    expect(moved.prepared).toBe(1);
    expect((await repo.findConversationByLead(id))!.accountId).toBe(accounts[0].id);
  });

  it("não prepara quem pediu para parar, nem quem não está Qualificado, nem número aposentado", async () => {
    const { repo, leads, accounts } = await setup({ accounts: 3 });
    repo._addOptout(leads[0].phoneE164!);
    await repo.setStage(leads[1].id, "novo");
    const r = await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id, leads[1].id, leads[2].id], accountId: accounts[1].id, rng: seeded(4) });
    expect(r.prepared).toBe(1);
    expect(r.skipped).toEqual({ "pediu para não receber": 1, "fora de Qualificado": 1 });

    await retireAccount(repo, accounts[2].id);
    await expect(prepareLeadsForAccount(repo, NOW, { leadIds: [leads[3].id], accountId: accounts[2].id })).rejects.toThrow(/não existe mais/);
  });

  it("os grupos liberados saem por ramo e cidade, e quem já está na Fila some da lista", async () => {
    const { repo, leads, accounts } = await setup();
    const before = await listReleasedGroups(repo, { allowDemo: false });
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ niche: "Estética", city: "Fortaleza", count: leads.length });
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 4).map((l) => l.id), accountId: accounts[1].id, rng: seeded(5) });
    const after = await listReleasedGroups(repo, { allowDemo: false });
    expect(after[0].count).toBe(leads.length - 4);
  });

  it("com vários números o lote do dia só cuida de follow-up: lead novo só entra pela escolha do número", async () => {
    const { repo } = await setup();
    const r = await prepareBatch(repo, NOW, { rng: seeded(6) });
    expect(r).toMatchObject({ openings: 0, followUps: 0, cap: 8 + 3 });
    expect(await repo.listMessages({ kinds: ["opening"], limit: 10 })).toHaveLength(0);
  });
});

describe("a fila de cada número", () => {
  it("cada número tem o seu teto por dia: o de teto 3 espalha 5 mensagens em 2 dias, o outro não é afetado", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 5).map((l) => l.id), accountId: accounts[1].id, rng: seeded(8) });
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(5, 10).map((l) => l.id), accountId: accounts[0].id, rng: seeded(9) });
    const drafts = await repo.listMessages({ statuses: ["draft"], limit: 50 });
    const r = await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
    expect(r.approved).toBe(10);

    const days = async (accountId: string) => {
      const list = await repo.listMessages({ accountId, statuses: ["approved"], limit: 50 });
      return list.map((m) => localParts(new Date(m.scheduledFor!), "America/Fortaleza").ymd);
    };
    const two = await days(accounts[1].id);
    expect(two).toHaveLength(5);
    expect(two.filter((d) => d === "2026-10-22")).toHaveLength(3); // o teto dele
    expect(new Set(two).size).toBe(2);
    const one = await days(accounts[0].id);
    expect(new Set(one)).toEqual(new Set(["2026-10-22"])); // o outro cabe todo no mesmo dia
  });

  it("claimNextDueMessage nunca cruza números", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id], accountId: accounts[1].id, rng: seeded(10) });
    const drafts = await repo.listMessages({ statuses: ["draft"], limit: 5 });
    await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
    const later = plus(NOW, 2 * 60 * MIN);
    expect(await repo.claimNextDueMessage(later.toISOString(), accounts[0].id)).toBeNull();
    const got = await repo.claimNextDueMessage(later.toISOString(), accounts[1].id);
    expect(got).toMatchObject({ accountId: accounts[1].id, status: "sending" });
  });
});

describe("o worker com vários números", () => {
  async function ready() {
    const s = await setup();
    await live(s.repo);
    const p1 = new RecordingProvider("n1");
    const p2 = new RecordingProvider("n2");
    const providerFor = (a: Account) => (a.id === s.accounts[1].id ? p2 : p1);
    await s.repo.updateAccount(s.accounts[1].id, { paused: false });
    await prepareLeadsForAccount(s.repo, NOW, { leadIds: s.leads.slice(0, 2).map((l) => l.id), accountId: s.accounts[0].id, rng: seeded(11) });
    await prepareLeadsForAccount(s.repo, NOW, { leadIds: s.leads.slice(2, 4).map((l) => l.id), accountId: s.accounts[1].id, rng: seeded(12) });
    const drafts = await s.repo.listMessages({ statuses: ["draft"], limit: 20 });
    await approveMessages(s.repo, drafts.map((m) => m.id), NOW, rng);
    return { ...s, p1, p2, providerFor };
  }
  const deps = (r: Awaited<ReturnType<typeof ready>>, now: Date) => ({ repo: r.repo, provider: r.p1, providerFor: r.providerFor, now, rng, sleep });

  it("cada mensagem sai pelo aparelho do número dela, e só uma por volta no total", async () => {
    const r = await ready();
    const t = plus(NOW, 60 * MIN);
    const first = await tickAll(deps(r, t));
    expect(first.action).toBe("multi");
    // a volta termina no primeiro envio: uma mensagem no total (que sai em partes, um parágrafo por vez)
    expect(await r.repo.listMessages({ statuses: ["sent"], direction: "out", limit: 10 })).toHaveLength(1);

    // o número que acabou de enviar espera o intervalo dele; o outro envia na volta seguinte
    const second = await tickAll(deps(r, plus(t, 30_000)));
    expect(second.action).toBe("multi");
    expect(await r.repo.listMessages({ statuses: ["sent"], direction: "out", limit: 10 })).toHaveLength(2);

    // cada lead recebeu de quem foi escolhido, pelo aparelho dele
    for (const [p, i] of [[r.p1, 0], [r.p2, 1]] as const) {
      const msgs = await r.repo.listMessages({ accountId: r.accounts[i].id, statuses: ["sent"], limit: 10 });
      expect(msgs).toHaveLength(1);
      const conv = (await r.repo.getConversation(msgs[0].conversationId))!;
      expect(p.sent.length).toBeGreaterThanOrEqual(1);
      expect(new Set(p.sent.map((x) => x.phone))).toEqual(new Set([conv.phoneE164]));
    }
  });

  it("o intervalo e o último envio são de cada número", async () => {
    const r = await ready();
    const t = plus(NOW, 60 * MIN);
    for (let i = 0; i < 6; i++) await tickAll(deps(r, plus(t, i * 20_000)));
    // em 2 minutos cada número mandou UMA mensagem (o intervalo mínimo dele ainda não passou)
    for (const i of [0, 1]) expect(await r.repo.listMessages({ accountId: r.accounts[i].id, statuses: ["sent"], limit: 10 })).toHaveLength(1);
    const s1 = await r.repo.getAccountState(r.accounts[0].id);
    const s2 = await r.repo.getAccountState(r.accounts[1].id);
    expect(s1.lastSendAt).not.toBeNull();
    expect(s2.lastSendAt).not.toBeNull();
    // o original guarda o estado no mesmo lugar de sempre
    expect((await r.repo.getAutomationState()).lastSendAt).toBe(s1.lastSendAt);
  });

  it("a falha de um número pausa SÓ ele; o outro segue enviando", async () => {
    const r = await ready();
    await r.repo.saveAutomation({ maxConsecutiveFailures: 1 });
    r.p1.failWith = new ProviderError("GOWA caiu", false);
    const t = plus(NOW, 60 * MIN);
    for (let i = 0; i < 4; i++) await tickAll(deps(r, plus(t, i * 40_000)));
    const one = (await r.repo.getAccount(r.accounts[0].id))!;
    const two = (await r.repo.getAccount(r.accounts[1].id))!;
    expect(one.paused).toBe(true);
    expect(one.pausedReason).toMatch(/falhas de envio/);
    expect(two.paused).toBe(false);
    expect(r.p2.sent.length).toBeGreaterThanOrEqual(1);
    expect((await r.repo.getSettings()).automation.paused).toBe(false); // a pausa geral não foi tocada
  });

  it("número pausado não envia; a pausa geral para todos", async () => {
    const r = await ready();
    await setAccountPaused(r.repo, r.accounts[1].id, true);
    const t = plus(NOW, 60 * MIN);
    for (let i = 0; i < 4; i++) await tickAll(deps(r, plus(t, i * 40_000)));
    expect(r.p2.sent).toHaveLength(0);
    expect(r.p1.sent.length).toBeGreaterThanOrEqual(1);

    await r.repo.saveAutomation({ paused: true, pausedReason: "geral" });
    const before = r.p1.sent.length;
    const res = await tickAll(deps(r, plus(t, 10 * MIN)));
    expect(res).toEqual({ action: "paused", reason: "geral" });
    expect(r.p1.sent).toHaveLength(before);
  });

  it("um número desconectado não trava os outros", async () => {
    const r = await ready();
    r.p1.connected = false;
    const t = plus(NOW, 60 * MIN);
    for (let i = 0; i < 4; i++) await tickAll(deps(r, plus(t, i * 40_000)));
    expect(r.p1.sent).toHaveLength(0);
    expect(r.p2.sent.length).toBeGreaterThanOrEqual(1);
  });

  it("um número só: tickAll é a volta de sempre (sem filtro de número)", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 5, offset: 0 });
    await repo.bulkSetStage(rows.map((x) => x.id), "qualificado");
    await repo.createAccount({ name: "Número 1", legacy: true });
    await live(repo);
    const p = new RecordingProvider("solo");
    await prepareBatch(repo, NOW);
    const drafts = await repo.listMessages({ statuses: ["draft"], limit: 20 });
    await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
    const res = await tickAll({ repo, provider: p, providerFor: () => p, now: plus(NOW, 60 * MIN), rng, sleep });
    expect(res.action).toBe("sent");
    expect(await repo.listMessages({ statuses: ["sent"], direction: "out", limit: 10 })).toHaveLength(1);
    expect(await tick({ repo, provider: p, now: plus(NOW, 61 * MIN), rng, sleep })).toMatchObject({ action: "deferred" });
  });
});

describe("resposta que chega", () => {
  const evt = (phone: string, deviceId?: string) => {
    const parsed = parseWebhook({
      event: "message",
      ...(deviceId ? { device_id: deviceId } : {}),
      payload: { id: `IN-${Math.random().toString(36).slice(2)}`, chat_id: `${phone.replace("+", "")}@s.whatsapp.net`, body: "Pode sim", timestamp: NOW.toISOString(), is_from_me: false },
    });
    if (parsed.kind !== "message") throw new Error("esperava mensagem");
    return parsed;
  };

  it("no número certo o agente responde normalmente", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id], accountId: accounts[1].id, rng: seeded(13) });
    const conv = (await repo.findConversationByLead(leads[0].id))!;
    const r = await handleMessageEvent(repo, evt(conv.phoneE164), plus(NOW, 5 * MIN), { arrivedOn: accounts[1].id, rng });
    expect(r).toMatchObject({ handled: true });
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
  });

  it("em OUTRO número o agente não responde: a conversa vem para o dono decidir", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id], accountId: accounts[1].id, rng: seeded(14) });
    const conv = (await repo.findConversationByLead(leads[0].id))!;
    const r = await handleMessageEvent(repo, evt(conv.phoneE164), plus(NOW, 5 * MIN), { arrivedOn: accounts[0].id, rng });
    expect(r).toMatchObject({ handled: true, draftedReply: false });
    const events = await repo.listEvents({ types: ["automacao"], limit: 5 });
    expect(JSON.stringify(events.map((e) => e.payload))).toMatch(/respondeu no Número 1, mas foi abordado pelo Número 2/);
    expect((await repo.listMessages({ conversationId: conv.id, kinds: ["reply"], direction: "out", limit: 5 }))).toHaveLength(0);
  });
});

describe("aposentar um número", () => {
  it("cancela o que não saiu e libera os leads", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 3).map((l) => l.id), accountId: accounts[1].id, rng: seeded(15) });
    const r = await retireAccount(repo, accounts[1].id);
    expect(r.cancelled).toBe(3);
    expect(r.account).toMatchObject({ retired: true, paused: true });
    expect(await repo.listMessages({ accountId: accounts[1].id, statuses: ["draft", "approved"], limit: 10 })).toHaveLength(0);
    // com o original como único número ativo, volta a ser o painel de sempre
    expect((await loadRoster(repo)).multi).toBe(false);
  });

  it("o original também se aposenta: cancela o que não saiu, solta o aparelho e guarda o histórico", async () => {
    const { repo, leads, accounts } = await setup({ accounts: 1 });
    await repo.updateAccount(accounts[0].id, { gowaDeviceId: "num-velho" });
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 2).map((l) => l.id), accountId: accounts[0].id, rng: seeded(21) });
    const conversationsBefore = (await repo.listConversations({ limit: 50 })).total;
    expect(conversationsBefore).toBeGreaterThan(0);
    const r = await retireAccount(repo, accounts[0].id);
    expect(r.cancelled).toBe(2);
    expect(r.account).toMatchObject({ legacy: true, retired: true, paused: true, gowaDeviceId: null });
    expect(await repo.listMessages({ accountId: accounts[0].id, statuses: ["draft", "approved"], limit: 10 })).toHaveLength(0);
    // nada se apaga: as conversas do original continuam no banco
    expect((await repo.listConversations({ limit: 50 })).total).toBe(conversationsBefore);
    await expect(retireAccount(repo, accounts[0].id)).rejects.toThrow(/não existe mais/);
  });
});

describe("modo de números sem o original", () => {
  it("só o original ativo é 'um número só'; sem ele, qualquer número ativo usa o próprio aparelho (vários números)", async () => {
    const repo = createMemoryRepo();
    const original = await repo.createAccount({ name: "Número 1", legacy: true, gowaDeviceId: "num-velho" });
    expect((await loadRoster(repo)).multi).toBe(false);

    // o original sai e nenhum outro foi cadastrado: nada envia, e o modo de um número só (aparelho padrão) não volta
    await retireAccount(repo, original.id);
    const empty = await loadRoster(repo);
    expect(empty.active).toHaveLength(0);
    expect(empty.multi).toBe(true);
    expect(empty.defaultId).toBeNull();

    // um número novo sozinho: já é vários números, com o aparelho dele e ele como padrão
    const novo = await repo.createAccount({ name: "Número 2", gowaDeviceId: "num-novo" });
    const one = await loadRoster(repo);
    expect(one.multi).toBe(true);
    expect(one.active.map((a) => a.id)).toEqual([novo.id]);
    expect(one.defaultId).toBe(novo.id);
  });

  it("a volta do worker com o original aposentado e nenhum outro número não envia nada", async () => {
    const { repo, accounts } = await setup({ accounts: 1 });
    await live(repo);
    await retireAccount(repo, accounts[0].id);
    const provider = new RecordingProvider("padrão");
    const r = await tickAll({ repo, provider, providerFor: () => provider, now: NOW, rng, sleep });
    expect(r).toMatchObject({ action: "multi", accounts: [] });
    expect(provider.sent).toHaveLength(0);
  });
});

const NAMES = [
  "Studio Bela", "Espaço Renove", "Clínica Aurora", "Lumina Estética", "Casa Viva", "Atelier Flor", "Núcleo Zen", "Instituto Brisa",
  "Salão Mirante", "Corpo e Alma", "Vida Plena", "Beleza Pura", "Nova Pele", "Estúdio Sol", "Harmonia Total", "Oásis Beauty",
  "Pérola Rara", "Essência Clara", "Toque Real", "Dunas Spa",
];

describe("variação das aberturas", () => {
  const ctx: TemplateContext = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor", flow: "qualificar" };
  const lead = (over: Partial<TemplateLead> = {}): TemplateLead => ({
    id: "lead-1",
    name: "Studio Bela",
    neighborhood: "Aldeota",
    city: "Fortaleza",
    category: "Clínica de estética",
    niche: "Estética",
    rating: 4.8,
    reviewsCount: 120,
    websiteKind: "none",
    ...over,
  });

  it("lruPick escolhe entre os usados há mais tempo e as nunca usadas vêm primeiro", () => {
    expect([0, 1, 2]).toContain(lruPick(5, [], () => 0.99));
    // 0,1,2 já usados: sobram 3 e 4, que lideram o grupo dos mais antigos
    const seen = new Set<number>();
    for (const r of [0, 0.34, 0.67, 0.99]) seen.add(lruPick(5, [0, 1, 2], () => r));
    expect([...seen].every((x) => [3, 4, 0].includes(x))).toBe(true);
    expect(lruPick(5, [3, 4, 0, 1], () => 0)).toBe(2); // a única nunca usada
  });

  it("o código de estilo vai na variante e o teste A/B continua lendo o ângulo", () => {
    const o = buildOpening(lead(), { ...ctx, style: { greet: 2, intro: 3, ask: 1, angle: "agenda" } });
    expect(o.variant).toBe("abertura-none-agenda~g2i3q1");
    expect(parseOpeningVariant(o.variant)).toEqual({ group: "none", angle: "agenda", ia: false });
    expect(parseOpeningVariant("abertura-none-agenda-ia~g2i3q1")).toEqual({ group: "none", angle: "agenda", ia: true });
    expect(parseStyleCode(o.variant)).toEqual({ greet: 2, intro: 3, ask: 1 });
    expect(parseStyleCode("abertura-none-agenda")).toBeNull();
  });

  it("sem estilo o texto é o de sempre (um número só não muda)", () => {
    const plain = buildOpening(lead(), ctx);
    expect(plain.variant).not.toContain("~");
    expect(plain.body).toMatch(/^(Oi|Olá)! Sou o Jonathan Kelvin, desenvolvedor\./);
  });

  it("todas as combinações passam no humanizador, não levam a linha 'responda PARE' e têm UMA pergunta", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      for (const angle of ANGLES[kind]) {
        for (const named of [false, true]) {
          for (let greet = 0; greet < 5; greet++) {
            for (let intro = 0; intro < 5; intro++) {
              for (let ask = 0; ask < 4; ask++) {
                const l = lead({ websiteKind: kind, name: named ? "Dra. Heloisa Lima - Estética Avançada" : "Studio Bela" });
                const o = buildOpening(l, { ...ctx, style: { greet, intro, ask, angle: angle.id } });
                const tag = `${kind}/${angle.id}/g${greet}i${intro}q${ask}${named ? "/nome" : ""}`;
                expect(o.body, tag).not.toMatch(/PARE|parar de receber/i);
                expect((o.body.match(/\?/g) ?? []).length, tag).toBe(1);
                expect(o.body, tag).toContain("Jonathan Kelvin");
                const checked = checkMessage(o.body, "opening");
                expect(checked.issues.filter((i) => i.severity === "error"), tag).toEqual([]);
                expect(checked.issues.filter((i) => i.severity === "warn").length, tag).toBeLessThanOrEqual(MAX_WARNINGS);
              }
            }
          }
        }
      }
    }
  });

  it("o que ele faz também varia: cada forma passa no humanizador, leva o nome e não repete a frase longa fixa", () => {
    const longRole = ctx.senderRole;
    const seen = new Set<string>();
    for (let role = 0; role < 8; role++) {
      for (const kind of ["none", "social", "weak"] as const) {
        for (const named of [false, true]) {
          const l = lead({ websiteKind: kind, name: named ? "Dra. Heloisa Lima - Estética Avançada" : "Studio Bela" });
          const o = buildOpening(l, { ...ctx, senderRole: "desenvolvedor e ajudo empresas a se posicionarem na internet", style: { greet: role % 5, intro: (role * 2) % 5, ask: role % 4, role, angle: ANGLES[kind][role % 5].id } });
          const tag = `r${role}/${kind}/${named ? "nome" : "sem"}`;
          expect(o.variant, tag).toMatch(new RegExp(`~g${role % 5}i${(role * 2) % 5}q${role % 4}r${role}$`));
          expect(o.body, tag).toContain("Jonathan Kelvin");
          expect(o.body, tag).not.toMatch(/PARE/);
          const checked = checkMessage(o.body, "opening");
          expect(checked.issues.filter((i) => i.severity === "error"), tag).toEqual([]);
          expect(checked.issues.filter((i) => i.severity === "warn").length, tag).toBeLessThanOrEqual(MAX_WARNINGS);
          if (kind === "none" && !named) seen.add(o.parts[0].replace(/^[^.!]*[.!]\s*/, ""));
        }
      }
    }
    // 8 jeitos diferentes de dizer o que faz; só o primeiro é a frase longa das Configurações
    expect(seen.size).toBe(8);
    expect([...seen].filter((s) => s.includes("se posicionarem na internet"))).toHaveLength(1);
    expect(longRole).toBeDefined();
  });

  it("sem o 'o que faz' no estilo vale o texto das Configurações (o de sempre)", () => {
    const o = buildOpening(lead(), { ...ctx, style: { greet: 0, intro: 0, ask: 0, angle: "elogio" } });
    expect(o.parts[0]).toMatch(/Sou o Jonathan Kelvin, desenvolvedor\./);
    expect(o.variant).toMatch(/~g0i0q0$/); // variante antiga: sem o "r"
  });

  it("num lote, a frase de apresentação não é a mesma em todas (o que a Meta enxerga como texto repetido)", () => {
    const history = emptyHistory();
    const bodies: string[] = [];
    const random = seeded(7);
    const roles: number[] = [];
    const introductions = new Set<string>();
    for (let i = 0; i < 35; i++) {
      const l = lead({ id: `lead-${i}`, name: NAMES[i % NAMES.length], websiteKind: (["none", "social", "weak"] as const)[i % 3] });
      const choice = chooseOpeningStyle({ lead: l, ctx: { ...ctx, senderRole: "desenvolvedor e ajudo empresas a se posicionarem na internet" }, history, recentBodies: bodies, rng: random })!;
      remember(history, bodies, choice, choice.body);
      roles.push(choice.style.role!);
      introductions.add(choice.body.split("\n\n")[0].replace(/^[^.!]*[.!]\s*/, ""));
    }
    const counts = new Map<number, number>();
    for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1);
    expect(counts.size).toBe(8); // as 8 formas de dizer o que faz entram no lote...
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6); // ...e nenhuma passa de ~1/6 dele (antes: 28 de 35 iguais)
    expect(introductions.size).toBeGreaterThanOrEqual(20); // verbo da apresentação x o que faz: quase nenhuma igual à outra
  });

  it("formal (advocacia): só saudações sóbrias, sempre com Olá", () => {
    const l = lead({ name: "Silva Advocacia", niche: "Advocacia", category: "Escritório de advocacia" });
    for (let greet = 0; greet < 5; greet++) {
      const o = buildOpening(l, { ...ctx, style: { greet, intro: 0, ask: 0, angle: "elogio" } });
      expect(o.body, `g${greet}`).toMatch(/^Olá/);
    }
  });

  it("similarity: o mesmo texto é 1; textos de ângulos diferentes ficam bem abaixo do limite", () => {
    const a = buildOpening(lead(), { ...ctx, style: { greet: 0, intro: 0, ask: 0, angle: "elogio" } }).body;
    const b = buildOpening(lead(), { ...ctx, style: { greet: 0, intro: 0, ask: 0, angle: "direta" } }).body;
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, b)).toBeLessThan(0.6);
    expect(similarity(a, "")).toBe(0);
  });

  it("um lote de 20 aberturas não repete a combinação nem fica parecido demais", async () => {
    const history = emptyHistory();
    const bodies: string[] = [];
    const random = seeded(42);
    const codes: string[] = [];
    for (let i = 0; i < 20; i++) {
      const l = lead({ id: `lead-${i}`, name: NAMES[i], websiteKind: (["none", "social", "weak"] as const)[i % 3] });
      const choice = chooseOpeningStyle({ lead: l, ctx, history, recentBodies: bodies, rng: random })!;
      expect(choice.similarity).toBeLessThan(0.6);
      remember(history, bodies, choice, choice.body);
      codes.push(`${choice.style.greet}${choice.style.intro}${choice.style.ask}${choice.style.angle}`);
    }
    expect(new Set(codes).size).toBe(20);
    const intros = history.intro.slice(0, 10);
    expect(new Set(intros).size).toBeGreaterThanOrEqual(4); // as apresentações rodam
    expect(new Set(history.greet.slice(0, 10)).size).toBeGreaterThanOrEqual(4);
    // nunca duas aberturas seguidas com a mesma apresentação E a mesma saudação
    for (let i = 1; i < 20; i++) expect(history.intro[i] === history.intro[i - 1] && history.greet[i] === history.greet[i - 1]).toBe(false);
  });

  it("o histórico vem das variantes recentes (de todos os números)", () => {
    const h = historyFrom(["abertura-none-elogio~g1i2q3", "abertura-weak-direta-ia~g0i4q1", "agente:price", null, "abertura-none-2"]);
    expect(h).toEqual({ greet: [1, 0], intro: [2, 4], ask: [3, 1], role: [], angle: ["elogio", "direta"] });
    // com o "o que ele faz" (r), a variante nova também entra no histórico
    expect(historyFrom(["abertura-none-elogio-ia~g1i2q3r5"]).role).toEqual([5]);
  });

  it("entre os números, as aberturas do mesmo grupo de leads não ficam iguais", async () => {
    const { repo, leads, accounts } = await setup({ accounts: 4 });
    const groups = [0, 1, 2, 3].map((i) => leads.slice(i * 3, i * 3 + 3).map((l: Lead) => l.id));
    for (const [i, ids] of groups.entries()) {
      await prepareLeadsForAccount(repo, NOW, { leadIds: ids, accountId: accounts[i].id, rng: seeded(100 + i) });
    }
    const all = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    expect(all.length).toBeGreaterThanOrEqual(10);
    const bodies = all.map((m) => m.body);
    expect(new Set(bodies).size).toBe(bodies.length);
    const worst = bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => similarity(a, b))).reduce((m, x) => Math.max(m, x), 0);
    expect(worst).toBeLessThan(0.75);
    // apresentações: nem todas começam do mesmo jeito
    const starts = new Set(bodies.map((b) => b.split("\n\n")[0]));
    expect(starts.size).toBeGreaterThan(bodies.length / 2);
  });

  it("reescrever um rascunho tira um jeito diferente do que já estava lá", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id], accountId: accounts[0].id, rng: seeded(20) });
    const [before] = await repo.listMessages({ kinds: ["opening"], limit: 5 });
    const r = await rewriteOpenings(repo, [before.id], { rng: seeded(21) });
    expect(r.rewritten).toBe(1);
    const after = (await repo.getMessage(before.id))!;
    expect(after.body).not.toBe(before.body);
    expect(parseStyleCode(after.variant)).not.toEqual(parseStyleCode(before.variant));
  });
});

describe("administração dos aparelhos do GOWA", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("lista, cria e consulta aparelhos com a senha do GOWA, sem nunca expô-la", async () => {
    const calls: { url: string; method: string; auth: string | null; body: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, method: init.method ?? "GET", auth: headers.authorization ?? null, body: (init.body as string) ?? null });
      if (url.endsWith("/devices") && !init.method) {
        return json({ results: [{ id: "padrao", phone_number: "5585988887777", display_name: "Jonathan", state: "logged_in", jid: "5585988887777@s.whatsapp.net", created_at: "2026-10-01T00:00:00Z" }] });
      }
      if (url.endsWith("/devices") && init.method === "POST") return json({ results: { id: "num-abc123", state: "disconnected", jid: "" } });
      if (url.endsWith("/status")) return json({ results: { device_id: "num-abc123", is_connected: true, is_logged_in: false } });
      return json({ message: "não achei" }, 404);
    }) as unknown as typeof fetch;
    const admin = new GowaAdmin({ baseUrl: "http://127.0.0.1:3300/", basicAuth: "u:s", fetchImpl });

    expect(await admin.listDevices()).toEqual([
      { id: "padrao", phone: "5585988887777", displayName: "Jonathan", state: "logged_in", jid: "5585988887777@s.whatsapp.net", createdAt: "2026-10-01T00:00:00Z" },
    ]);
    const created = await admin.addDevice("num-abc123");
    expect(created).toMatchObject({ id: "num-abc123", state: "disconnected", jid: null });
    expect(calls[1].body).toBe(JSON.stringify({ device_id: "num-abc123" }));
    expect(await admin.deviceStatus("num-abc123")).toEqual({ connected: true, loggedIn: false });
    expect(calls.every((c) => c.auth === `Basic ${Buffer.from("u:s").toString("base64")}`)).toBe(true);
    await expect(admin.deviceStatus("nao-existe")).resolves.toBeDefined(); // a rota de status do mock responde por sufixo
  });

  it("o QR vem como imagem pronta (buscada com a senha) e o pareamento por código devolve o código", async () => {
    const png = Buffer.from([137, 80, 78, 71]);
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/login")) return json({ results: { device_id: "d1", qr_link: "http://localhost:3300/statics/qrcode/scan-qr-1.png", qr_duration: 25 } });
      if (url.includes("/statics/qrcode/")) return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
      if (url.includes("/login/code")) return json({ results: { device_id: "d1", pair_code: "ABCD-1234" } });
      return json({}, 404);
    }) as unknown as typeof fetch;
    const admin = new GowaAdmin({ baseUrl: "http://127.0.0.1:3300", basicAuth: "u:s", fetchImpl });
    const qr = await admin.loginQr("d1");
    expect(qr.seconds).toBe(25);
    expect(qr.qrDataUrl).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(await admin.loginCode("d1", "5585988887777")).toBe("ABCD-1234");
  });

  it("erros viram mensagens claras: senha errada, aparelho que não existe", async () => {
    const make = (status: number) => new GowaAdmin({ baseUrl: "http://x", fetchImpl: (async () => json({ message: "x" }, status)) as unknown as typeof fetch });
    await expect(make(401).listDevices()).rejects.toThrow(/usuário e a senha/);
    await expect(make(404).deviceStatus("zzz")).rejects.toThrow(/não conhece esse aparelho/);
    await expect(make(500).listDevices()).rejects.toMatchObject({ retryable: true });
  });
});

describe("cadastro × aparelhos do GOWA", () => {
  it("o número original é ligado ao único aparelho do GOWA e ganha telefone e endereço; o que já está certo não é reescrito", async () => {
    const { repo, accounts } = await setup();
    const devices = [{ id: "padrao", jid: "5585988887777@s.whatsapp.net", phone: "5585988887777" }];
    expect(await syncDevices(repo, devices, null)).toBe(1);
    expect(await repo.getAccount(accounts[0].id)).toMatchObject({ gowaDeviceId: "padrao", jid: "5585988887777@s.whatsapp.net", phoneE164: "+5585988887777" });
    expect(await syncDevices(repo, devices, null)).toBe(0); // nada mudou
  });

  it("com mais de um aparelho o original só é fixado pelo GOWA_DEVICE_ID; nunca se adivinha", async () => {
    const { repo, accounts } = await setup();
    const devices = [
      { id: "a", jid: null, phone: null },
      { id: "b", jid: "5585911112222@s.whatsapp.net", phone: "5585911112222" },
    ];
    await syncDevices(repo, devices, null);
    expect((await repo.getAccount(accounts[0].id))!.gowaDeviceId).toBeNull();
    await syncDevices(repo, devices, "b");
    expect((await repo.getAccount(accounts[0].id))!.gowaDeviceId).toBe("b");
  });

  it("os números extras só ganham o endereço e o telefone do aparelho deles", async () => {
    const { repo, accounts } = await setup();
    await syncDevices(repo, [{ id: "dev2", jid: "5585933334444@s.whatsapp.net", phone: "5585933334444" }], "padrao");
    expect(await repo.getAccount(accounts[1].id)).toMatchObject({ gowaDeviceId: "dev2", jid: "5585933334444@s.whatsapp.net", phoneE164: "+5585933334444" });
  });
});

describe("aparelho apagado no GOWA e troca de aparelho", () => {
  const notFound = (async () => new Response(JSON.stringify({ code: "DEVICE_NOT_FOUND", message: "device not found" }), { status: 404 })) as unknown as typeof fetch;

  it("o GOWA responde 404 para o aparelho de um número: o provedor diz que ele foi apagado (e nunca que 'falta o QR')", async () => {
    const withDevice = await new GowaProvider({ baseUrl: "http://x", deviceId: "cc6a3a56", fetchImpl: notFound }).status();
    expect(withDevice).toMatchObject({ connected: false, missing: true, detail: "O aparelho deste número foi apagado do GOWA" });
    // sem aparelho indicado, 404 não quer dizer "apagado": segue como erro comum
    const without = await new GowaProvider({ baseUrl: "http://x", fetchImpl: notFound }).status();
    expect(without.missing).toBeUndefined();
  });

  async function twoLive() {
    const s = await setup();
    await live(s.repo);
    await s.repo.updateAccount(s.accounts[1].id, { paused: false });
    await prepareLeadsForAccount(s.repo, NOW, { leadIds: s.leads.slice(0, 2).map((l) => l.id), accountId: s.accounts[0].id, rng: seeded(40) });
    await prepareLeadsForAccount(s.repo, NOW, { leadIds: s.leads.slice(2, 4).map((l) => l.id), accountId: s.accounts[1].id, rng: seeded(41) });
    const drafts = await s.repo.listMessages({ statuses: ["draft"], limit: 20 });
    await approveMessages(s.repo, drafts.map((m) => m.id), NOW, rng);
    return s;
  }

  it("aparelho apagado: o worker pausa SÓ aquele número, com o motivo; a fila e as conversas dele ficam, e o outro segue", async () => {
    const s = await twoLive();
    const p1 = new RecordingProvider("n1");
    const p2 = new RecordingProvider("n2");
    p1.missing = true;
    const providerFor = (a: Account) => (a.id === s.accounts[1].id ? p2 : p1);
    const t = plus(NOW, 60 * MIN);
    for (let i = 0; i < 4; i++) await tickAll({ repo: s.repo, provider: p1, providerFor, now: plus(t, i * 40_000), rng, sleep });

    const one = (await s.repo.getAccount(s.accounts[0].id))!;
    expect(one.paused).toBe(true);
    expect(one.pausedReason).toMatch(/apagado do GOWA/);
    expect(p1.sent).toHaveLength(0); // nada saiu por ele
    // a fila dele continua intacta, esperando um aparelho novo
    expect(await s.repo.listMessages({ accountId: s.accounts[0].id, statuses: ["approved"], limit: 10 })).toHaveLength(2);
    expect((await s.repo.getAccount(s.accounts[1].id))!.paused).toBe(false);
    expect(p2.sent.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify((await s.repo.listEvents({ types: ["automacao"], limit: 10 })).map((e) => e.payload))).toMatch(/Número 1 pausado: O aparelho dele foi apagado/);
  });

  it("o retrato do número mostra 'sem aparelho' em vez de 'desconectado'", async () => {
    const { repo, accounts } = await setup();
    const gone = new RecordingProvider("x");
    gone.missing = true;
    const view = await getNumbersOverview(repo, (a) => (a.id === accounts[0].id ? gone : new RecordingProvider("ok")), NOW);
    expect(view.find((v) => v.id === accounts[0].id)).toMatchObject({ deviceMissing: true, connected: false });
    expect(view.find((v) => v.id === accounts[1].id)).toMatchObject({ deviceMissing: false, connected: true });
  });

  it("ligar o número a outro aparelho mantém nome, conversas e fila, zera falhas e deixa PAUSADO até o dono liberar", async () => {
    const { repo, leads, accounts } = await setup();
    await repo.updateAccount(accounts[0].id, { gowaDeviceId: "antigo", jid: "5585911112222@s.whatsapp.net", phoneE164: "+5585911112222" });
    await repo.saveAccountState(accounts[0].id, { consecutiveFailures: 2, lastResult: "falha: x" });
    await prepareLeadsForAccount(repo, NOW, { leadIds: [leads[0].id], accountId: accounts[0].id, rng: seeded(42) });

    const r = await relinkAccount(repo, accounts[0].id, { id: "novo", jid: null, phone: null });
    expect(r).toMatchObject({ name: "Número 1", gowaDeviceId: "novo", jid: null, phoneE164: null, paused: true, retired: false });
    expect(r.pausedReason).toMatch(/Aparelho novo/);
    expect(await repo.getAccountState(accounts[0].id)).toMatchObject({ consecutiveFailures: 0, lastResult: null });
    // a conversa e o rascunho continuam do mesmo número
    expect((await repo.findConversationByLead(leads[0].id))!.accountId).toBe(accounts[0].id);
    expect(await repo.listMessages({ accountId: accounts[0].id, statuses: ["draft"], limit: 5 })).toHaveLength(1);
  });

  it("um aparelho só serve a um número ativo; o aposentado o devolve", async () => {
    const { repo, accounts } = await setup({ accounts: 3 });
    // o Número 2 usa "dev2"; o Número 1 não pode ficar com ele
    await expect(relinkAccount(repo, accounts[0].id, { id: "dev2", jid: null, phone: null })).rejects.toThrow(/Esse aparelho já é do Número 2/);
    await retireAccount(repo, accounts[1].id);
    expect((await repo.getAccount(accounts[1].id))!.gowaDeviceId).toBeNull();
    const ok = await relinkAccount(repo, accounts[0].id, { id: "dev2", jid: "5585933334444@s.whatsapp.net", phone: "5585933334444" });
    expect(ok).toMatchObject({ gowaDeviceId: "dev2", jid: "5585933334444@s.whatsapp.net", phoneE164: "+5585933334444" });
    await expect(relinkAccount(repo, accounts[1].id, { id: "x", jid: null, phone: null })).rejects.toThrow(/não existe mais/); // aposentado
  });

  it("quais aparelhos do GOWA estão livres para ligar a um número", () => {
    const devices = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const accounts = [
      { gowaDeviceId: "a", retired: false },
      { gowaDeviceId: "b", retired: true }, // aposentado não conta
      { gowaDeviceId: null, retired: false },
    ];
    expect(freeDevices(devices, accounts).map((d) => d.id)).toEqual(["b", "c"]);
  });
});

describe("retrato dos números e fila por número", () => {
  it("cada número mostra o que é dele: enviadas hoje, fila, rascunhos e taxa de resposta", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 2).map((l) => l.id), accountId: accounts[1].id, rng: seeded(30) });
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(2, 3).map((l) => l.id), accountId: accounts[0].id, rng: seeded(31) });
    const [first] = await repo.listMessages({ accountId: accounts[1].id, statuses: ["draft"], limit: 5 });
    await approveMessages(repo, [first.id], NOW, rng);

    const provider = new RecordingProvider("x");
    const view = await getNumbersOverview(repo, () => provider, NOW);
    const by = Object.fromEntries(view.map((v) => [v.name, v]));
    expect(by["Número 2"]).toMatchObject({ queued: 1, drafts: 1, sentToday: 0, capToday: 3, connected: true, paused: false });
    expect(by["Número 1"]).toMatchObject({ queued: 0, drafts: 1, capToday: 8, legacy: true });
  });

  it("o teto é conferido por número ao checar a fila", async () => {
    const { repo, leads, accounts } = await setup();
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(0, 5).map((l) => l.id), accountId: accounts[1].id, rng: seeded(32) });
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(5, 10).map((l) => l.id), accountId: accounts[0].id, rng: seeded(33) });
    const drafts = await repo.listMessages({ statuses: ["draft"], limit: 50 });
    await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
    const cfg = (await repo.getSettings()).automation;
    expect((await checkQueue(repo, cfg, NOW)).overCap).toBe(0); // a aprovação já respeitou o teto de cada um

    // tudo do Número 2 (teto 3) marcado para o mesmo dia: 2 a mais que o teto dele. Os 5 do original (teto 8) continuam ok
    for (const m of await repo.listMessages({ accountId: accounts[1].id, statuses: ["approved"], limit: 50 })) {
      await repo.updateMessage(m.id, { scheduledFor: plus(NOW, 3 * 60 * MIN).toISOString() });
    }
    expect((await checkQueue(repo, cfg, NOW)).overCap).toBe(2);
  });

  it("follow-up segue o número que abordou o lead e respeita o teto dele", async () => {
    const { repo, leads, accounts } = await setup();
    const threeDaysAgo = plus(NOW, -3 * 24 * 60 * MIN).toISOString();
    for (const lead of leads.slice(0, 5)) {
      const conv = await repo.ensureConversation(lead.id, lead.phoneE164!, accounts[1].id);
      await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: threeDaysAgo });
      await repo.setStage(lead.id, "contatado");
    }
    const r = await prepareBatch(repo, NOW, { rng: seeded(34) });
    expect(r.followUps).toBe(3); // o teto do Número 2
    expect(r.skipped).toEqual({ "teto do número": 2 });
    const drafts = await repo.listMessages({ kinds: ["followup"], statuses: ["draft"], limit: 10 });
    expect(drafts.every((m) => m.accountId === accounts[1].id)).toBe(true);
  });
});
