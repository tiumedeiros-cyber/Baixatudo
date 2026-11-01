'use client';

/**
 * LibraryStock — aba "Bancos" dentro da biblioteca do editor.
 *
 * Busca em Pexels / Unsplash / Pixabay / Freesound (APIs públicas, chave grátis)
 * e devolve o arquivo para a timeline via `onPick`. Todo item é royalty-free.
 *
 * Componente isolado: não conhece a timeline nem o store — só entrega o item.
 */

import { useCallback, useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Loader2, Music4, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { StockItem, StockKind } from '@/lib/fetchers/types';
import { cn } from '@/lib/utils';

const SOURCES: { id: StockItem['source']; label: string; kinds: StockKind[] }[] = [
  { id: 'pexels', label: 'Pexels', kinds: ['video', 'photo'] },
  { id: 'unsplash', label: 'Unsplash', kinds: ['photo'] },
  { id: 'pixabay', label: 'Pixabay', kinds: ['video', 'photo', 'audio'] },
  { id: 'freesound', label: 'Freesound', kinds: ['audio'] },
];

const TABS: { id: StockKind; label: string; icon: typeof Film }[] = [
  { id: 'video', label: 'Vídeos B-Roll', icon: Film },
  { id: 'photo', label: 'Fotos 4K', icon: ImageIcon },
  { id: 'audio', label: 'Sons/trilhas', icon: Music4 },
];

export function LibraryStock({ onPick }: { onPick: (item: StockItem) => void | Promise<void> }) {
  const [tab, setTab] = useState<StockKind>('video');
  const [source, setSource] = useState<StockItem['source']>('pexels');
  const [query, setQuery] = useState('aesthetic background');
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needKey, setNeedKey] = useState<{ provider: string; signup: string } | null>(null);
  const [picking, setPicking] = useState('');

  const supports = SOURCES.find((item) => item.id === source)?.kinds ?? [];

  useEffect(() => {
    if (!supports.includes(tab)) {
      const fallback = SOURCES.find((item) => item.kinds.includes(tab));
      if (fallback) setSource(fallback.id);
    }
  }, [tab, supports]);

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    setNeedKey(null);
    try {
      const res = await fetch(
        `/api/stock?source=${source}&kind=${tab}&q=${encodeURIComponent(query || 'background')}&page=1`,
        { cache: 'no-store' },
      );
      const data = (await res.json()) as
        | { ok: true; items: StockItem[] }
        | { ok: false; needKey?: boolean; provider?: string; signup?: string; error?: string };
      if (!data.ok) {
        if ('needKey' in data && data.needKey) {
          setNeedKey({ provider: data.provider ?? source, signup: data.signup ?? '' });
        } else {
          setError('error' in data && data.error ? data.error : 'Não foi possível buscar agora.');
        }
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
      if (!data.items?.length) setError('Nada encontrado com esse termo. Tente outras palavras.');
    } catch {
      setError('Falha de rede ao buscar os bancos gratuitos.');
    } finally {
      setLoading(false);
    }
  }, [source, tab, query]);

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, tab]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-1 text-[9px] text-emerald-200">
        <ShieldCheck className="h-2.5 w-2.5" /> Royalty-free · uso comercial livre (Pexels, Unsplash, Pixabay, Freesound)
      </div>

      <div className="flex gap-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[9px] font-semibold transition',
              tab === item.id ? 'border-brand-400/60 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400',
            )}
          >
            <item.icon className="h-3 w-3" /> {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          placeholder="buscar (ex.: cidade à noite, impacto, praia)"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-slate-500"
        />
        <button
          onClick={() => void search()}
          className="grid w-8 place-items-center rounded-lg bg-brand-500 text-white hover:bg-brand-400"
          aria-label="Buscar"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {SOURCES.map((item) => (
          <button
            key={item.id}
            onClick={() => setSource(item.id)}
            disabled={!item.kinds.includes(tab)}
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition disabled:opacity-30',
              source === item.id ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {needKey ? (
        <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[9px] leading-relaxed text-amber-100">
          <p className="font-semibold">Chave grátis necessária para {needKey.provider}</p>
          <p className="mt-0.5">Crie a sua (leva 1 minuto) e cole em Recursos → Bancos, ou peça ao admin para liberar a chave da plataforma.</p>
          {needKey.signup ? (
            <a href={needKey.signup} target="_blank" rel="noreferrer" className="mt-1 inline-block rounded bg-amber-400 px-2 py-1 text-[9px] font-bold text-amber-950">
              Pegar chave grátis
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] text-slate-400">
          <TriangleAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => (
          <button
            key={`${item.source}-${item.id}`}
            onClick={async () => {
              setPicking(item.id);
              try {
                await onPick(item);
              } finally {
                setPicking('');
              }
            }}
            className="group overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left transition hover:border-brand-400/50"
          >
            <span className="relative block aspect-video w-full overflow-hidden bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {item.thumb ? (
                <img src={item.thumb} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-white/5 text-slate-500">
                  <Music4 className="h-4 w-4" />
                </span>
              )}
              {picking === item.id ? (
                <span className="absolute inset-0 grid place-items-center bg-black/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                </span>
              ) : null}
            </span>
            <span className="block truncate px-1.5 py-1 text-[9px] text-slate-300">{item.title || item.kind}</span>
            <span className="block px-1.5 pb-1 text-[8px] uppercase tracking-wide text-slate-500">
              {item.source} · {item.license ?? 'royalty-free'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
