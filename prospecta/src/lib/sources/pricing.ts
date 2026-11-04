/**
 * Preço de lista do Google Maps Scraper (Apify, pay-per-event), lido da API pública
 * do Apify em 2026-10-21. Planos pagos têm desconto; o plano grátis dá crédito mensal.
 * Não usamos nenhum filtro/add-on, que cobram à parte.
 */
export const APIFY_PRICE_USD = { start: 0.007, perPlace: 0.004 } as const;

export function estimateCostUsd(limit: number): number {
  return Math.round((APIFY_PRICE_USD.start + APIFY_PRICE_USD.perPlace * limit) * 1000) / 1000;
}
