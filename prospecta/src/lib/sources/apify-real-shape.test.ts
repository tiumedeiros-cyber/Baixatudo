/**
 * Regressão com dados NO FORMATO REAL do Google Maps Scraper (Apify).
 * A fixture vem de uma busca real ("Estética" em Fortaleza, 20 lugares, 22/10/2026), mas foi
 * anonimizada: nomes, telefones e endereços são inventados; só a forma e as proporções são reais
 * (Instagram e linktr.ee no campo site, "Ceará" e "CE" no estado, +55 85 …, fixo no meio, canva.site).
 */
import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "./fixtures/apify-estetica-fortaleza.anon.json";

const items = fixture as unknown as RawPlace[];
const OPTS = { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" } as const;

describe("dados no formato real do Apify", () => {
  it("a fixture é anonimizada (nenhum telefone nem nome real)", () => {
    for (const it of items) {
      expect(String(it.title)).toMatch(/^Estética Exemplo \d\d$/);
      expect(String(it.phone)).toMatch(/^\+55 85 (90000|3000)-00\d\d$/);
    }
  });

  it("passa inteira pelo pipeline com as proporções da busca real", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, items, OPTS);
    expect(r).toMatchObject({ received: 20, inserted: 20, duplicates: 0, invalid: 0, eligible: 19 });

    const kinds: Record<string, number> = {};
    for (const l of r.leads) kinds[l.websiteKind] = (kinds[l.websiteKind] ?? 0) + 1;
    expect(kinds).toEqual({ none: 8, social: 10, weak: 1, real: 1 });
  });

  it("o único telefone fixo vira inelegível por 'sem_celular'", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, items, OPTS);
    const ineligible = r.leads.filter((l) => !l.eligible);
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0].ineligibleReason).toBe("sem_celular");
    expect(ineligible[0].isMobile).toBe(false);
  });

  it("Instagram, Facebook e linktr.ee contam como 'só rede social'", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, items, OPTS);
    const social = r.leads.filter((l) => l.websiteKind === "social");
    expect(social.length).toBe(10);
    for (const l of social) expect(l.websiteRaw).toMatch(/instagram\.com|facebook\.com|linktr\.ee/);
  });

  it("os melhores leads são os sem site ou só com rede social", async () => {
    const repo = createMemoryRepo();
    const r = await ingestPlaces(repo, items, OPTS);
    const top = [...r.leads].sort((a, b) => b.score - a.score).slice(0, 10);
    for (const l of top) expect(["none", "social"]).toContain(l.websiteKind);
    const real = r.leads.find((l) => l.websiteKind === "real");
    expect(real).toBeDefined();
    expect(real!.score).toBeLessThan(Math.min(...top.map((l) => l.score)));
  });

  it("reimportar a mesma busca não duplica nada", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, items, OPTS);
    const again = await ingestPlaces(repo, items, OPTS);
    expect(again).toMatchObject({ inserted: 0, duplicates: 20 });
  });
});
