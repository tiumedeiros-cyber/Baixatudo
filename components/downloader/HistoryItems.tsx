'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Music4, Save, Video } from 'lucide-react';

type Item = { url: string; filename?: string; type?: string; quality?: string; size?: number };

/**
 * Histórico do Baixa Tudo: lista os arquivos de um download antigo para o
 * usuário escolher qual quer guardar em Meus arquivos (e usar no editor).
 */
export function HistoryItems({ id, items }: { id: string; items: Item[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [error, setError] = useState('');

  async function save(index: number) {
    setSaving(index);
    setError('');
    try {
      const res = await fetch('/api/downloads/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, index }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Falha ao salvar');
      setSaved((s) => (s.includes(index) ? s : [...s, index]));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(null);
    }
  }

  if (!items.length) return null;

  return (
    <details className="mt-1 w-full">
      <summary className="cursor-pointer list-none text-[10px] font-semibold text-brand-300 hover:text-brand-200">
        escolher arquivo para salvar em Meus arquivos ({items.length})
      </summary>
      <ul className="mt-1.5 space-y-1">
        {items.map((item, index) => {
          const isAudio = (item.type ?? '').includes('audio') || /\.(mp3|m4a|wav|opus|ogg)$/i.test(item.filename ?? item.url);
          const done = saved.includes(index);
          return (
            <li
              key={`${item.url}-${index}`}
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5"
            >
              {isAudio ? <Music4 className="h-3 w-3 shrink-0 text-cyan-300" /> : <Video className="h-3 w-3 shrink-0 text-brand-300" />}
              <span className="min-w-0 flex-1 break-all text-[10px] leading-snug text-slate-300">
                {item.filename ?? item.url.split('/').pop() ?? `arquivo ${index + 1}`}
                {item.quality ? <span className="text-slate-500"> · {item.quality}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => void save(index)}
                disabled={saving !== null || done}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-500/20 px-2 py-1 text-[10px] font-semibold text-brand-100 hover:bg-brand-500/30 disabled:opacity-60"
              >
                {done ? <Check className="h-3 w-3" /> : saving === index ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {done ? 'salvo' : 'salvar'}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-1 break-words text-[10px] text-rose-300">{error}</p> : null}
    </details>
  );
}
