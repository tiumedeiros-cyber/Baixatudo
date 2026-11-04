import { ingestPlaces } from "@/lib/leads/ingest";
import type { Search } from "@/lib/leads/types";
import type { Repo } from "@/lib/repo/types";
import {
  RUN_FINISHED_BAD,
  RUN_FINISHED_OK,
  getDatasetItems,
  getRun,
  type ApifyRun,
} from "./apify";
import type { RawPlace } from "@/lib/leads/to-place";

export interface AdvanceDeps {
  getRun: (token: string, runId: string) => Promise<ApifyRun>;
  getDatasetItems: (token: string, datasetId: string, limit: number) => Promise<RawPlace[]>;
}

const REAL: AdvanceDeps = { getRun, getDatasetItems };

/**
 * Faz uma busca do Apify andar: pergunta ao Apify como está a execução e, quando
 * terminou, baixa os resultados e grava os leads. Seguro para chamar várias vezes
 * (a reserva atômica garante que só um chamador importa).
 */
export async function advanceApifySearch(
  repo: Repo,
  search: Search,
  token: string,
  deps: AdvanceDeps = REAL,
): Promise<Search> {
  if (search.status !== "running" || !search.apifyRunId) return search;

  let run: ApifyRun;
  try {
    run = await deps.getRun(token, search.apifyRunId);
  } catch (error) {
    // Falha de rede passageira não derruba a busca: tenta de novo na próxima consulta.
    const message = error instanceof Error ? error.message : String(error);
    if (/401|inválido|expirado/i.test(message)) return fail(repo, search, message);
    return search;
  }

  if ((RUN_FINISHED_BAD as readonly string[]).includes(run.status)) {
    return fail(repo, search, `O Apify encerrou a busca com status ${run.status}.`);
  }
  if (run.status !== RUN_FINISHED_OK) return search;

  if (!(await repo.claimSearchForIngest(search.id))) {
    return (await repo.getSearch(search.id)) ?? search;
  }

  try {
    const datasetId = search.datasetId ?? run.defaultDatasetId;
    const items = await deps.getDatasetItems(token, datasetId, Math.min(1000, Math.max(50, search.requested * 2)));
    const result = await ingestPlaces(repo, items, {
      niche: search.niche,
      city: search.city,
      searchId: search.id,
      source: "apify",
    });
    const done = await repo.updateSearch(search.id, {
      status: "done",
      found: result.received,
      inserted: result.inserted,
      duplicates: result.duplicates,
      invalid: result.invalid,
      eligible: result.eligible,
      finishedAt: new Date().toISOString(),
    });
    await repo.addEvents([
      {
        leadId: null,
        type: "busca_concluida",
        payload: { niche: search.niche, city: search.city, inserted: result.inserted, searchId: search.id },
      },
    ]);
    return done;
  } catch (error) {
    return fail(repo, search, error instanceof Error ? error.message : String(error));
  }
}

async function fail(repo: Repo, search: Search, message: string): Promise<Search> {
  const failed = await repo.updateSearch(search.id, {
    status: "failed",
    error: message,
    finishedAt: new Date().toISOString(),
  });
  await repo.addEvents([
    {
      leadId: null,
      type: "busca_falhou",
      payload: { niche: search.niche, city: search.city, error: message, searchId: search.id },
    },
  ]);
  return failed;
}
