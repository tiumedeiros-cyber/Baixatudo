import type { RawPlace } from "@/lib/leads/to-place";

const BASE = "https://api.apify.com/v2";
/** Google Maps Scraper, do Apify. */
export const ACTOR_ID = "compass~crawler-google-places";

export { APIFY_PRICE_USD, estimateCostUsd } from "./pricing";

export interface ActorInputParams {
  niche: string;
  city: string;
  state?: string | null;
  limit: number;
  /** Nome completo do estado (o Maps entende melhor que a sigla). */
  stateName?: string | null;
}

/**
 * Entrada mínima do ator. Não ligamos `website: withoutWebsite` nem `skipClosedPlaces`
 * porque são filtros pagos e o filtro de site do Maps joga fora quem só tem Instagram,
 * que é justamente o melhor lead. Filtramos do nosso lado.
 */
export function buildActorInput(p: ActorInputParams) {
  const place = [p.city, p.stateName ?? p.state, "Brasil"].filter(Boolean).join(", ");
  return {
    searchStringsArray: [p.niche],
    locationQuery: place,
    maxCrawledPlacesPerSearch: p.limit,
    language: "pt-BR",
    countryCode: "br",
  };
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Apify respondeu ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* corpo não era JSON */
    }
    if (res.status === 401) message = "Token do Apify inválido ou expirado.";
    if (res.status === 402) message = "Sem crédito no Apify para essa busca.";
    throw new ApifyError(message, res.status);
  }
  return JSON.parse(text) as T;
}

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  /** Custo real da execução em US$, quando o Apify já calculou. */
  usageTotalUsd?: number;
  statusMessage?: string;
}

export async function startRun(
  token: string,
  input: unknown,
  opts: { maxChargeUsd: number; timeoutSecs?: number },
): Promise<ApifyRun> {
  const qs = new URLSearchParams({
    maxTotalChargeUsd: String(opts.maxChargeUsd),
    timeout: String(opts.timeoutSecs ?? 900),
  });
  const { data } = await call<{ data: ApifyRun }>(token, `/acts/${ACTOR_ID}/runs?${qs}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data;
}

export async function getRun(token: string, runId: string): Promise<ApifyRun> {
  const { data } = await call<{ data: ApifyRun }>(token, `/actor-runs/${encodeURIComponent(runId)}`);
  return data;
}

export async function getDatasetItems(
  token: string,
  datasetId: string,
  limit: number,
): Promise<RawPlace[]> {
  const qs = new URLSearchParams({ format: "json", clean: "true", limit: String(limit) });
  return call<RawPlace[]>(token, `/datasets/${encodeURIComponent(datasetId)}/items?${qs}`);
}

export const RUN_FINISHED_OK = "SUCCEEDED";
export const RUN_FINISHED_BAD = ["FAILED", "ABORTED", "TIMED-OUT"] as const;
