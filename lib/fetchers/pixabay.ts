/**
 * Pixabay — fotos, ilustrações e vídeos (sem marca d'água).
 * API gratuita: https://pixabay.com/api/docs/ (5.000 req/hora com chave free).
 */
import type { StockItem, StockSearchOptions, StockSearchResult } from './types';

const BASE = 'https://pixabay.com/api';

type PixabayVideoHit = {
  id: number;
  pageURL: string;
  user: string;
  duration: number;
  videos: Record<string, { url: string; width: number; height: number; size: number }>;
};

type PixabayImageHit = {
  id: number;
  pageURL: string;
  user: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
};

export const pixabaySignup = 'https://pixabay.com/api/docs/';

export async function searchPixabay(
  key: string,
  options: StockSearchOptions,
): Promise<StockSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(30, Math.max(3, options.perPage ?? 18));
  const kind = options.kind === 'audio' ? 'photo' : options.kind;

  const url =
    kind === 'video'
      ? `${BASE}/videos/?key=${key}&q=${encodeURIComponent(options.query)}&per_page=${perPage}&page=${page}&safesearch=true`
      : `${BASE}/?key=${key}&q=${encodeURIComponent(options.query)}&per_page=${perPage}&page=${page}&image_type=photo&safesearch=true`;

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 400 || res.status === 401 ? 'A chave do Pixabay foi recusada.' : `Pixabay respondeu ${res.status}.`,
    };
  }

  const data = (await res.json()) as { hits?: (PixabayVideoHit | PixabayImageHit)[]; totalHits?: number };

  if (kind === 'video') {
    const items = (data.hits as PixabayVideoHit[] | undefined ?? []).map<StockItem>((hit) => {
      const files = Object.values(hit.videos ?? {}).sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
      const best = files.find((file) => (file.width ?? 0) <= 1920) ?? files[files.length - 1] ?? files[0];
      return {
        id: `pixabay-v-${hit.id}`,
        source: 'pixabay',
        kind: 'video',
        title: `Vídeo Pixabay #${hit.id}`,
        thumb: best?.url ?? '',
        url: best?.url ?? '',
        duration: hit.duration,
        width: best?.width,
        height: best?.height,
        author: hit.user,
        page: hit.pageURL,
        license: 'Pixabay · uso livre',
      };
    });
    return { ok: true, source: 'pixabay', items: items.filter((item) => item.url), page, total: data.totalHits ?? items.length };
  }

  const items = (data.hits as PixabayImageHit[] | undefined ?? []).map<StockItem>((hit) => ({
    id: `pixabay-p-${hit.id}`,
    source: 'pixabay',
    kind: 'photo',
    title: `Foto Pixabay #${hit.id}`,
    thumb: hit.previewURL,
    url: hit.largeImageURL ?? hit.webformatURL,
    width: hit.imageWidth,
    height: hit.imageHeight,
    author: hit.user,
    page: hit.pageURL,
    license: 'Pixabay · uso livre',
  }));
  return { ok: true, source: 'pixabay', items: items.filter((item) => item.url), page, total: data.totalHits ?? items.length };
}
