/**
 * Registro dos bancos de mídia profissional (todos com plano gratuito).
 * A UI e a rota /api/stock só conhecem este arquivo — adicionar uma fonte
 * nova é escrever um fetcher e uma linha aqui.
 */
import { searchPexels } from './pexels';
import { searchUnsplash } from './unsplash';
import { searchPixabay } from './pixabay';
import { searchFreesound } from './freesound';
import { resolveStockKey, STOCK_SIGNUP, type StockProvider } from './keys';
import type { StockSearchOptions, StockSearchResult } from './types';

export const STOCK_SOURCES: StockProvider[] = ['pexels', 'unsplash', 'pixabay', 'freesound'];

export const STOCK_LABEL: Record<StockProvider, string> = {
  pexels: 'Pexels',
  unsplash: 'Unsplash',
  pixabay: 'Pixabay',
  freesound: 'Freesound',
};

export const STOCK_KINDS: Record<StockProvider, ('video' | 'photo' | 'audio')[]> = {
  pexels: ['video', 'photo'],
  unsplash: ['photo'],
  pixabay: ['video', 'photo', 'audio'],
  freesound: ['audio'],
};

const FETCHERS = {
  pexels: searchPexels,
  unsplash: searchUnsplash,
  pixabay: searchPixabay,
  freesound: searchFreesound,
} as const;

export function isStockProvider(value: string): value is StockProvider {
  return (STOCK_SOURCES as string[]).includes(value);
}

/** Pesquisa em uma fonte, devolvendo `needKey` quando falta a chave gratuita. */
export async function searchStock(
  userId: string | null,
  provider: StockProvider,
  options: StockSearchOptions,
): Promise<StockSearchResult> {
  const { key } = await resolveStockKey(userId, provider);
  if (!key) {
    return { ok: false, needKey: true, provider, signup: STOCK_SIGNUP[provider] };
  }
  try {
    return await FETCHERS[provider](key, options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar a fonte.' };
  }
}

/**
 * Teste de conexão de uma chave (Módulo 2 · item 1).
 *
 * Usa a MESMA função da busca real, com uma consulta mínima — se a chave for
 * inválida, o provedor responde 401 e devolvemos o motivo para o toast.
 */
export async function testStockKey(
  provider: StockProvider,
  key: string,
): Promise<{ ok: boolean; ms: number; items?: number; error?: string }> {
  const t0 = Date.now();
  if (!key) return { ok: false, ms: 0, error: 'Nenhuma chave informada.' };
  try {
    const result = await FETCHERS[provider](key, { query: 'background', kind: STOCK_KINDS[provider][0], perPage: 3 });
    const ms = Date.now() - t0;
    if (!result.ok) return { ok: false, ms, error: ('error' in result && result.error) || 'A fonte recusou a chave.' };
    return { ok: true, ms, items: result.items.length };
  } catch (error) {
    return { ok: false, ms: Date.now() - t0, error: error instanceof Error ? error.message : 'Falha de rede.' };
  }
}

export { STOCK_SIGNUP };
export type { StockProvider };
export type { StockItem, StockKind, StockSearchResult, StockSearchOptions } from './types';
export { isStockUrl, STOCK_HOSTS } from './types';
