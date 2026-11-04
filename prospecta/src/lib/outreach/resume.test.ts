import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { getOverview, prepareBatch, resumeNow, tick } from "./engine";
import { localParts } from "./guardrails";
import { STALE_REPLY_MS, getResumePlan } from "./resume";
import { SimulatedProvider, type ProviderStatus, type WhatsAppProvider } from "./provider";

const NOW = new Date("2026-10-23T12:30:00Z"); // sexta, 09:30 em Fortaleza (dentro da janela)
const HOUR = 3_600_000;
const rng = () => 0.5;
const sleep = async () => {};

class Rec implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  sent: { phone: string; text: string }[] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: true, loggedIn: true, mode: this.mode, detail: "WhatsApp conectado" };
  }
  async typing() {}
  async sendText(phone: string, text: string) {
    this.sent.push({ phone, text });
    return { id: `ID${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

afterEach(() => vi.useRealTimers());

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveAutomation({ paused: true, dryRun: false, pausedReason: "Pausada manualmente pelo dono." });
  return { repo, leads };
}

type Kind = "opening" | "followup" | "reply";

/** Cria uma mensagem de saída. `createdAt` é o instante "do relógio" em que ela nasceu (usa o relógio falso). */
async function make(
  repo: MemoryRepo,
  lead: Lead,
  kind: Kind,
  status: "draft" | "approved",
  opts: { scheduledFor?: Date | null; createdAt?: Date; batchDay?: string; body?: string } = {},
) {
  if (opts.createdAt) vi.useFakeTimers({ now: opts.createdAt });
  const conv = (await repo.findConversationByLead(lead.id)) ?? (await repo.ensureConversation(lead.id, lead.phoneE164!));
  const [m] = await repo.createMessages([
    {
      conversationId: conv.id,
      leadId: lead.id,
      direction: "out",
      kind,
      step: kind === "followup" ? 1 : 0,
      body: opts.body ?? `texto ${kind} ${lead.name}`,
      status,
      createdBy: "system",
      scheduledFor: opts.scheduledFor === undefined ? null : (opts.scheduledFor?.toISOString() ?? null),
      approvedAt: status === "approved" ? NOW.toISOString() : null,
      batchDay: opts.batchDay ?? null,
    },
  ]);
  if (opts.createdAt) vi.useRealTimers();
  return { m, conv };
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("o que fica parado enquanto a automação está pausada", () => {
  it("conta o que vai acontecer ao retomar: aprovadas vencidas, respostas recentes e velhas, rascunhos de ontem", async () => {
    const { repo, leads } = await setup();
    await make(repo, leads[0], "opening", "approved", { scheduledFor: ago(20 * HOUR) });
    await make(repo, leads[1], "opening", "approved", { scheduledFor: ago(20 * HOUR) });
    await make(repo, leads[2], "followup", "approved", { scheduledFor: ago(2 * HOUR) });
    await make(repo, leads[3], "opening", "approved", { scheduledFor: new Date(NOW.getTime() + HOUR) }); // ainda não venceu
    await make(repo, leads[4], "reply", "approved", { scheduledFor: ago(HOUR) }); // recente
    await make(repo, leads[5], "reply", "approved", { scheduledFor: ago(STALE_REPLY_MS + HOUR) }); // velha
    await make(repo, leads[6], "opening", "draft", { createdAt: ago(20 * HOUR), batchDay: "2026-10-22" });
    await make(repo, leads[7], "opening", "draft"); // de hoje

    expect(await getResumePlan(repo, NOW)).toEqual({ overdueProspecting: 3, freshReplies: 1, staleReplies: 1, oldDrafts: 1 });
  });

  it("nada parado: tudo zerado", async () => {
    const { repo } = await setup();
    expect(await getResumePlan(repo, NOW)).toEqual({ overdueProspecting: 0, freshReplies: 0, staleReplies: 0, oldDrafts: 0 });
  });
});

describe("resumeNow", () => {
  it("o que já estava aprovado ganha horário novo, a partir de agora e na ordem de sempre (follow-up primeiro)", async () => {
    const { repo, leads } = await setup();
    const a = await make(repo, leads[0], "opening", "approved", { scheduledFor: ago(20 * HOUR) });
    const b = await make(repo, leads[1], "opening", "approved", { scheduledFor: ago(19 * HOUR) });
    const f = await make(repo, leads[2], "followup", "approved", { scheduledFor: ago(18 * HOUR) });

    const r = await resumeNow(repo, NOW, rng);
    expect(r).toMatchObject({ overdueProspecting: 3, rescheduled: 3 });
    expect((await repo.getSettings()).automation).toMatchObject({ paused: false, pausedReason: null });

    const after = await Promise.all([f, a, b].map(async (x) => (await repo.getMessage(x.m.id))!));
    for (const m of after) {
      expect(m.status).toBe("approved");
      expect(Date.parse(m.scheduledFor!)).toBeGreaterThanOrEqual(NOW.getTime());
      expect(m.error).toBeNull();
    }
    // follow-up antes das aberturas, e cada uma depois da outra
    const times = after.map((m) => Date.parse(m.scheduledFor!));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(r.firstAt).toBe(after[0].scheduledFor);
    expect((await repo.listEvents({ types: ["automacao"], limit: 5 }))[0].payload.text).toMatch(/retomada pelo dono: 3 mensagens aprovadas ganharam horário novo/);
  });

  it("não solta mais que o teto do dia: o excedente vai para o próximo dia de envio", async () => {
    const { repo, leads } = await setup();
    const cfg = (await repo.getSettings()).automation;
    const n = 14;
    const ms = [];
    for (let i = 0; i < n; i++) ms.push(await make(repo, leads[i], "opening", "approved", { scheduledFor: ago(30 * HOUR) }));
    await resumeNow(repo, NOW, rng);
    const days = new Map<string, number>();
    for (const x of ms) {
      const m = (await repo.getMessage(x.m.id))!;
      const d = localParts(new Date(m.scheduledFor!), cfg.timezone).ymd;
      days.set(d, (days.get(d) ?? 0) + 1);
    }
    expect(days.size).toBeGreaterThan(1);
    for (const count of days.values()) expect(count).toBeLessThanOrEqual(Math.max(cfg.caps.week1 ?? 0, cfg.caps.week2 ?? 0, cfg.caps.steady));
  });

  it("resposta do agente de poucas horas atrás sai em instantes; a de muitas horas volta como rascunho e a conversa pede você", async () => {
    const { repo, leads } = await setup();
    const fresh = await make(repo, leads[0], "reply", "approved", { scheduledFor: ago(HOUR) });
    const stale = await make(repo, leads[1], "reply", "approved", { scheduledFor: ago(STALE_REPLY_MS + 2 * HOUR) });
    await repo.updateConversation(stale.conv.id, { status: "active" });

    const r = await resumeNow(repo, NOW, rng);
    expect(r).toMatchObject({ freshReplies: 1, staleReplies: 1, rescheduled: 1 });

    const f = (await repo.getMessage(fresh.m.id))!;
    expect(f.status).toBe("approved");
    const wait = Date.parse(f.scheduledFor!) - NOW.getTime();
    expect(wait).toBeGreaterThanOrEqual(15_000);
    expect(wait).toBeLessThanOrEqual(75_000);

    const s = (await repo.getMessage(stale.m.id))!;
    expect(s).toMatchObject({ status: "draft", scheduledFor: null, approvedAt: null });
    expect(s.error).toMatch(/Resposta de há 5 h/);
    expect((await repo.getConversation(stale.conv.id))!.status).toBe("awaiting_human");
  });

  it("rascunhos de dias anteriores ficam como estão (só são contados)", async () => {
    const { repo, leads } = await setup();
    const { m } = await make(repo, leads[0], "opening", "draft", { createdAt: ago(20 * HOUR), batchDay: "2026-10-22", body: "texto de ontem" });
    const r = await resumeNow(repo, NOW, rng);
    expect(r).toMatchObject({ oldDrafts: 1, rescheduled: 0 });
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "draft", body: "texto de ontem" });
  });

  it("sem nada parado só tira a pausa", async () => {
    const { repo } = await setup();
    const r = await resumeNow(repo, NOW, rng);
    expect(r).toMatchObject({ rescheduled: 0, firstAt: null, lastAt: null, overdueProspecting: 0 });
    expect((await repo.getSettings()).automation.paused).toBe(false);
  });

  it("depois de retomar, o worker manda UMA por volta, no horário novo, e nada fora dele", async () => {
    const { repo, leads } = await setup();
    const msgs = [];
    for (let i = 0; i < 3; i++) msgs.push(await make(repo, leads[i], "opening", "approved", { scheduledFor: ago(30 * HOUR) }));
    const r = await resumeNow(repo, NOW, rng);

    const provider = new Rec();
    expect(await tick({ repo, provider, now: NOW, rng, sleep })).toMatchObject({ action: expect.stringMatching(/idle|sent/) });
    const first = Date.parse(r.firstAt!);
    // antes do primeiro horário nada sai
    if (first > NOW.getTime()) expect(provider.sent).toHaveLength(0);
    const later = new Date(first + 1000);
    expect(await tick({ repo, provider, now: later, rng, sleep })).toMatchObject({ action: "sent" });
    expect(provider.sent).toHaveLength(1);
    // as outras esperam o intervalo
    const next = await tick({ repo, provider, now: new Date(later.getTime() + 20_000), rng, sleep });
    expect(next.action).not.toBe("sent");
    expect(provider.sent).toHaveLength(1);
  });
});

describe("prepareBatch conta o que sobrou de dias anteriores", () => {
  it("rascunhos e aprovadas de ontem disputam o teto de hoje, para um dia parado não dobrar a fila", async () => {
    const { repo, leads } = await setup();
    const cap = 8;
    for (let i = 0; i < 3; i++) await make(repo, leads[i], "opening", "draft", { batchDay: "2026-10-22" });
    for (let i = 3; i < 5; i++) await make(repo, leads[i], "opening", "approved", { scheduledFor: ago(20 * HOUR), batchDay: "2026-10-22" });
    const r = await prepareBatch(repo, NOW);
    expect(r.carriedOver).toBe(5);
    expect(r.openings).toBe(cap - 5);
  });

  it("com o teto cheio de sobras, não prepara nada novo e diz quantas sobraram", async () => {
    const { repo, leads } = await setup();
    for (let i = 0; i < 8; i++) await make(repo, leads[i], "opening", "draft", { batchDay: "2026-10-22" });
    const r = await prepareBatch(repo, NOW);
    expect(r).toMatchObject({ carriedOver: 8, openings: 0, followUps: 0 });
  });

  it("follow-up vencido continua entrando mesmo com o teto cheio de sobras (ele tem prioridade)", async () => {
    const { repo, leads } = await setup();
    const conv = await repo.ensureConversation(leads[0].id, leads[0].phoneE164!);
    await repo.setStage(leads[0].id, "contatado");
    await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: ago(3 * 24 * HOUR).toISOString() });
    for (let i = 1; i <= 8; i++) await make(repo, leads[i], "opening", "draft", { batchDay: "2026-10-22" });
    const r = await prepareBatch(repo, NOW);
    expect(r).toMatchObject({ carriedOver: 8, followUps: 1, openings: 0 });
  });

  it("o que já saiu ontem não conta, nem o que é de hoje", async () => {
    const { repo, leads } = await setup();
    await make(repo, leads[0], "opening", "draft", { batchDay: "2026-10-23" }); // hoje: entra como já preparado
    const r = await prepareBatch(repo, NOW);
    expect(r.carriedOver).toBe(0);
    expect(r.alreadyPrepared).toBe(1);
  });
});

describe("getOverview mostra o plano de retomada só com a automação pausada", () => {
  it("pausada: traz os números; rodando: nulo", async () => {
    const { repo, leads } = await setup();
    await make(repo, leads[0], "opening", "approved", { scheduledFor: ago(20 * HOUR) });
    const paused = await getOverview(repo, new SimulatedProvider(), NOW);
    expect(paused.resume).toEqual({ overdueProspecting: 1, freshReplies: 0, staleReplies: 0, oldDrafts: 0 });
    await repo.saveAutomation({ paused: false });
    expect((await getOverview(repo, new SimulatedProvider(), NOW)).resume).toBeNull();
  });
});
