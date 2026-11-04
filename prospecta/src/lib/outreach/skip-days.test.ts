import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { DEFAULT_AUTOMATION, mergeAutomation } from "./config";
import { approveMessages, prepareBatch, tick } from "./engine";
import { inWindow, isAllowedDay, localParts, nextOpening } from "./guardrails";
import { SimulatedProvider } from "./provider";
import { planSchedule } from "./schedule";
import { applySkipDay, dayLabel, dayLabelLong, queueDays } from "./skip-days";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const THU = "2026-10-22";
const FRI = "2026-10-23";
const rng = () => 0.5;
const sleep = async () => {};
const TZ = "America/Fortaleza";
const dayOf = (iso: string) => localParts(new Date(iso), TZ).ymd;

async function setup(count = 8) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  await repo.saveSettings({ agentFlow: "previa" });
  await prepareBatch(repo, NOW, { limit: count });
  const drafts = await repo.listMessages({ statuses: ["draft"], kinds: ["opening"], limit: 50 });
  await approveMessages(repo, drafts.map((m) => m.id), NOW, rng);
  return repo;
}

const approvedDays = async (repo: Awaited<ReturnType<typeof setup>>) =>
  (await repo.listMessages({ statuses: ["approved"], kinds: ["opening", "followup"], limit: 100 })).map((m) => dayOf(m.scheduledFor!));

describe("dia sem envio: as regras de horário", () => {
  const cfg = { ...DEFAULT_AUTOMATION, skipDates: [THU] };

  it("um dia marcado não é dia de envio, mesmo sendo quinta, e a janela fecha nele", () => {
    expect(isAllowedDay(THU, DEFAULT_AUTOMATION)).toBe(true);
    expect(isAllowedDay(THU, cfg)).toBe(false);
    expect(isAllowedDay(FRI, cfg)).toBe(true);
    expect(inWindow(NOW, DEFAULT_AUTOMATION)).toBe(true);
    expect(inWindow(NOW, cfg)).toBe(false);
  });

  it("a próxima abertura pula o dia marcado e cai na primeira janela do seguinte", () => {
    const at = nextOpening(NOW, cfg);
    expect(localParts(at, TZ)).toMatchObject({ ymd: FRI, hour: 9, minute: 0 });
  });

  it("o planejador não marca nada no dia segurado", () => {
    const times = planSchedule({ count: 5, now: NOW, cfg, rng, usedToday: 0 });
    expect(times).toHaveLength(5);
    expect(new Set(times.map((t) => dayOf(t.toISOString())))).toEqual(new Set([FRI]));
  });

  it("sem dias marcados nada muda (o horário de sempre)", () => {
    const times = planSchedule({ count: 3, now: NOW, cfg: DEFAULT_AUTOMATION, rng, usedToday: 0 });
    expect(new Set(times.map((t) => dayOf(t.toISOString())))).toEqual(new Set([THU]));
  });

  it("a configuração guardada ignora lixo e ordena as datas", () => {
    expect(mergeAutomation({ skipDates: ["2026-10-25", "lixo", "2026-10-24", "2026-10-25", 3 as never] }).skipDates).toEqual(["2026-10-24", "2026-10-25"]);
    expect(mergeAutomation({}).skipDates).toEqual([]);
  });
});

