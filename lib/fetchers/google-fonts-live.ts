/**
 * Catálogo VIVO do Google Fonts (sem chave, sem conta).
 *
 * O endpoint público `fonts.google.com/metadata/fonts` devolve o catálogo
 * completo que o próprio site usa (≈1.700 famílias, com categoria e estilos).
 * Buscamos só no servidor, com cache de 24 h, e caímos no catálogo curado
 * (`lib/fetchers/google-fonts.ts`) se a rede falhar — o seletor nunca quebra.
 *
 * Isolado de propósito: nenhum componente conhece essa URL.
 */

import { GOOGLE_FONTS, type FontCategory, type GoogleFont } from './google-fonts';

const CATALOG_URL = 'https://fonts.google.com/metadata/fonts';
const TTL = 24 * 60 * 60 * 1000;

type LiveItem = { family?: string; category?: string; fonts?: Record<string, unknown> };

let cache: { at: number; items: GoogleFont[] } | null = null;

function normalizeCategory(value: string | undefined): FontCategory {
  const raw = (value ?? '').toLowerCase();
  if (raw.includes('handwriting') || raw.includes('script')) return 'script';
  if (raw.includes('mono')) return 'mono';
  if (raw.includes('serif') && !raw.includes('sans')) return 'serif';
  if (raw.includes('display')) return 'display';
  return 'sans';
}

function weightsFromStyles(fonts: Record<string, unknown> | undefined): number[] {
  if (!fonts) return [400, 700];
  const out = new Set<number>();
  for (const key of Object.keys(fonts)) {
    const italic = key.includes('italic');
    if (italic) continue;
    for (const n of key.match(/\d+/g) ?? []) out.add(Number(n));
  }
  if (!out.size) return [400, 700];
  return [...out].sort((a, b) => a - b).slice(0, 6);
}

/** Catálogo do Google (ao vivo). Devolve o curado se algo der errado. */
export async function fetchGoogleFontCatalog(): Promise<GoogleFont[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  try {
    const res = await fetch(CATALOG_URL, {
      // a resposta começa com ")]}'" — limpamos abaixo
      headers: { accept: 'application/json' },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const text = (await res.text()).replace(/^\)\]\}'\n?/, '');
    const data = JSON.parse(text) as { familyMetadataList?: LiveItem[] };
    const list = data.familyMetadataList ?? [];
    const items: GoogleFont[] = list
      .filter((item) => Boolean(item.family))
      .map((item) => ({
        family: String(item.family),
        category: normalizeCategory(item.category),
        weights: weightsFromStyles(item.fonts),
        tags: String(item.category ?? '').toLowerCase(),
      }));
    if (!items.length) throw new Error('catálogo vazio');
    cache = { at: Date.now(), items };
    return items;
  } catch {
    // rede bloqueada/offline: o catálogo curado continua funcionando
    return GOOGLE_FONTS;
  }
}

/** Busca por nome/tag/categoria, com o curado sempre na frente. */
export async function searchFontCatalog(query: string, category?: FontCategory | 'all', limit = 120): Promise<GoogleFont[]> {
  const live = await fetchGoogleFontCatalog();
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const all: GoogleFont[] = [];
  for (const font of [...GOOGLE_FONTS, ...live]) {
    const key = font.family.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (category && category !== 'all' && font.category !== category) continue;
    if (q && !`${font.family} ${font.tags}`.toLowerCase().includes(q)) continue;
    all.push(font);
    if (all.length >= limit) break;
  }
  return all;
}
