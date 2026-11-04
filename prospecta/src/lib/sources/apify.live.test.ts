/**
 * Teste AO VIVO do Apify. Fica desligado por padrão (gasta crédito de verdade).
 *
 * Para rodar (lê o token do .env.local sem mostrá-lo):
 *   RUN_LIVE_APIFY=1 LIVE_LIMIT=20 node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/sources/apify.live.test.ts
 *
 * Variáveis opcionais: LIVE_NICHE, LIVE_CITY, LIVE_UF, LIVE_MAX_USD, LIVE_OUT (arquivo para salvar o JSON bruto).
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import { createMemoryRepo } from "@/lib/repo/memory";
import { ufName } from "@/lib/leads/niches";
import { buildActorInput, estimateCostUsd, getDatasetItems, getRun, startRun } from "./apify";

const live = process.env.RUN_LIVE_APIFY === "1" && !!process.env.APIFY_TOKEN;

describe.skipIf(!live)("Apify ao vivo (opt-in)", () => {
  it(
    "busca no Maps, normaliza e resume",
    async () => {
      const token = process.env.APIFY_TOKEN as string;
      const limit = Number(process.env.LIVE_LIMIT ?? 20);
      const niche = process.env.LIVE_NICHE ?? "Estética";
      const city = process.env.LIVE_CITY ?? "Fortaleza";
      const uf = process.env.LIVE_UF ?? "CE";
      const maxUsd = Number(process.env.LIVE_MAX_USD ?? 0.8);

      const estimate = estimateCostUsd(limit);
      expect(estimate).toBeLessThanOrEqual(maxUsd);

      const run = await startRun(token, buildActorInput({ niche, city, state: uf, stateName: ufName(uf), limit }), {
        maxChargeUsd: maxUsd,
        timeoutSecs: 600,
      });
      console.log(`[live] execução iniciada, status inicial: ${run.status}`);

      let current = run;
      const started = Date.now();
      while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(current.status)) {
        if (Date.now() - started > 9 * 60_000) throw new Error("Passou de 9 minutos esperando o Apify.");
        await new Promise((r) => setTimeout(r, 5000));
        current = await getRun(token, run.id);
      }
      console.log(
        `[live] terminou: ${current.status} em ${Math.round((Date.now() - started) / 1000)} s, custo real: US$ ${current.usageTotalUsd ?? "?"}`,
      );
      expect(current.status).toBe("SUCCEEDED");

      const items = await getDatasetItems(token, current.defaultDatasetId, limit * 2);
      if (process.env.LIVE_OUT) fs.writeFileSync(process.env.LIVE_OUT, JSON.stringify(items, null, 2), "utf8");

      const repo = createMemoryRepo();
      const result = await ingestPlaces(repo, items, { niche, city, searchId: null, source: "apify" });
      const kinds: Record<string, number> = {};
      for (const l of result.leads) kinds[l.websiteKind] = (kinds[l.websiteKind] ?? 0) + 1;

      const fields = new Set<string>();
      for (const it of items.slice(0, 5)) for (const k of Object.keys(it)) fields.add(k);

      const top = [...result.leads]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((l) => ({
          nome: l.name,
          nota: l.score,
          site: l.websiteKind,
          celular: l.isMobile,
          maps: l.rating,
          avaliacoes: l.reviewsCount,
          bairro: l.neighborhood,
        }));

      console.log(
        "[live] resumo:\n" +
          JSON.stringify(
            {
              itensRecebidos: items.length,
              ...result,
              leads: undefined,
              porTipoDeSite: kinds,
              camposDoPrimeiroItem: [...fields].sort(),
              top,
              custoRealUsd: current.usageTotalUsd,
            },
            null,
            2,
          ),
      );
      expect(items.length).toBeGreaterThan(0);
    },
    12 * 60_000,
  );
});
