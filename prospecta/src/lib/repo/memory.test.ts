import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import { rescore } from "@/lib/leads/rescore";
import { STAGES } from "@/lib/leads/types";
import { createMemoryRepo } from "./memory";

const opts = { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" } as const;

async function seeded() {
  const repo = createMemoryRepo();
  const { leads } = await ingestPlaces(
    repo,
    [
      { title: "A", placeId: "a", phone: "(85) 99111-0001", totalScore: 4.9, reviewsCount: 200 },
      { title: "B", placeId: "b", phone: "(85) 99111-0002", totalScore: 4.0, reviewsCount: 20, website: "https://instagram.com/b" },
      { title: "C", placeId: "c", phone: "(85) 99111-0003", totalScore: 3.2, reviewsCount: 3, website: "https://c.com.br" },
      { title: "Fixo", placeId: "d", phone: "(85) 3322-0004", totalScore: 4.5, reviewsCount: 50 },
    ],
    opts,
  );
  const byName = Object.fromEntries(leads.map((l) => [l.name, l]));
  return { repo, byName };
}

describe("memory repo", () => {
  it("lista ordenando pela nota por padrão", async () => {
    const { repo } = await seeded();
    const { rows, total } = await repo.listLeads({ limit: 10, offset: 0 });
    expect(total).toBe(4);
    expect(rows.map((r) => r.name)[0]).toBe("A");
    expect([...rows].map((r) => r.score)).toEqual([...rows].map((r) => r.score).sort((a, b) => b - a));
  });

  it("filtra por site, elegibilidade, nota mínima e texto sem acento", async () => {
    const { repo } = await seeded();
    expect((await repo.listLeads({ siteKinds: ["none", "social"], limit: 10, offset: 0 })).total).toBe(3);
    expect((await repo.listLeads({ eligible: true, limit: 10, offset: 0 })).total).toBe(3);
    expect((await repo.listLeads({ minScore: 80, limit: 10, offset: 0 })).rows.map((r) => r.name)).toEqual(["A"]);
    expect((await repo.listLeads({ q: "FIXO", limit: 10, offset: 0 })).total).toBe(1);
  });

  it("pagina", async () => {
    const { repo } = await seeded();
    const p1 = await repo.listLeads({ limit: 2, offset: 0 });
    const p2 = await repo.listLeads({ limit: 2, offset: 2 });
    expect(p1.total).toBe(4);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(4);
  });

  it("funil e estatísticas não contam lead inelegível parado em 'novo'", async () => {
    const { repo, byName } = await seeded();
    const stats = await repo.stats();
    expect(stats.total).toBe(4);
    expect(stats.eligible).toBe(3);
    expect(stats.stages.novo).toBe(3);
    const board = await repo.board(10);
    expect(board.novo.total).toBe(3);
    expect(board.novo.rows.map((r) => r.name)).not.toContain("Fixo");

    // se o dono mover o inelegível manualmente, ele passa a aparecer
    await repo.setStage(byName.Fixo.id, "contatado");
    expect((await repo.stats()).stages.contatado).toBe(1);
  });

  it("ganho recebe o ticket médio como valor e soma na receita", async () => {
    const { repo, byName } = await seeded();
    await repo.saveSettings({ ticketAverage: 800 });
    const won = await repo.setStage(byName.A.id, "ganho");
    expect(won.dealValue).toBe(800);
    expect(won.stageChangedAt >= byName.A.stageChangedAt).toBe(true);
    expect((await repo.stats()).wonValue).toBe(800);
  });

  it("mover para a mesma etapa não faz nada", async () => {
    const { repo, byName } = await seeded();
    const same = await repo.setStage(byName.A.id, "novo");
    expect(same.stageChangedAt).toBe(byName.A.stageChangedAt);
  });

  it("move em lote e ignora ids que não existem", async () => {
    const { repo, byName } = await seeded();
    const n = await repo.bulkSetStage([byName.A.id, byName.B.id, "nao-existe"], "qualificado");
    expect(n).toBe(2);
    expect((await repo.stats()).stages.qualificado).toBe(2);
  });

  it("totais do funil cobrem todas as etapas", async () => {
    const { repo } = await seeded();
    const stats = await repo.stats();
    expect(Object.keys(stats.stages).sort()).toEqual([...STAGES].sort());
  });

  it("reserva da busca é atômica: só o primeiro leva", async () => {
    const repo = createMemoryRepo();
    const s = await repo.createSearch({ niche: "x", city: "y", state: null, requested: 5, source: "apify", status: "running" });
    expect(await repo.claimSearchForIngest(s.id)).toBe(true);
    expect(await repo.claimSearchForIngest(s.id)).toBe(false);
    expect((await repo.getSearch(s.id))?.status).toBe("ingesting");
  });

  it("configurações mesclam o que mudou", async () => {
    const repo = createMemoryRepo();
    const before = await repo.getSettings();
    const after = await repo.saveSettings({ ticketAverage: 1200 });
    expect(after.ticketAverage).toBe(1200);
    expect(after.apifyMaxChargeUsd).toBe(before.apifyMaxChargeUsd);
  });
});

describe("rescore", () => {
  it("site fraco sobe a nota de quem já tinha site", async () => {
    const { repo, byName } = await seeded();
    const settings = await repo.getSettings();
    const c = byName.C;
    expect(c.websiteKind).toBe("real");
    const weak = rescore(c, settings, { websiteKind: "weak" });
    expect(weak.score).toBeGreaterThan(c.score);
  });

  it("lead fechado continua com nota zero", async () => {
    const repo = createMemoryRepo();
    const { leads } = await ingestPlaces(repo, [{ title: "X", placeId: "x", phone: "(85) 99111-0009", permanentlyClosed: true }], opts);
    const settings = await repo.getSettings();
    expect(rescore(leads[0], settings, { websiteKind: "none" }).score).toBe(0);
  });
});
