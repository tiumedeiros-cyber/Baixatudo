'use client';

/**
 * StockBrowser — aba de "Vídeos B-Roll e Fotos Profissionais" + "Efeitos
 * sonoros e trilhas" usando as APIs gratuitas (Pexels, Unsplash, Pixabay,
 * Freesound). Componente isolado: não mexe na timeline, só salva o arquivo em
 * "Meus arquivos" (e ele aparece na biblioteca do editor).
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, Film, Image as ImageIcon, KeyRound, Loader2, Music4, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type StockItem = {
  id: string;
  source: string;
  kind: 'video' | 'photo' | 'audio';
  title: string;
  thumb: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  author?: string;
  page?: string;
  license?: string;
};

type NeedKey = { needKey: true; provider: string; signup: string };

type StockTab = 'video' | 'photo' | 'audio';
type SourceId = 'pexels' | 'unsplash' | 'pixabay' | 'freesound';

const SOURCES: { id: SourceId; label: string; kinds: StockTab[] }[] = [
  { id: 'pexels', label: 'Pexels', kinds: ['video', 'photo'] },
  { id: 'unsplash', label: 'Unsplash', kinds: ['photo'] },
  { id: 'pixabay', label: 'Pixabay', kinds: ['video', 'photo', 'audio'] },
  { id: 'freesound', label: 'Freesound', kinds: ['audio'] },
];

const TABS = [
  { id: 'video', label: 'Vídeos B-Roll', icon: Film },
  { id: 'photo', label: 'Fotos 4K/HD', icon: ImageIcon },
  { id: 'audio', label: 'Sons e trilhas', icon: Music4 },
] as const;

export function StockBrowser({ onSaved }: { onSaved?: () => void }) {
  const [tab, setTab] = useState<StockTab>('video');
  const [source, setSource] = useState<SourceId>('pexels');
  const [query, setQuery] = useState('aesthetic background');
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needKey, setNeedKey] = useState<NeedKey | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [savingId, setSavingId] = useState('');

  const supports = SOURCES.find((item) => item.id === source)?.kinds ?? [];

  // troca de aba escolhe uma fonte que atende aquele tipo
  useEffect(() => {
    if (!supports.includes(tab)) {
      const fallback = SOURCES.find((item) => item.kinds.includes(tab));
      if (fallback) setSource(fallback.id);
    }
  }, [tab, supports]);

  const search = useCallback(async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError('');
    setNeedKey(null);
    try {
      const res = await fetch(`/api/stock?source=${source}&kind=${tab}&q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as
        | { ok: true; items: StockItem[] }
        | { ok: false; error?: string; needKey?: boolean; provider?: string; signup?: string };
      if (data.ok) {
        setItems(data.items ?? []);
        if (!data.items?.length) setError('Nada encontrado com esse termo — tente outro.');
      } else if ('needKey' in data && data.needKey) {
        setNeedKey({ needKey: true, provider: data.provider ?? source, signup: data.signup ?? '' });
        setItems([]);
      } else {
        setError(('error' in data && data.error) || 'Falha na busca.');
        setItems([]);
      }
    } catch {
      setError('Não foi possível falar com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [query, source, tab]);

  async function saveKey() {
    setError('');
    const res = await fetch('/api/stock/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: needKey?.provider ?? source, key: keyDraft }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? 'Não foi possível salvar a chave.');
      return;
    }
    setKeyDraft('');
    setNeedKey(null);
    void search();
  }

  async function save(item: StockItem) {
    setSavingId(item.id);
    setError('');
    try {
      const res = await fetch('/api/stock/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, name: item.title, kind: item.kind }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Falha ao salvar o arquivo.');
        return;
      }
      onSaved?.();
    } catch {
      setError('Falha ao salvar o arquivo.');
    } finally {
      setSavingId('');
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-300" />
        <h2 className="text-sm font-semibold text-white">Vídeos, fotos e sons profissionais</h2>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-300">
          APIs gratuitas
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition',
              tab === item.id
                ? 'border-brand-400/60 bg-brand-500/15 text-brand-100'
                : 'border-white/10 text-slate-300 hover:border-white/25',
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={source}
          onChange={(event) => setSource(event.target.value as SourceId)}
          className="rounded-lg border border-white/10 bg-ink-950 px-2 py-2 text-[11px] text-slate-200 outline-none"
        >
          {SOURCES.filter((item) => item.kinds.includes(tab)).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void search();
            }}
            placeholder="ex.: skyline night, product table, whoosh"
            className="w-full rounded-lg border border-white/10 bg-ink-950 py-2 pl-7 pr-2 text-[11px] text-white outline-none placeholder:text-slate-500 focus:border-brand-400/60"
          />
        </div>
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="rounded-lg bg-brand-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-brand-400 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
        </button>
      </div>

      {needKey ? (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
          <p className="flex items-start gap-2 text-[11px] text-amber-100">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              O {needKey.provider} é gratuito, mas pede uma chave pessoal (sem cobrança) para liberar as buscas.{' '}
              <a href={needKey.signup} target="_blank" rel="noreferrer" className="underline">
                Pegar minha chave grátis
              </a>
              . Ela fica salva só na sua conta.
            </span>
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="cole a chave aqui"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-[11px] text-white outline-none focus:border-amber-300/60"
            />
            <button
              type="button"
              onClick={() => void saveKey()}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-slate-900"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-rose-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {items.length ? (
        <div className="mt-3 grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group overflow-hidden rounded-xl border border-white/10 bg-ink-950">
              <div className="relative aspect-video bg-black/40">
                {item.kind === 'audio' ? (
                  <div className="flex h-full items-center justify-center">
                    {item.thumb ? (
                      <img src={item.thumb} alt={item.title} className="h-full w-full object-contain opacity-80" loading="lazy" />
                    ) : (
                      <Music4 className="h-6 w-6 text-slate-500" />
                    )}
                  </div>
                ) : (
                  <img src={item.thumb} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold uppercase text-slate-200">
                  {item.source}
                </span>
                {item.duration ? (
                  <span className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[8px] text-slate-200">
                    {Math.round(item.duration)}s
                  </span>
                ) : null}
              </div>
              <div className="space-y-1 p-1.5">
                <p className="truncate text-[10px] text-slate-300" title={item.title}>
                  {item.title}
                </p>
                <button
                  type="button"
                  onClick={() => void save(item)}
                  disabled={savingId === item.id}
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-white/10 py-1 text-[10px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
                >
                  {savingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Salvar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Tudo sem marca d&apos;água e liberado para uso comercial pelas próprias fontes. O arquivo baixado entra em{' '}
        <strong className="text-slate-300">Meus arquivos</strong> e na biblioteca do editor.
      </p>
    </div>
  );
}
