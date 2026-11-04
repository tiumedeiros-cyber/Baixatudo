import { describe, expect, it } from "vitest";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { DEFAULT_FILTERS, parseFilters } from "./filters";
import { ingestPlaces } from "./ingest";
import type { RawPlace } from "./to-place";
import { TRIAGE_BEST, TRIAGE_LOW, bestOf, loadTriageBatches, toTriageCard, weakOf, whenLabel, type TriageCard } from "./triage";

const TZ = "America/Fortaleza";
const NOW = new Date("2026-10-24T13:30:00Z"); // sábado, 10:30 em Fortaleza
const places = fixture as unknown as RawPlace[];

describe("whenLabel", () => {
  it("hoje, ontem e dias antes, no fuso do dono", () => {
    expect(whenLabel("2026-10-24T13:12:00Z", NOW, TZ)).toEqual({ label: "Hoje · 10:12", daysAgo: 0 });
    expect(whenLabel("2026-10-23T19:40:00Z", NOW, TZ)).toEqual({ label: "Ontem · 16:40", daysAgo: 1 });
    expect(whenLabel("2026-10-22T12:05:00Z", NOW, TZ)).toEqual({ label: "22/10 · 09:05", daysAgo: 2 });
  });

  it("a virada do dia é a de Fortaleza, não a do UTC", () => {
    // 02:30 UTC de sábado ainda é 23:30 de sexta em Fortaleza
    expect(whenLabel("2026-10-24T02:30:00Z", NOW, TZ)).toEqual({ label: "Ontem · 23:30", daysAgo: 1 });
  });
});

async function world() {
  const repo = createMemoryRepo();
  const mk = async (niche: string, city: string, createdAt: Date, slice: RawPlace[]) => {
    const search = await repo.createSearch({ niche, city, state: "CE", requested: 20, source: "apify", status: "done" });
    await ingestPlaces(repo, slice, { niche, city, searchId: search.id, source: "apify" });
    await repo.updateSearch(search.id, { status: "done", finishedAt: createdAt.toISOString() });
    return search;
  };
  const yesterday = await mk("Estética", "Fortaleza", new Date("2026-10-23T19:40:00Z"), places.slice(0, 10));
  const today = await mk("Barbearia", "Fortaleza", new Date("2026-10-24T13:12:00Z"), places.slice(10, 20));
  return { repo, yesterday, today };
}

const count = (repo: MemoryRepo, searchId: string) => repo.listLeads({ searchId, limit: 500, offset: 0 }).then((p) => p.total);

