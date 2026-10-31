'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowDownToLine, Check, Download, Loader2, Music4, Plus, Sparkles, Video } from 'lucide-react';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type Item = { url: string; type: string; name: string; downloadUrl: string; thumb?: string };
type Result = { id?: string; status: string; filename?: string; service?: string | null; items: Item[] };

export function DownloaderClient({ userId }: { userId: string }) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [quality, setQuality] = useState('1080');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSaved([]);
    setLoading(true);
    try {
      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), audio: mode === 'audio', quality }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no download');
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function saveToLibrary(item: Item, index: number) {
    setSavingIdx(index);
    setError(null);
    try {
      const blob = await (await fetch(item.downloadUrl)).blob();
      if (blob.size > 300 * 1024 * 1024) throw new Error('Arquivo maior que 300 MB. Baixe localmente e envie em "Meus arquivos".');
      const supabase = createClient();
      const ext = item.type === 'audio' ? 'mp3' : item.type === 'photo' ? 'jpg' : item.type === 'gif' ? 'gif' : 'mp4';
      const clean = item.name.replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'arquivo';
      const path = `${userId}/downloads/${Date.now()}-${clean}.${ext}`;
      const { error: upErr } = await supabase.storage.from('media').upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
      const type = item.type === 'audio' ? 'audio' : item.type === 'photo' || item.type === 'gif' ? 'image' : 'video';
      const { error: insErr } = await supabase.from('es_user_assets').insert({
        user_id: userId,
        name: item.name,
        type,
        url: pub.publicUrl,
        storage_path: path,
        size_bytes: blob.size,
        metadata: {},
      });
      if (insErr) throw insErr;
      setSaved((s) => [...s, index]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar na biblioteca');
    } finally {
      setSavingIdx(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Cole o link do vídeo, foto ou áudio" hint="YouTube, TikTok, Instagram, X, Facebook, Reddit, Pinterest, Vimeo, SoundCloud, Threads e mais.">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              inputMode="url"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="flex rounded-xl border border-white/10 bg-ink-900/60 p-1">
              {[
                { v: 'video', label: 'Vídeo', icon: Video },
                { v: 'audio', label: 'Só áudio', icon: Music4 },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setMode(opt.v as 'video' | 'audio')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    mode === opt.v ? 'bg-brand-500/25 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                </button>
              ))}
            </div>
            <Select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={mode === 'audio'}>
              <option value="2160">4K · 2160p</option>
              <option value="1440">2K · 1440p</option>
              <option value="1080">Full HD · 1080p</option>
              <option value="720">HD · 720p</option>
              <option value="480">SD · 480p</option>
            </Select>
            <Button type="submit" disabled={loading} className="sm:w-36">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar
            </Button>
          </div>
        </form>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        ) : null}
      </Card>

      {loading ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
          Consultando o motor e preparando o arquivo… isso pode levar até 30 segundos em vídeos longos.
        </Card>
      ) : null}

      {result ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              {result.items.length} arquivo(s) encontrado(s)
            </h3>
            {result.service ? <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">{result.service}</span> : null}
            <span className="text-xs text-slate-500">{result.filename}</span>
          </div>
          <ul className="mt-4 space-y-2">
            {result.items.map((item, i) => (
              <li key={`${item.url}-${i}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb} alt="" className="h-10 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-10 w-16 place-items-center rounded-lg bg-gradient-to-br from-brand-500/30 to-ink-800 text-[10px] uppercase text-slate-400">
                    {item.type}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{item.name}</p>
                  <p className="text-[11px] text-slate-500">Tipo: {item.type}</p>
                </div>
                <a
                  href={item.downloadUrl}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-3 text-xs font-semibold text-white"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" /> Baixar
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={() => saveToLibrary(item, i)}
                  disabled={savingIdx === i || saved.includes(i)}
                >
                  {savingIdx === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved.includes(i) ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Plus className="h-3.5 w-3.5" />}
                  {saved.includes(i) ? 'Na biblioteca' : 'Biblioteca'}
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">
            “Biblioteca” salva o arquivo na sua conta para arrastar direto na timeline do editor.
          </p>
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-amber-300" /> Extensão oficial
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          Prefere baixar direto do site do vídeo com um clique? Instale a extensão Baixa Tudo no Chrome ou Edge — ela usa
          o mesmo motor desta central.
        </p>
        <a
          href="/baixa-tudo-extensao.zip"
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" /> baixa-tudo-extensao.zip
        </a>
      </Card>
    </div>
  );
}