describe("pular um dia reorganiza a fila", () => {
  it("a fila de hoje vai toda para o próximo dia útil, na mesma quantidade, sem enviar nada", async () => {
    const repo = await setup();
    expect(new Set(await approvedDays(repo))).toEqual(new Set([THU]));

    const r = await applySkipDay(repo, THU, true, NOW, rng);
    expect(r).toMatchObject({ ok: true, changed: true, skipDates: [THU], weekdayAlreadyOff: false });
    expect(r.ok && r.sync).toMatchObject({ reorganized: true, queue: 8, rescheduled: 8 });
    expect(await approvedDays(repo)).toHaveLength(8);
    expect(new Set(await approvedDays(repo))).toEqual(new Set([FRI]));
    expect((await repo.messageCounts()).prospectingSent).toBe(0); // nada saiu
    expect((await repo.getSettings()).automation.skipDates).toEqual([THU]);
    // a pausa geral não foi tocada: pular não é pausar
    expect((await repo.getSettings()).automation.paused).toBe(DEFAULT_AUTOMATION.paused);
  });

  it("voltar a enviar traz a fila de volta para hoje", async () => {
    const repo = await setup();
    await applySkipDay(repo, THU, true, NOW, rng);
    const r = await applySkipDay(repo, THU, false, NOW, rng);
    expect(r).toMatchObject({ ok: true, changed: true, skipDates: [] });
    expect(new Set(await approvedDays(repo))).toEqual(new Set([THU]));
  });

  it("marcar duas vezes não muda nada; dia passado e data inválida são recusados", async () => {
    const repo = await setup();
    await applySkipDay(repo, FRI, true, NOW, rng);
    expect(await applySkipDay(repo, FRI, true, NOW, rng)).toMatchObject({ ok: true, changed: false });
    expect(await applySkipDay(repo, FRI, false, NOW, rng)).toMatchObject({ ok: true, changed: true });
    expect(await applySkipDay(repo, FRI, false, NOW, rng)).toMatchObject({ ok: true, changed: false });
    expect(await applySkipDay(repo, "2026-10-21", true, NOW, rng)).toEqual({ ok: false, reason: "Esse dia já passou." });
    expect(await applySkipDay(repo, "2026-02-30", true, NOW, rng)).toEqual({ ok: false, reason: "Data inválida." });
    expect(await applySkipDay(repo, "amanhã", true, NOW, rng)).toEqual({ ok: false, reason: "Data inválida." });
  });

  it("marcar um dia que já não era de envio avisa e não mexe na fila", async () => {
    const repo = await setup();
    const before = await approvedDays(repo);
    const r = await applySkipDay(repo, "2026-10-24", true, NOW, rng); // sábado: fora dos dias de envio
    expect(r).toMatchObject({ ok: true, changed: true, weekdayAlreadyOff: true });
    expect(r.ok && r.sync?.reorganized).toBe(false);
    expect(await approvedDays(repo)).toEqual(before);
  });

  it("os dias que já passaram saem da lista sozinhos", async () => {
    const repo = await setup();
    await repo.saveAutomation({ skipDates: ["2026-10-01", "2026-10-20"] });
    const r = await applySkipDay(repo, "2026-10-26", true, NOW, rng);
    expect(r.ok && r.skipDates).toEqual(["2026-10-26"]);
  });

  it("segurar vários dias seguidos leva a fila ao próximo dia livre", async () => {
    const repo = await setup();
    await applySkipDay(repo, THU, true, NOW, rng);
    await applySkipDay(repo, FRI, true, NOW, rng);
    // sábado e domingo não são dias de envio: segunda, 26/10
    expect(new Set(await approvedDays(repo))).toEqual(new Set(["2026-10-26"]));
  });

  it("o teto de cada dia continua valendo ao reorganizar", async () => {
    const repo = await setup(8);
    await repo.saveAutomation({ caps: { week1: 3, week2: 3, steady: 3 } });
    await applySkipDay(repo, THU, true, NOW, rng);
    const days = await approvedDays(repo);
    const perDay = new Map<string, number>();
    for (const d of days) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n <= 3)).toBe(true);
    expect(days).toHaveLength(8);
    expect(perDay.has(THU)).toBe(false);
  });
});

describe("o worker num dia sem envio", () => {
  it("mesmo sem reorganizar, a abordagem aprovada não sai: o worker a adia para o próximo dia útil", async () => {
    const repo = await setup(2);
    await repo.saveAutomation({ paused: false });
    await repo.saveAutomation({ skipDates: [THU] }); // marcou sem reorganizar a fila
    const msg = (await repo.listMessages({ statuses: ["approved"], kinds: ["opening"], order: "asc", limit: 5 }))[0];
    const at = new Date(NOW.getTime() + 30 * 60_000);
    await repo.updateMessage(msg.id, { scheduledFor: new Date(NOW.getTime() - 60_000).toISOString() });
    const r = await tick({ repo, provider: new SimulatedProvider(), now: at, rng, sleep });
    expect(r).toMatchObject({ action: "deferred", reason: "fora do horário permitido" });
    if (r.action === "deferred") expect(dayOf(r.until)).toBe(FRI);
  });

  it("a resposta do agente a quem escreveu continua saindo no dia segurado (pausar pararia tudo)", async () => {
    const repo = await setup(1);
    await repo.saveAutomation({ paused: false, skipDates: [THU] });
    const lead = (await repo.listLeads({ limit: 1, offset: 0 })).rows[0];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const [reply] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "reply", body: "Claro, posso te explicar.", status: "approved", createdBy: "system", scheduledFor: new Date(NOW.getTime() - 60_000).toISOString() },
    ]);
    const r = await tick({ repo, provider: new SimulatedProvider(), now: new Date(NOW.getTime() + 60_000), rng, sleep });
    expect(r).toMatchObject({ action: "simulated", messageId: reply.id });
  });
});

describe("quais dias a fila ocupa e como o dia é escrito", () => {
  it("conta a fila por dia, e o atrasado conta como hoje", async () => {
    const repo = await setup(5);
    const [first] = await repo.listMessages({ statuses: ["approved"], kinds: ["opening"], order: "asc", limit: 1 });
    await repo.updateMessage(first.id, { scheduledFor: "2026-10-20T13:00:00.000Z" }); // dia que já passou
    const q = await queueDays(repo, NOW);
    expect(q.today).toBe(THU);
    expect(q.days).toEqual([{ ymd: THU, count: 5 }]);
    await applySkipDay(repo, THU, true, NOW, rng);
    const after = await queueDays(repo, NOW);
    expect(after.skipDates).toEqual([THU]);
    expect(after.days).toEqual([{ ymd: FRI, count: 5 }]);
  });

  it("rótulos: hoje, amanhã e dia da semana com data", () => {
    expect(dayLabel(THU, THU)).toBe("hoje");
    expect(dayLabel(FRI, THU)).toBe("amanhã");
    expect(dayLabel("2026-10-28", THU)).toBe("qua, 28/10");
    expect(dayLabelLong(FRI, THU)).toBe("amanhã (sex, 23/10)");
    expect(dayLabelLong("2026-10-28", THU)).toBe("qua, 28/10");
  });
});
