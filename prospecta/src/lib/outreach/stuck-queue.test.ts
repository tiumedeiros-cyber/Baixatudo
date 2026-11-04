import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import type { Account } from "./accounts";
import { approveMessages, prepareLeadsForAccount, tickAll } from "./engine";
import { moveQueue } from "./move-queue";
import type { ProviderStatus, WhatsAppProvider } from "./provider";
import { loadRoster } from "./roster";
import { describeStuck, detectStuckQueues, lateText, loadStuckQueues, STUCK_GRACE_MIN, type StuckInput } from "./stuck-queue";
import type { Message } from "./types";

/**
 * "Quando um número cair com a fila parada, avise" (dono, 29/10): o painel mostra uma faixa em toda página. Só lê o banco e
 * não envia nem muda nada.
 */

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
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
  async status(): Promise<ProviderStatus> {
    return { connected: this.connected, loggedIn: this.connected, mode: this.mode, detail: this.connected ? "WhatsApp conectado" : "desconectado" };
  }
  async typing() {}
  async sendText(phone: string, text: string) {
    this.sent.push({ phone, text });
    return { id: `m-${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

/** Uma aprovada de prospecção do número, marcada para `at` minutos depois de NOW. */
const msg = (accountId: string | null, at: number, status: Message["status"] = "approved"): Message =>
  ({ id: `m${Math.random()}`, accountId, status, kind: "opening", direction: "out", scheduledFor: min(at).toISOString() }) as Message;

async function twoAccounts() {
  const repo = createMemoryRepo();
  const caps = { week1: null, week2: null, steady: 6 };
  const a = await repo.createAccount({ name: "JK 01", gowaDeviceId: "dev1", paused: false, caps });
  const b = await repo.createAccount({ name: "JK 02", gowaDeviceId: "dev2", paused: false, caps });
  return { repo, a, b, roster: await loadRoster(repo) };
}

const input = (roster: StuckInput["roster"], over: Partial<StuckInput> = {}): StuckInput => ({
  roster,
  overdue: [],
  sending: [],
  automation: { paused: false },
  lastTickAt: min(0).toISOString(),
  now: min(0),
  ...over,
});

describe("fila parada: quando avisar", () => {
  it("avisa do número que não envia e deixa quieto o que está em dia", async () => {
    const { a, roster } = await twoAccounts();
    const r = detectStuckQueues(input(roster, { overdue: [msg(a.id, -192), msg(a.id, -150), msg(a.id, -20)] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ accountId: a.id, name: "JK 01", cause: "offline", overdue: 3, sending: 0, lateMin: 192, canMove: true, reason: null });
  });

  it("o robô de envio parado vira a causa quando não houve volta há minutos (ou nunca)", async () => {
    const { a, roster } = await twoAccounts();
    const stale = detectStuckQueues(input(roster, { overdue: [msg(a.id, -60)], lastTickAt: min(-10).toISOString() }));
    expect(stale[0].cause).toBe("worker");
    const never = detectStuckQueues(input(roster, { overdue: [msg(a.id, -60)], lastTickAt: null }));
    expect(never[0].cause).toBe("worker");
    const fresh = detectStuckQueues(input(roster, { overdue: [msg(a.id, -60)], lastTickAt: min(-4).toISOString() }));
    expect(fresh[0].cause).toBe("offline");
  });

  it("número pausado com fila vencida avisa com o motivo da pausa", async () => {
    const { repo, a, roster: before } = await twoAccounts();
    expect(before.active).toHaveLength(2);
    await repo.updateAccount(a.id, { paused: true, pausedReason: "3 falhas de envio seguidas" });
    const roster = await loadRoster(repo);
    const r = detectStuckQueues(input(roster, { overdue: [msg(a.id, -45)] }));
    expect(r[0]).toMatchObject({ cause: "paused", reason: "3 falhas de envio seguidas" });
    expect(describeStuck(r[0])).toBe("JK 01 está pausado e tem 1 mensagem atrasada na fila (a mais antiga há 45 min). Motivo: 3 falhas de envio seguidas");
  });

  it("não avisa com a automação inteira pausada, com número aposentado nem com o número sem nada vencido", async () => {
    const { repo, a, b, roster } = await twoAccounts();
    expect(detectStuckQueues(input(roster, { overdue: [msg(a.id, -60)], automation: { paused: true } }))).toEqual([]);
    expect(detectStuckQueues(input(roster))).toEqual([]);
    await repo.updateAccount(b.id, { retired: true });
    const withRetired = await loadRoster(repo);
    expect(detectStuckQueues(input(withRetired, { overdue: [msg(b.id, -60)] }))).toEqual([]);
  });

  it("'enviando' recente é o envio normal e não avisa; o velho, sozinho, avisa como mensagem presa", async () => {
    const { a, roster } = await twoAccounts();
    expect(detectStuckQueues(input(roster, { sending: [msg(a.id, -2, "sending")] }))).toEqual([]);
    expect(detectStuckQueues(input(roster, { sending: [msg(a.id, -(STUCK_GRACE_MIN - 1), "sending")] }))).toEqual([]);
    const r = detectStuckQueues(input(roster, { sending: [msg(a.id, -380, "sending")] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ accountId: a.id, cause: "hung", overdue: 0, sending: 1, lateMin: 380, canMove: true });
    expect(describeStuck(r[0])).toBe(
      'JK 01 tem 1 mensagem presa em "enviando" (marcada para há 6 h 20 min): o robô pegou e não terminou. Confira no chat do celular se saiu e, se não saiu, cancele na Fila.',
    );
  });

  it("com fila vencida, a presa em 'enviando' entra como detalhe e a causa continua sendo a da fila", async () => {
    const { a, roster } = await twoAccounts();
    const r = detectStuckQueues(input(roster, { overdue: [msg(a.id, -60)], sending: [msg(a.id, -90, "sending")] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cause: "offline", overdue: 1, sending: 1, lateMin: 60 });
    expect(describeStuck(r[0])).toMatch(/Também há 1 presa em "enviando": confira no celular se saiu\.$/);
  });

  it("ordena pelo mais atrasado e conta cada número só com as mensagens dele", async () => {
    const { a, b, roster } = await twoAccounts();
    const r = detectStuckQueues(input(roster, { overdue: [msg(b.id, -300), msg(a.id, -30), msg(a.id, -20), msg(b.id, -280)] }));
    expect(r.map((q) => [q.name, q.overdue, q.lateMin])).toEqual([
      ["JK 02", 2, 300],
      ["JK 01", 2, 30],
    ]);
  });

  it("o número original (mensagens sem número guardado) também avisa, e sem outro número não há para onde passar", async () => {
    const repo = createMemoryRepo();
    await repo.createAccount({ name: "Número original", legacy: true });
    const roster = await loadRoster(repo);
    const r = detectStuckQueues(input(roster, { overdue: [msg(null, -40)] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "Número original", cause: "offline", canMove: false });
  });

  it("textos: tempo e frase de cada causa", () => {
    expect(lateText(47)).toBe("47 min");
    expect(lateText(120)).toBe("2 h");
    expect(lateText(192)).toBe("3 h 12 min");
    expect(lateText(60 * 26 + 5)).toBe("1 d 2 h");
    const base = { accountId: "x", name: "JK 01", reason: null, sending: 0, canMove: true };
    expect(describeStuck({ ...base, cause: "offline", overdue: 8, lateMin: 192 })).toBe(
      "JK 01 não está enviando: 8 mensagens atrasadas (a mais antiga há 3 h 12 min). O robô está rodando, então o número provavelmente caiu ou foi restringido.",
    );
    expect(describeStuck({ ...base, cause: "worker", overdue: 1, lateMin: 30 })).toBe(
      "O robô de envio não deu volta nenhuma há alguns minutos, e JK 01 tem 1 mensagem atrasada (a mais antiga há 30 min).",
    );
  });
});

describe("fila parada: com o banco e o worker de verdade", () => {
  it("o número desconectado vira aviso; depois de passar a fila, o aviso some", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
    await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
    await repo.saveSettings({ agentFlow: "qualificar" });
    const caps = { week1: null, week2: null, steady: 6 };
    const src = await repo.createAccount({ name: "JK 01", gowaDeviceId: "dev1", paused: false, caps });
    const dest = await repo.createAccount({ name: "JK 02", gowaDeviceId: "dev2", paused: false, caps });
    const prepared = await prepareLeadsForAccount(repo, NOW, { leadIds: rows.slice(0, 3).map((r) => r.id), accountId: src.id, rng: seeded(7) });
    expect(prepared.prepared).toBe(3);
    const drafts = await repo.listMessages({ accountId: src.id, kinds: ["opening"], statuses: ["draft"], limit: 10 });
    await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);

    await repo.saveAutomation({ paused: false, dryRun: false });
    const p1 = new Recorder();
    const p2 = new Recorder();
    p1.connected = false; // o JK 01 caiu
    const providerFor = (account: Account) => (account.id === src.id ? p1 : p2);
    const settings = await repo.getSettings();

    // dentro da folga ainda não avisa
    const early = min(STUCK_GRACE_MIN - 5);
    await tickAll({ repo, provider: p2, providerFor, now: early, rng, sleep });
    expect(await loadStuckQueues(repo, await loadRoster(repo), settings.automation, early)).toEqual([]);

    // uma hora depois o robô segue dando volta e nada sai pelo JK 01: aviso
    const later = min(60);
    const turn = await tickAll({ repo, provider: p2, providerFor, now: later, rng, sleep });
    expect(turn.action).toBe("multi");
    expect(p1.sent).toHaveLength(0);
    const stuck = await loadStuckQueues(repo, await loadRoster(repo), settings.automation, later);
    expect(stuck).toHaveLength(1);
    expect(stuck[0]).toMatchObject({ accountId: src.id, name: "JK 01", cause: "offline", overdue: 3, canMove: true });
    expect(stuck[0].lateMin).toBeGreaterThanOrEqual(45);

    // passando a fila para o JK 02, as horas ficam no futuro dele e o aviso some
    const moved = await moveQueue(repo, src.id, dest.id, later, rng);
    expect(moved.moved).toBe(3);
    expect(await loadStuckQueues(repo, await loadRoster(repo), settings.automation, later)).toEqual([]);
  });

  it("o número original, sem o robô dando volta, avisa que o robô parou", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const lead = (await repo.listLeads({ eligible: true, sort: "score", limit: 5, offset: 0 })).rows[0];
    await repo.createAccount({ name: "Número 1", legacy: true });
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", step: 0, body: "Bom dia! Aqui é o Jonathan. Posso fazer uma pergunta rápida?", status: "approved", createdBy: "system", scheduledFor: min(-60).toISOString() },
    ]);
    await repo.saveAutomation({ paused: false, dryRun: false });
    const settings = await repo.getSettings();
    const r = await loadStuckQueues(repo, await loadRoster(repo), settings.automation, NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: "Número 1", cause: "worker", overdue: 1, lateMin: 60, canMove: false });

    // a automação pausada pelo dono é decisão dele, não queda: nada de aviso
    await repo.saveAutomation({ paused: true });
    expect(await loadStuckQueues(repo, await loadRoster(repo), (await repo.getSettings()).automation, NOW)).toEqual([]);
  });
});