describe("loadTriageBatches", () => {
  it("uma coluna por busca, a de hoje primeiro, com o que entrou em cada uma", async () => {
    const { repo, yesterday, today } = await world();
    const batches = await loadTriageBatches(repo, { ...DEFAULT_FILTERS, site: "todos", elegivel: "todos" }, NOW, TZ);
    // a busca mais recente primeiro
    expect(batches.map((b) => b.id)).toEqual([today.id, yesterday.id]);
    expect(batches[0]).toMatchObject({ id: today.id, title: "Barbearia · Fortaleza", kicker: "Hoje · 10:12", daysAgo: 0, searchId: today.id });
    expect(batches[1]).toMatchObject({ id: yesterday.id, title: "Estética · Fortaleza", kicker: "Ontem · 16:40", daysAgo: 1 });
    expect(batches[0].total).toBe(await count(repo, today.id));
    expect(batches[1].total).toBe(await count(repo, yesterday.id));
    // nada de lead de uma busca na coluna da outra
    const todayIds = new Set((await repo.listLeads({ searchId: today.id, limit: 500, offset: 0 })).rows.map((l) => l.id));
    expect(batches[0].cards.every((c) => todayIds.has(c.id))).toBe(true);
    expect(batches[1].cards.some((c) => todayIds.has(c.id))).toBe(false);
  });

  it("respeita os filtros: só elegíveis e etapa Novo; quem já foi aprovado sai do quadro", async () => {
    const { repo, today } = await world();
    const filters = { ...DEFAULT_FILTERS, site: "todos" as const };
    const before = await loadTriageBatches(repo, filters, NOW, TZ);
    const col = before.find((b) => b.id === today.id)!;
    expect(col.cards.every((c) => c.eligible)).toBe(true);
    const first = col.cards[0];
    await repo.bulkSetStage([first.id], "qualificado");
    const after = (await loadTriageBatches(repo, filters, NOW, TZ)).find((b) => b.id === today.id)!;
    expect(after.cards.some((c) => c.id === first.id)).toBe(false);
    expect(after.total).toBe(col.total - 1);
  });

  it("coluna sem nenhum lead some, e o filtro de busca deixa só aquela coluna", async () => {
    const { repo, yesterday, today } = await world();
    const only = await loadTriageBatches(repo, { ...DEFAULT_FILTERS, site: "todos", elegivel: "todos", busca: yesterday.id }, NOW, TZ);
    expect(only.map((b) => b.id)).toEqual([yesterday.id]);
    const none = await loadTriageBatches(repo, { ...DEFAULT_FILTERS, min: 100, site: "todos", elegivel: "todos", etapa: "ganho" }, NOW, TZ);
    expect(none).toEqual([]);
    void today;
  });

  it("os cartões vêm em ordem de nota (padrão) e carregam o que o cartão mostra", async () => {
    const { repo, today } = await world();
    const col = (await loadTriageBatches(repo, { ...DEFAULT_FILTERS, site: "todos", elegivel: "todos" }, NOW, TZ)).find((b) => b.id === today.id)!;
    const scores = col.cards.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(col.cards[0]).toMatchObject({ name: expect.any(String), phoneDisplay: expect.any(String), websiteKind: expect.any(String) });
  });

  it("lead de importação (sem busca) vai para 'Outras origens', por último", async () => {
    const { repo, today } = await world();
    // leads sem busca, como os de uma importação de JSON
    const imported = createMemoryRepo();
    const search = await imported.createSearch({ niche: "Estética", city: "Fortaleza", state: "CE", requested: 20, source: "apify", status: "done" });
    await ingestPlaces(imported, places.slice(0, 8), { niche: "Estética", city: "Fortaleza", searchId: search.id, source: "apify" });
    await ingestPlaces(imported, places.slice(8, 14), { niche: "Estética", city: "Fortaleza", searchId: null, source: "json" });
    await imported.updateSearch(search.id, { status: "done", finishedAt: new Date("2026-10-24T13:00:00Z").toISOString() });

    const batches = await loadTriageBatches(imported, { ...DEFAULT_FILTERS, site: "todos", elegivel: "todos" }, NOW, TZ);
    expect(batches.map((b) => b.id)).toEqual([search.id, "outros"]);
    const last = batches[1];
    expect(last).toMatchObject({ title: "Outras origens", searchId: null });
    expect(last.total).toBe(last.cards.length);
    // nenhum lead aparece em duas colunas
    const all = batches.flatMap((b) => b.cards.map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
    // e quando todo lead pertence a uma busca exibida, a coluna 'Outras origens' nem existe
    const full = await loadTriageBatches(repo, { ...DEFAULT_FILTERS, site: "todos", elegivel: "todos" }, NOW, TZ);
    expect(full.some((b) => b.id === "outros")).toBe(false);
    void today;
  });
});

describe("ações em lote da coluna", () => {
  const card = (over: Partial<TriageCard>): TriageCard => ({
    id: "x",
    name: "Lead",
    sub: "",
    score: 50,
    websiteKind: "none",
    phoneDisplay: null,
    isMobile: true,
    rating: null,
    reviewsCount: 0,
    eligible: true,
    ineligibleReason: null,
    demo: false,
    ...over,
  });

  it("'melhores' são os elegíveis com nota alta; 'fracos' são os de nota baixa", () => {
    const cards = [
      card({ id: "a", score: 95 }),
      card({ id: "b", score: TRIAGE_BEST }),
      card({ id: "c", score: TRIAGE_BEST - 1 }),
      card({ id: "d", score: 90, eligible: false, ineligibleReason: "optout" }),
      card({ id: "e", score: TRIAGE_LOW - 1 }),
      card({ id: "f", score: TRIAGE_LOW }),
    ];
    expect(bestOf(cards).map((c) => c.id)).toEqual(["a", "b"]);
    expect(weakOf(cards).map((c) => c.id)).toEqual(["e"]);
  });

  it("o cartão resume o lead sem inventar nada", async () => {
    const { repo } = await world();
    const [lead] = (await repo.listLeads({ limit: 1, offset: 0 })).rows;
    const c = toTriageCard(lead);
    expect(c.id).toBe(lead.id);
    expect(c.sub).not.toMatch(/undefined|null/);
    expect(c.score).toBe(lead.score);
  });
});

describe("vista nos filtros", () => {
  it("o padrão é o quadro e 'lista' volta para a tabela, ida e volta pela URL", () => {
    expect(DEFAULT_FILTERS.vista).toBe("kanban");
    expect(parseFilters({}).vista).toBe("kanban");
    expect(parseFilters({ vista: "lista" }).vista).toBe("lista");
    expect(parseFilters({ vista: "xxx" }).vista).toBe("kanban");
  });
});
