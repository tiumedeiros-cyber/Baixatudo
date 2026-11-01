/**
 * Pexels — vídeos B-roll e fotos em HD/4K.
 * API gratuita (https://www.pexels.com/api/): 200 req/hora e 20k/mês no plano free.
 * Só usamos o que já vem na resposta: nenhuma chamada extra por item.
 */
import type { StockItem, StockSearchOptions, StockSearchResult } from './types';

const BASE = 'https://api.pexels.com';

type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  user: { name: string };
  video_files: { link: string; width: number; height: number; quality: string; file_type: string }[];
};

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: { original: string; large2x: string; large: string; medium: string; tiny: string };
};

export const pexelsSignup = 'https://www.pexels.com/api/';

export async function searchPexels(
  key: string,
  options: StockSearchOptions,
): Promise<StockSearchResult> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(30, Math.max(3, options.perPage ?? 18));
  const kind = options.kind === 'audio' ? 'photo' : options.kind;
  const url =
    kind === 'video'
      ? `${BASE}/videos/search?query=${encodeURIComponent(options.query)}&per_page=${perPage}&page=${page}`
      : `${BASE}/v1/search?query=${encodeURIComponent(options.query)}&per_page=${perPage}&page=${page}`;

  const res = await fetch(url, {
    headers: { Authorization: key, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });

  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 401
          ? 'A chave do Pexels foi recusada. Confira se copiou a chave inteira.'
          : `Pexels respondeu ${res.status}.`,
    };
  }

  const data = (await res.json()) as { videos?: PexelsVideo[]; photos?: PexelsPhoto[]; total_results?: number };

  if (kind === 'video') {
    const items: StockItem[] = (data.videos ?? []).map((video) => {
      // pega o melhor arquivo até 1920 de largura (HD) — 4K só se for o único
      const files = [...(video.video_files ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
      const best = files.find((file) => (file.width ?? 0) <= 1920) ?? files[files.length - 1] ?? files[0];
      return {
        id: `pexels-v-${video.id}`,
        source: 'pexels' as const,
        kind: 'video' as const,
        title: `Vídeo Pexels #${video.id}`,
        thumb: video.image,
        url: best?.link ?? '',
        duration: video.duration,
        width: best?.width ?? video.width,
        height: best?.height ?? video.height,
        author: video.user?.name,
        page: video.url,
        license: 'Pexels · uso livre',
      };
    });
    return { ok: true, source: 'pexels', items: items.filter((item) => item.url), page, total: data.total_results ?? items.length };
  }

  const items: StockItem[] = (data.photos ?? []).map((photo) => ({
    id: `pexels-p-${photo.id}`,
    source: 'pexels' as const,
    kind: 'photo' as const,
    title: `Foto Pexels #${photo.id}`,
    thumb: photo.src?.medium ?? photo.src?.large ?? '',
    url: photo.src?.large2x ?? photo.src?.original ?? '',
    width: photo.width,
    height: photo.height,
    author: photo.photographer,
    page: photo.url,
    license: 'Pexels · uso livre',
  }));
  return { ok: true, source: 'pexels', items: items.filter((item) => item.url), page, total: data.total_results ?? items.length };
}
