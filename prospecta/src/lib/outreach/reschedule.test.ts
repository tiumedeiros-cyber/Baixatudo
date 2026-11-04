import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import type { AutomationConfig } from "./config";
import { syncQueueWithRules } from "./engine";
import { inWindow, localParts } from "./guardrails";
import { checkQueue, rescheduleQueue, scheduleSignature } from "./reschedule";
import type { Message } from "./types";

/**
 * A conversa de 26/10: o dono mudou o horário de envio (de "00:00 às 12:00" para "08:00 às 12:00 e 12:40 às 20:00") e a fila de 58
 * aberturas aprovadas ficou com horários da madrugada. Ao salvar as regras, a fila inteira é planejada de novo.
 */

const NOW = new Date("2026-10-26T13:00:00Z"); // segunda, 10:00 em Fortaleza
const rng = () => 0.5;
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 9, day, hour + 3, minute)); // hora de Fortaleza (UTC-3) -> UTC

const OLD_RULES: Partial<AutomationConfig> = {
  windows: [{ from: "00:00", to: "12:00" }, { from: "13:00", to: "20:00" }],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  caps: { week1: 100, week2: 200, steady: 300 },
  gapMinSec: 120,
  gapMaxSec: 540,
};
const NEW_RULES: Partial<AutomationConfig> = { ...OLD_RULES, windows: [{ from: "08:00", to: "12:00" }, { from: "12:40", to: "20:00" }] };

async function setup(rules: Partial<AutomationConfig> = NEW_RULES) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveAutomation({ ...rules, paused: false, dryRun: false });
  return { repo, leads };
}

/** Cria aberturas aprovadas, uma por lead, nos horários dados (na ordem). */
async function queue(repo: MemoryRepo, leads: { id: string; phoneE164: string | null }[], times: Date[], extra: Partial<Pick<Message, "kind" | "status">> = {}) {
  const made: Message[] = [];
  for (const [i, when] of times.entries()) {
    const lead = leads[i];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const [m] = await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "out",
        kind: extra.kind ?? "opening",
        body: `Oi! mensagem ${i}`,
        status: extra.status ?? "approved",
        createdBy: "system",
        approvedAt: NOW.toISOString(),
        scheduledFor: when.toISOString(),
      },
    ]);
    made.push(m);
  }
  return made;
}

const cfgOf = async (repo: MemoryRepo) => (await repo.getSettings()).automation;
const approvedOpenings = async (repo: MemoryRepo) => repo.listMessages({ kinds: ["opening", "followup"], statuses: ["approved"], direction: "out", limit: 1000 });
const madrugada = (n: number) => Array.from({ length: n }, (_, i) => at(27, 0, 1 + i * 6)); // ter 27/10, 00:01, 00:07...

