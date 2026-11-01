'use client';

/**
 * FontPicker — seletor de tipografia do painel de Texto.
 *
 * Carrega as fontes direto do CDN do Google (sem chave, sem armazenamento) e
 * aplica no clipe selecionado. Não toca na timeline: só chama `patch()`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Type } from 'lucide-react';
import { ensureGoogleFont, searchFonts, type FontCategory, type GoogleFont } from '@/lib/fetchers/google-fonts';
import { cn } from '@/lib/utils';

const CATEGORIES: { id: FontCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'sans', label: 'Sans' },
  { id: 'display', label: 'Título' },
  { id: 'serif', label: 'Serifada' },
  { id: 'script', label: 'Manuscrita' },
  { id: 'mono', label: 'Mono' },
];

export function FontPicker({
  value,
  onChange,
  limit = 8,
}: {
  value: string;
  onChange: (family: string) => void;
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontCategory | 'all'>('all');
  /** catálogo ampliado vindo do servidor (Google Fonts ao vivo) */
  const [catalog, setCatalog] = useState<GoogleFont[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const local = useMemo(() => searchFonts(query, category).slice(0, 60), [query, category]);

  /** Junta o catálogo curado (instantâneo) com o catálogo vivo, sem duplicar. */
  const results = useMemo(() => {
    if (!catalog) return local;
    const q = query.trim().toLowerCase();
    const seen = new Set(local.map((font) => font.family.toLowerCase()));
    const extra = catalog.filter((font) => {
      if (seen.has(font.family.toLowerCase())) return false;
      if (category !== 'all' && font.category !== category) return false;
      return !q || `${font.family} ${font.tags}`.toLowerCase().includes(q);
    });
    return [...local, ...extra].slice(0, 120);
  }, [local, catalog, query, category]);

  // busca o catálogo completo só quando o seletor abre (1x por sessão)
  useEffect(() => {
    if (!open || catalog || loadingCatalog) return;
    setLoadingCatalog(true);
    fetch('/api/fonts?limit=200', { cache: 'force-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: GoogleFont[] } | null) => {
        if (data?.items?.length) setCatalog(data.items);
      })
      .catch(() => undefined)
      .finally(() => setLoadingCatalog(false));
  }, [open, catalog, loadingCatalog]);

  // pré-carrega as fontes visíveis para o preview sair na fonte certa
  useEffect(() => {
    if (!open) return;
    results.slice(0, limit).forEach((font) => {
      void ensureGoogleFont(font.family, font.weights);
    });
  }, [open, results, limit]);

  async function apply(family: string) {
    const font = results.find((item) => item.family === family);
    await ensureGoogleFont(family, font?.weights ?? [400, 700]);
    onChange(family);
    setOpen(false);
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((value_) => !value_)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-[11px] text-white transition hover:border-brand-400/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Type className="h-3 w-3 text-brand-300" />
          <span style={{ fontFamily: `"${value}", sans-serif` }}>{value || 'Escolher fonte'}</span>
        </span>
        <span className="text-[9px] text-slate-500">{open ? 'fechar' : 'Google Fonts'}</span>
      </button>

      {open ? (
        <div className="rounded-xl border border-white/10 bg-ink-950 p-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="buscar fonte (ex.: impact, elegante)"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-slate-500 focus:border-brand-400/60"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition',
                  category === item.id ? 'bg-brand-500/20 text-brand-100' : 'text-slate-400 hover:text-white',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 max-h-52 space-y-0.5 overflow-y-auto pr-1">
            {results.map((font) => (
              <button
                key={font.family}
                type="button"
                onClick={() => void apply(font.family)}
                onMouseEnter={() => void ensureGoogleFont(font.family, font.weights)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-white/10',
                  font.family === value ? 'bg-brand-500/15 text-white' : 'text-slate-200',
                )}
              >
                <span className="truncate" style={{ fontFamily: `"${font.family}", sans-serif` }}>
                  {font.family}
                </span>
                <span className="shrink-0 text-[8px] uppercase text-slate-500">{font.category}</span>
              </button>
            ))}
            {!results.length ? <p className="px-2 py-3 text-[10px] text-slate-500">Nenhuma fonte com esse termo.</p> : null}
            <p className="px-2 py-2 text-[9px] leading-relaxed text-slate-600">
              {loadingCatalog ? 'Carregando catálogo completo do Google Fonts…' : `${results.length} fontes livres (licença OFL) — uso comercial sem marca d'água`}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Botão "usar esta fonte" usado pela biblioteca (assets do tipo `font:`). */
export async function useFontAsset(url: string) {
  const family = url.replace('font:', '').trim();
  if (!family) return '';
  await ensureGoogleFont(family);
  return family;
}

export function FontLoadingBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
      <Loader2 className="h-2.5 w-2.5 animate-spin" /> carregando do CDN
    </span>
  );
}
