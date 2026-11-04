import { describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "@/lib/repo/memory";
import { advanceApifySearch, type AdvanceDeps } from "./advance";
import type { RawPlace } from "@/lib/leads/to-place";

const ITEMS: RawPlace[] = [
  { title: "Studio A", placeId: "a", phone: "(85) 99123-4567", totalScore: 4.7, reviewsCount: 80 },
  { title: "Studio B", placeId: "b", phone: "(85) 98888-7777", website: "https://instagram.com/b" },
];

async function setup() {
  const repo = createMemoryRepo();
  const search = await repo.createSearch({
    niche: "Estética",
    city: "Fortaleza",
    state: "CE",
    requested: 50,
    source: "apify",
    status: "running",
    apifyRunId: "run1",
    datasetId: "ds1",
  });
  return { repo, search };
}

const deps = (status: string, items: RawPlace[] = ITEMS): AdvanceDeps => ({
  getRun: vi.fn(async () => ({ id: "run1", status, defaultDatasetId: "ds1" })),
  getDatasetItems: vi.fn(async () => items),
});

describe("advanceApifySearch", () => {
  it("importa os leads quando o Apify terminou", async () => {
    const { repo, search } = await setup();
    const d = deps("SUCCEEDED");
    const done = await advanceApifySearch(repo, search, "tok", d);
    expect(done).toMatchObject({ status: "done", found: 2, inserted: 2, eligible: 2 });
    expect(done.finishedAt).not.toBeNull();
    expect((await repo.stats()).total).toBe(2);
    const events = await repo.listEvents({ types: ["busca_concluida"], limit: 5 });
    expect(events).toHaveLength(1);
  });

  it("é idempotente: chamar de novo não importa duas vezes", async () => {
    const { repo, search } = await setup();
    const d = deps("SUCCEEDED");
    await advanceApifySearch(repo, search, "tok", d);
    const again = await advanceApifySearch(repo, (await repo.getSearch(search.id))!, "tok", d);
    expect(again.status).toBe("done");
    expect(d.getDatasetItems).toHaveBeenCalledTimes(1);
    expect((await repo.stats()).total).toBe(2);
  });

  it("duas consultas simultâneas importam uma vez só", async () => {
    const { repo, search } = await setup();
    const d = deps("SUCCEEDED");
    await Promise.all([
      advanceApifySearch(repo, search, "tok", d),
      advanceApifySearch(repo, search, "tok", d),
    ]);
    expect(d.getDatasetItems).toHaveBeenCalledTimes(1);
    expect((await repo.stats()).total).toBe(2);
  });

  it("enquanto roda, não muda nada", async () => {
    const { repo, search } = await setup();
    const d = deps("RUNNING");
    const r = await advanceApifySearch(repo, search, "tok", d);
    expect(r.status).toBe("running");
    expect(d.getDatasetItems).not.toHaveBeenCalled();
  });

  it("marca como falha quando o Apify encerra mal", async () => {
    const { repo, search } = await setup();
    const r = await advanceApifySearch(repo, search, "tok", deps("FAILED"));
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/FAILED/);
    expect(await repo.listEvents({ types: ["busca_falhou"], limit: 5 })).toHaveLength(1);
  });

  it("token inválido derruba a busca com mensagem clara", async () => {
    const { repo, search } = await setup();
    const d: AdvanceDeps = {
      getRun: vi.fn(async () => {
        throw new Error("Token do Apify inválido ou expirado.");
      }),
      getDatasetItems: vi.fn(),
    };
    const r = await advanceApifySearch(repo, search, "tok", d);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/inválido/);
  });

  it("falha de rede passageira mantém a busca rodando", async () => {
    const { repo, search } = await setup();
    const d: AdvanceDeps = {
      getRun: vi.fn(async () => {
        throw new Error("fetch failed");
      }),
      getDatasetItems: vi.fn(),
    };
    const r = await advanceApifySearch(repo, search, "tok", d);
    expect(r.status).toBe("running");
  });

  it("erro ao importar vira falha, não trava em 'importando'", async () => {
    const { repo, search } = await setup();
    const d: AdvanceDeps = {
      getRun: vi.fn(async () => ({ id: "run1", status: "SUCCEEDED", defaultDatasetId: "ds1" })),
      getDatasetItems: vi.fn(async () => {
        throw new Error("dataset indisponível");
      }),
    };
    const r = await advanceApifySearch(repo, search, "tok", d);
    expect(r).toMatchObject({ status: "failed", error: "dataset indisponível" });
  });
});