describe("a fila aprovada com horários que as regras de agora não permitem", () => {
  it("checkQueue vê a madrugada: 10 mensagens fora da janela nova", async () => {
    const { repo, leads } = await setup();
    await queue(repo, leads, madrugada(10));
    expect(await checkQueue(repo, await cfgOf(repo), NOW)).toEqual({ total: 10, outsideWindow: 10, overCap: 0 });
  });

  it("uma fila dentro das regras não tem nada fora da janela", async () => {
    const { repo, leads } = await setup();
    await queue(repo, leads, [at(26, 15, 0), at(26, 15, 8), at(27, 9, 30)]);
    expect(await checkQueue(repo, await cfgOf(repo), NOW)).toEqual({ total: 3, outsideWindow: 0, overCap: 0 });
  });

  it("ao salvar o horário novo, a fila inteira é planejada de novo: tudo dentro da janela, em ordem, com intervalo", async () => {
    const { repo, leads } = await setup();
    const made = await queue(repo, leads, madrugada(12));
    const before = { ...(await cfgOf(repo)), ...OLD_RULES } as AutomationConfig;

    const r = await syncQueueWithRules(repo, before, await cfgOf(repo), NOW, rng);
    expect(r).toMatchObject({ reorganized: true, queue: 12, changed: true, outOfRules: true, rescheduled: 12 });

    const after = (await approvedOpenings(repo)).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
    expect(after).toHaveLength(12);
    const cfg = await cfgOf(repo);
    for (const m of after) {
      expect(inWindow(new Date(m.scheduledFor!), cfg), m.scheduledFor!).toBe(true);
      expect(new Date(m.scheduledFor!).getTime()).toBeGreaterThan(NOW.getTime());
      expect(m.error).toBeNull();
    }
    // a ordem de aprovação continua (a mais antiga sai primeiro)
    expect(after.map((m) => m.id)).toEqual(made.map((m) => m.id));
    // e o intervalo mínimo entre uma e outra vale
    for (let i = 1; i < after.length; i++) {
      expect(Date.parse(after[i].scheduledFor!) - Date.parse(after[i - 1].scheduledFor!)).toBeGreaterThanOrEqual(cfg.gapMinSec * 1000);
    }
    expect(r.firstAt).toBe(after[0].scheduledFor);
    expect(r.lastAt).toBe(after[after.length - 1].scheduledFor);
    const events = await repo.listEvents({ types: ["automacao"], limit: 10 });
    expect(events.some((e) => /fila reorganizada com as regras de envio novas: 12/.test(String(e.payload.text)))).toBe(true);
  });

  it("a fila velha também é consertada quando o horário já tinha sido mudado antes (salvar de novo, sem mudar nada)", async () => {
    const { repo, leads } = await setup();
    await queue(repo, leads, madrugada(5));
    const cfg = await cfgOf(repo);
    const r = await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    expect(r).toMatchObject({ reorganized: true, changed: false, outOfRules: true, rescheduled: 5 });
    expect((await checkQueue(repo, cfg, NOW)).outsideWindow).toBe(0);
  });

  it("fila que já respeita as regras e regras iguais: nada é mexido", async () => {
    const { repo, leads } = await setup();
    const made = await queue(repo, leads, [at(26, 15, 0), at(26, 15, 8)]);
    const cfg = await cfgOf(repo);
    const r = await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    expect(r).toMatchObject({ reorganized: false, queue: 2, changed: false, outOfRules: false });
    const after = await approvedOpenings(repo);
    expect(after.map((m) => m.scheduledFor).sort()).toEqual(made.map((m) => m.scheduledFor).sort());
  });

  it("regras mudaram mas não há nada aprovado: não há o que reorganizar", async () => {
    const { repo } = await setup();
    const cfg = await cfgOf(repo);
    const r = await syncQueueWithRules(repo, { ...cfg, ...OLD_RULES } as AutomationConfig, cfg, NOW, rng);
    expect(r).toMatchObject({ reorganized: false, queue: 0, changed: true });
  });

  it("mudar só o intervalo entre mensagens também reorganiza (os horários mudam)", async () => {
    const { repo, leads } = await setup();
    await queue(repo, leads, [at(26, 15, 0), at(26, 15, 2), at(26, 15, 4)]);
    const before = await cfgOf(repo);
    await repo.saveAutomation({ gapMinSec: 600, gapMaxSec: 900 });
    const cfg = await cfgOf(repo);
    const r = await syncQueueWithRules(repo, before, cfg, NOW, rng);
    expect(r).toMatchObject({ reorganized: true, changed: true, rescheduled: 3 });
    const after = (await approvedOpenings(repo)).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
    for (let i = 1; i < after.length; i++) expect(Date.parse(after[i].scheduledFor!) - Date.parse(after[i - 1].scheduledFor!)).toBeGreaterThanOrEqual(600_000);
  });

  it("respeita o teto do dia: 10 mensagens com teto de 4 por dia espalham em 3 dias", async () => {
    const { repo, leads } = await setup({ ...NEW_RULES, caps: { week1: 4, week2: 4, steady: 4 } });
    await queue(repo, leads, Array.from({ length: 10 }, (_, i) => at(26, 15, i * 3))); // todas no mesmo dia
    const cfg = await cfgOf(repo);
    expect((await checkQueue(repo, cfg, NOW)).overCap).toBe(6);

    const r = await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    expect(r).toMatchObject({ reorganized: true, rescheduled: 10 });
    const perDay = new Map<string, number>();
    for (const m of await approvedOpenings(repo)) {
      const day = localParts(new Date(m.scheduledFor!), cfg.timezone).ymd;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect([...perDay.values()].every((n) => n <= 4)).toBe(true);
    expect(perDay.size).toBe(3);
  });

  it("o que já saiu hoje conta no teto do dia", async () => {
    const { repo, leads } = await setup({ ...NEW_RULES, caps: { week1: 4, week2: 4, steady: 4 } });
    // 3 já saíram hoje
    await queue(repo, leads.slice(0, 3), [at(26, 9, 0), at(26, 9, 10), at(26, 9, 20)], { status: "sent" });
    for (const m of await repo.listMessages({ statuses: ["sent"], direction: "out", limit: 10 })) await repo.updateMessage(m.id, { sentAt: at(26, 9, 5).toISOString() });
    await queue(repo, leads.slice(3, 7), [at(26, 15, 0), at(26, 15, 5), at(26, 15, 10), at(26, 15, 15)]);
    const cfg = await cfgOf(repo);
    // 3 enviadas + 4 agendadas hoje = 7 contra o teto de 4
    expect((await checkQueue(repo, cfg, NOW)).overCap).toBe(3);
    await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    const today = localParts(NOW, cfg.timezone).ymd;
    const scheduledToday = (await approvedOpenings(repo)).filter((m) => localParts(new Date(m.scheduledFor!), cfg.timezone).ymd === today).length;
    expect(scheduledToday).toBeLessThanOrEqual(1); // sobra 1 vaga hoje (teto 4, 3 enviadas)
  });

  it("dia da semana tirado das regras: a fila sai do sábado e do domingo", async () => {
    const { repo, leads } = await setup({ ...NEW_RULES, weekdays: [1, 2, 3, 4, 5] });
    await queue(repo, leads, [at(31, 9, 0), at(31, 9, 10)]); // sábado, 31/10
    const cfg = await cfgOf(repo);
    expect((await checkQueue(repo, cfg, NOW)).outsideWindow).toBe(2);
    await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    for (const m of await approvedOpenings(repo)) {
      const wd = localParts(new Date(m.scheduledFor!), cfg.timezone).weekday;
      expect(wd).toBeLessThanOrEqual(5);
    }
  });

  it("só mexe em aberturas e follow-ups aprovados: enviando, enviadas, rascunhos e respostas ficam como estão", async () => {
    const { repo, leads } = await setup();
    const [opening] = await queue(repo, leads.slice(0, 1), madrugada(1));
    const [sending] = await queue(repo, leads.slice(1, 2), madrugada(1), { status: "sending" });
    const [draft] = await queue(repo, leads.slice(2, 3), madrugada(1), { status: "draft" });
    const [reply] = await queue(repo, leads.slice(3, 4), [new Date(NOW.getTime() + 30_000)], { kind: "reply" });
    const sentOne = (await queue(repo, leads.slice(4, 5), [at(26, 9, 0)], { status: "sent" }))[0];

    const cfg = await cfgOf(repo);
    const r = await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    expect(r.rescheduled).toBe(1);
    const get = (id: string) => repo.getMessage(id);
    expect((await get(opening.id))!.scheduledFor).not.toBe(opening.scheduledFor);
    for (const untouched of [sending, draft, reply, sentOne]) {
      const now = (await get(untouched.id))!;
      expect(now.status).toBe(untouched.status);
      expect(now.scheduledFor).toBe(untouched.scheduledFor);
    }
  });

  it("se algo falhar no meio, as mensagens voltam ao horário que tinham (nada vira rascunho nem se perde)", async () => {
    const { repo, leads } = await setup();
    const made = await queue(repo, leads, madrugada(4));
    await expect(rescheduleQueue(repo, async () => { throw new Error("banco fora do ar"); })).rejects.toThrow("banco fora do ar");
    const after = await approvedOpenings(repo);
    expect(after).toHaveLength(4);
    expect(after.map((m) => m.scheduledFor).sort()).toEqual(made.map((m) => m.scheduledFor).sort());
    expect(after.every((m) => m.approvedAt === NOW.toISOString())).toBe(true);
  });

  it("follow-ups saem antes das aberturas, como na aprovação de sempre", async () => {
    const { repo, leads } = await setup();
    const [opening] = await queue(repo, leads.slice(0, 1), madrugada(1)); // aprovada primeiro, mas é abertura
    const conv = await repo.ensureConversation(leads[1].id, leads[1].phoneE164!);
    const [followUp] = await repo.createMessages([
      { conversationId: conv.id, leadId: leads[1].id, direction: "out", kind: "followup", step: 1, body: "Oi de novo", status: "approved", createdBy: "system", approvedAt: NOW.toISOString(), scheduledFor: madrugada(2)[1].toISOString() },
    ]);
    const cfg = await cfgOf(repo);
    await syncQueueWithRules(repo, cfg, cfg, NOW, rng);
    const byTime = (await approvedOpenings(repo)).sort((x, y) => x.scheduledFor!.localeCompare(y.scheduledFor!));
    expect(byTime.map((m) => m.id)).toEqual([followUp.id, opening.id]);
  });
});

describe("scheduleSignature: o que conta como mudar o horário", () => {
  const base = { windows: [{ from: "08:00", to: "12:00" }], weekdays: [1, 2, 3], caps: { week1: null, week2: null, steady: 30 }, gapMinSec: 120, gapMaxSec: 540, timezone: "America/Fortaleza" };

  it("a ordem dos dias não conta", () => {
    expect(scheduleSignature({ ...base, weekdays: [3, 1, 2] })).toBe(scheduleSignature(base));
  });

  it.each([
    ["janela", { windows: [{ from: "09:00", to: "12:00" }] }],
    ["dias", { weekdays: [1, 2, 3, 4] }],
    ["teto", { caps: { week1: null, week2: null, steady: 40 } }],
    ["intervalo mínimo", { gapMinSec: 180 }],
    ["intervalo máximo", { gapMaxSec: 600 }],
  ])("mudar %s muda a assinatura", (_nome, patch) => {
    expect(scheduleSignature({ ...base, ...patch })).not.toBe(scheduleSignature(base));
  });
});
