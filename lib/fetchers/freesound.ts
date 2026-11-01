/**
 * Freesound — efeitos sonoros e ambiências (CC0 / CC-BY).
 * API gratuita: https://freesound.org/apiv2/apply/ (OAuth2 token simples).
 *
 * A listagem usa `previews` (MP3 já servidos pelo CDN) porque o arquivo
 * original exige OAuth2 em dois passos. Preview é o mesmo áudio, sem custo.
 */
import type { StockItem, StockSearchOptions, StockSearchResult } from './types';

const BASE = 'https://freesound.org/apiv2';

type FreesoundResult = {
  id: number;
  name: string;
  duration: number;
  license: string;
  username: string;
  url: string;
  previews: Record<string, string>;
  images: { waveform_m: string; spectral_m?: string };
};

export const freesoundSignup = 'https://freesound.org/apiv2/apply/';

export async function searchFreesound(
  key: string,
  options: StockSearchOptions,
): Promise<StockSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(30, Math.max(3, options.perPage ?? 18));
  const query = options.kind === 'photo' || options.kind === 'video' ? options.query : options.query;
  const filter = 'duration:[0.2 TO 60]';
  const fields = 'id,name,duration,license,username,url,previews,images';
  const url = `${BASE}/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&fields=${fields}&page_size=${perPage}&page=${page}&sort=score`;

  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? 'O token do Freesound foi recusado.' : `Freesound respondeu ${res.status}.`,
    };
  }

  const data = (await res.json()) as { results?: FreesoundResult[]; count?: number };
  const items: StockItem[] = (data.results ?? []).map((sound) => ({
    id: `freesound-${sound.id}`,
    source: 'freesound' as const,
    kind: 'audio' as const,
    title: sound.name.slice(0, 70),
    thumb: sound.images?.waveform_m ?? '',
    url: sound.previews?.['preview-hq-mp3'] ?? sound.previews?.['preview-lq-mp3'] ?? '',
    duration: Math.round(sound.duration),
    author: sound.username,
    page: sound.url,
    license: /creativecommons.org\/publicdomain/i.test(sound.license) ? 'CC0' : 'CC-BY (credite o autor)',
  }));

  return { ok: true, source: 'freesound', items: items.filter((item) => item.url), page, total: data.count ?? items.length };
}
