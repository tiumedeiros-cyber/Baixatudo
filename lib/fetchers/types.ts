/**
 * Tipos comuns dos fetchers de banco profissional.
 *
 * Cada fonte (Pexels, Unsplash, Pixabay, Freesound) traduz a própria resposta
 * para este formato — assim a UI não sabe (nem precisa saber) de onde veio.
 */

export type StockKind = 'video' | 'photo' | 'audio';

export type StockItem = {
  id: string;
  source: 'pexels' | 'unsplash' | 'pixabay' | 'freesound';
  kind: StockKind;
  title: string;
  /** miniatura (pode ser a própria imagem em tamanho menor) */
  thumb: string;
  /** arquivo final para usar na timeline */
  url: string;
  /** duração em segundos (vídeo/áudio) */
  duration?: number;
  width?: number;
  height?: number;
  author?: string;
  /** página original (crédito / licença) */
  page?: string;
  /** licença curta, exibida no card */
  license?: string;
};

export type StockSearchResult =
  | { ok: true; source: StockItem['source']; items: StockItem[]; page: number; total: number }
  | { ok: false; needKey?: boolean; provider?: string; signup?: string; error?: string };

export type StockSearchOptions = {
  query: string;
  kind: StockKind;
  page?: number;
  perPage?: number;
};

/** Só aceitamos salvar arquivos vindos dos hosts destas fontes (anti-SSRF). */
export const STOCK_HOSTS: Record<StockItem['source'], string[]> = {
  pexels: ['images.pexels.com', 'videos.pexels.com', 'player.vimeo.com'],
  unsplash: ['images.unsplash.com', 'plus.unsplash.com'],
  pixabay: ['cdn.pixabay.com', 'pixabay.com'],
  freesound: ['freesound.org', 'cdn.freesound.org'],
};

export function isStockUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    return Object.values(STOCK_HOSTS)
      .flat()
      .some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}
