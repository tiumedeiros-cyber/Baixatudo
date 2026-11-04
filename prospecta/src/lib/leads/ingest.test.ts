import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/lib/repo/memory";
import { makeDemoPlaces } from "@/lib/sources/demo";
import { ingestPlaces } from "./ingest";
import type { RawPlace } from "./to-place";

const OPTS = { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" } as const;

const place = (over: RawPlace = {}): RawPlace => ({
  title: "Studio Aurora",
  categoryName: "Clínica de estética",
  placeId: "ChIJ-aurora",
  phone: "(85) 99123-4567",
  website: null,
  totalScore: 4.8,
  reviewsCount: 120,
  city: "Fortaleza",
  neighborhood: "Aldeota",
  url: "https://maps.google.com/?cid=1",
  ...over,
});

describe("ingestPlaces", () => {
  it("normaliza, pontua e grava", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, [place()], OPTS);
    expect(r).toMatchObject({ received: 1, inserted: 1, eligible: 1, duplicates: 0, invalid: 0 });

    const [lead] = r.leads;
    expect(lead).toMatchObject({
      name: "Studio Aurora",
      phoneE164: "+5585991234567",
      isMobile: true,
      websiteKind: "none",
      stage: "novo",
      eligible: true,
      ineligibleReason: null,
      source: "apify",
      niche: "Estética",
    });
    expect(lead.score).toBeGreaterThanOrEqual(80);
    expect(lead.scoreBreakdown).toHaveLength(6);
  });

  it("marca inelegíveis com o motivo certo", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(
      repo,
      [
        place({ placeId: "a", title: "Só fixo", phone: "(85) 3322-1100" }),
        place({ placeId: "b", title: "Sem telefone", phone: null }),
        place({ placeId: "c", title: "Fechado", phone: "(85) 98888-7777", permanentlyClosed: true }),
      ],
      OPTS,
    );
    const byName = Object.fromEntries(r.leads.map((l) => [l.name, l]));
    expect(byName["Só fixo"].ineligibleReason).toBe("sem_celular");
    expect(byName["Sem telefone"].ineligibleReason).toBe("sem_celular");
    expect(byName["Fechado"].ineligibleReason).toBe("fechado");
    expect(r.eligible).toBe(0);
  });

  it("descarta item sem nome", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, [{ phone: "(85) 99123-4567" }, place()], OPTS);
    expect(r.invalid).toBe(1);
    expect(r.inserted).toBe(1);
  });

  it("remove repetidos dentro do lote (mesmo placeId ou mesmo celular)", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(
      repo,
      [
        place(),
        place({ title: "Studio Aurora (cópia)" }),
        place({ placeId: "outro", title: "Outro nome", phone: "+55 85 99123-4567" }),
      ],
      OPTS,
    );
    expect(r.inserted).toBe(1);
    expect(r.duplicates).toBe(2);
  });

  it("não repete leads de buscas anteriores", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, [place()], OPTS);
    const again = await ingestPlaces(repo, [place(), place({ placeId: "novo", title: "Novo", phone: "(85) 97777-6666" })], OPTS);
    expect(again.inserted).toBe(1);
    expect(again.duplicates).toBe(1);
    expect((await repo.stats()).total).toBe(2);
  });

  it("sem placeId deduplica por nome + telefone", async () => {
    const repo = createMemoryRepo();
    const noId = place({ placeId: undefined });
    await ingestPlaces(repo, [noId], OPTS);
    const again = await ingestPlaces(repo, [{ ...noId, title: "STUDIO  aurora" }], OPTS);
    expect(again.inserted).toBe(0);
  });

  it("respeita a lista de bloqueio", async () => {
    const repo = createMemoryRepo();
    repo._addOptout("+5585991234567");
    const r = await ingestPlaces(repo, [place()], OPTS);
    expect(r.leads[0]).toMatchObject({ eligible: false, ineligibleReason: "optout" });
  });

  it("negócio fechado ou bloqueado tem nota zero e explica o motivo", async () => {
    const repo = createMemoryRepo();
    repo._addOptout("+5585988887777");
    const r = await ingestPlaces(
      repo,
      [
        place({ placeId: "f", title: "Fechado", phone: "(85) 99111-2222", permanentlyClosed: true }),
        place({ placeId: "b", title: "Bloqueado", phone: "(85) 98888-7777" }),
      ],
      OPTS,
    );
    for (const lead of r.leads) {
      expect(lead.score).toBe(0);
      expect(lead.scoreBreakdown).toHaveLength(1);
      expect(lead.scoreBreakdown[0].detail.length).toBeGreaterThan(5);
    }
  });

  it("Instagram no campo site vira 'social' e continua elegível", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, [place({ website: "https://instagram.com/aurora" })], OPTS);
    expect(r.leads[0]).toMatchObject({ websiteKind: "social", eligible: true });
  });

  it("registra um evento por lead criado", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, [place(), place({ placeId: "z", title: "Z", phone: "(85) 96666-5555" })], OPTS);
    const events = await repo.listEvents({ types: ["lead_criado"], limit: 10 });
    expect(events).toHaveLength(r.inserted);
  });

  it("usa os termos de nicho de ticket alto das configurações", async () => {
    const repo = createMemoryRepo();
    await repo.saveSettings({ highTicketTerms: ["padaria"] });
    const r = await ingestPlaces(repo, [place({ categoryName: "Padaria artesanal" })], { ...OPTS, niche: "Padaria" });
    expect(r.leads[0].scoreBreakdown.find((i) => i.key === "nicho")?.points).toBe(10);
  });
});

describe("makeDemoPlaces", () => {
  it("é determinístico e sempre marcado como demo", () => {
    const a = makeDemoPlaces({ niche: "Estética", city: "Fortaleza", limit: 30 });
    const b = makeDemoPlaces({ niche: "Estética", city: "Fortaleza", limit: 30 });
    expect(a).toEqual(b);
    expect(a.every((p) => String(p.title).endsWith("(demo)"))).toBe(true);
    expect(a.every((p) => String(p.placeId).startsWith("demo-"))).toBe(true);
  });

  it("não gera telefones reais (celular começa com 90) e passa pelo pipeline", async () => {
    const places = makeDemoPlaces({ niche: "Estética", city: "Fortaleza", limit: 60 });
    for (const p of places) {
      if (typeof p.phone === "string") expect(p.phone).toMatch(/^\(85\) (90\d{3}|3\d{3})-\d{4}$/);
    }
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, places, { ...OPTS, source: "demo" });
    expect(r.inserted).toBe(60);
    expect(r.eligible).toBeGreaterThan(20);
  });

  it("buscas demo diferentes não colidem nos telefones", async () => {
    const repo = createMemoryRepo();
    const a = await ingestPlaces(repo, makeDemoPlaces({ niche: "Estética", city: "Fortaleza", limit: 50 }), { ...OPTS, source: "demo" });
    const b = await ingestPlaces(repo, makeDemoPlaces({ niche: "Pet shop", city: "Fortaleza", limit: 50 }), { ...OPTS, source: "demo" });
    expect(a.duplicates).toBe(0);
    expect(b.duplicates).toBe(0);
  });
});
