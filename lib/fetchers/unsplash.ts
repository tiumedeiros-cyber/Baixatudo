/**
 * Unsplash — fotos profissionais (e vídeos, quando a conta tem permissão).
 * API gratuita: 50 req/hora no modo demo, 5k/hora com app aprovado.
 * A resposta já traz `urls.regular` e `links.download` — nada de scraping.
 */
import type { StockItem, StockSearchOptions, StockSearchResult } from './types';

const BASE = 'https://api.unsplash.com';

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  user: { name: string; links?: { html?: string } };
  links: { html: string };
};

export const unsplashSignup = 'https://unsplash.com/developers';

export async function searchUnsplash(
  key: string,
  options: StockSearchOptions,
): Promise<StockSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(30, Math.max(3, options.perPage ?? 18));
  const url = `${BASE}/search/photos?query=${encodeURIComponent(options.query)}&page=${page}&per_page=${perPage}&orientation=landscape`;

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 401
          ? 'A chave do Unsplash foi recusada (use a Access Key do app).'
          : `Unsplash respondeu ${res.status}.`,
    };
  }

  const data = (await res.json()) as { results?: UnsplashPhoto[]; total?: number };
  const items: StockItem[] = (data.results ?? []).map((photo) => ({
    id: `unsplash-${photo.id}`,
    source: 'unsplash' as const,
    kind: 'photo' as const,
    title: (photo.description || photo.alt_description || 'Foto Unsplash').slice(0, 70),
    thumb: photo.urls?.small ?? photo.urls?.thumb ?? '',
    url: photo.urls?.regular ?? photo.urls?.full ?? '',
    width: photo.width,
    height: photo.height,
    author: photo.user?.name,
    page: photo.links?.html,
    license: 'Unsplash · uso livre',
  }));

  return { ok: true, source: 'unsplash', items: items.filter((item) => item.url), page, total: data.total ?? items.length };
}
