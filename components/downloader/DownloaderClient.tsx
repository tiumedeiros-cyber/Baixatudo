'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowDownToLine, Check, Download, Loader2, Music4, Plus, Sparkles, Video } from 'lucide-react';
import { Button, Card, Field, Input, Select } from '@/components/ui';

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
  const [autoSaving, setAutoSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
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

      // salva automaticamente o arquivo principal na biblioteca (no servidor)
      if (data.id && data.items?.length) {
        setAutoSaving(true);
        try {
          const saveRes = await fetch('/api/downloads/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: data.id, index: 0 }),
          });
          const saveData = await saveRes.json();
          if (saveRes.ok) {
            setSaved([0]);
            setSavedUrl(saveData.url ?? null);
            router.refresh();
          } else {
            setError(saveData.error || 'O arquivo baixou, mas não foi salvo na biblioteca. Use o botão “Biblioteca”.');
          }
        } catch {
          setError('O arquivo baixou, mas não foi salvo na biblioteca. Use o botão “Biblioteca”.');
        } finally {
          setAutoSaving(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function saveToLibrary(item: Item, index: number) {
    if (!result?.id) {
      setError('O histórico deste download não está disponível. Faça o download novamente.');
      return;
    }
    setSavingIdx(index);
    setError(null);
    try {
      const res = await fetch('/api/downloads/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: result.id, index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar na biblioteca');
      setSaved((s) => (s.includes(index) ? s : [...s, index]));
      setSavedUrl(data.url ?? null);
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
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {autoSaving
              ? 'Salvando o arquivo principal na sua biblioteca…'
              : saved.length
                ? 'Arquivo salvo na sua conta — abra o editor e escolha em Elementos → Arquivos (ou em Meus arquivos).'
                : '“Biblioteca” salva o arquivo na sua conta para arrastar direto na timeline do editor.'}
          </p>
          {savedUrl ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="/dashboard/projetos"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500/20 px-3 text-[11px] font-semibold text-brand-100 hover:bg-brand-500/30"
              >
                <Video className="h-3.5 w-3.5" /> Abrir no editor
              </a>
              <a
                href="/dashboard/arquivos"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" /> Meus arquivos
              </a>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-amber-300" /> Tudo dentro do sistema
        </h3>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400">
          <li>• Não precisa instalar extensão: o downloader já vem embutido na sua conta.</li>
          <li>• Baixe vídeo, foto, GIF ou apenas o áudio (MP3) e envie direto para a biblioteca.</li>
          <li>• Os arquivos salvos aparecem no editor para arrastar na timeline.</li>
        </ul>
      </Card>
    </div>
  );
}
