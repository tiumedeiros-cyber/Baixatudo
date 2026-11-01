'use client';
import { useEffect, useRef, useState } from 'react';
import { Bot, Film, Loader2, Play, Save, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { AVATARS } from '@/lib/catalog/avatars';
import { cn } from '@/lib/utils';

type Job = { id: string; status: string; resultUrl?: string; error?: string };

const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila do provedor…',
  processing: 'Gerando o vídeo (pode levar alguns minutos)…',
  done: 'Vídeo pronto!',
  saved: 'Salvo na sua biblioteca',
  failed: 'Falhou',
};

export function MotionStudio({ configured }: { configured: { kie: boolean; postiz: boolean } }) {
  const [preset, setPreset] = useState(AVATARS[0]?.id ?? 'theo');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'720p' | '1080p'>('720p');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [caption, setCaption] = useState('Feito com IA no Editor Studio 🤖✨');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const chosen = AVATARS.find((a) => a.id === preset);
  function resolveImage() {
    if (imageUrl.trim()) return imageUrl.trim();
    if (!chosen?.photo) return '';
    return `${window.location.origin}${chosen.photo.base}`;
  }

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function call(payload: Record<string, unknown>) {
    const res = await fetch('/api/motion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  function poll(id: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const data = await call({ action: 'poll', id });
      const status = String(data.status ?? 'processing');
      const resultUrl = typeof data.resultUrl === 'string' ? data.resultUrl : undefined;
      setJob({ id, status, resultUrl, error: typeof data.error === 'string' ? data.error : undefined });
      if (status === 'done' || status === 'failed') {
        if (timer.current) clearInterval(timer.current);
      }
    }, 6000);
  }

  async function generate() {
    setError('');
    setNote('');
    setJob(null);
    if (!videoUrl.trim()) {
      setError('Cole a URL do vídeo de referência (o movimento que o personagem deve imitar).');
      return;
    }
    if (!resolveImage()) {
      setError('Escolha um personagem ou informe a URL de uma imagem.');
      return;
    }
    setBusy(true);
    try {
      const data = await call({ action: 'create', imageUrl: resolveImage(), videoUrl: videoUrl.trim(), prompt, mode });
      if (data.error) {
        setError(String(data.error));
        return;
      }
      const id = String(data.id);
      setJob({ id, status: 'processing' });
      poll(id);
    } finally {
      setBusy(false);
    }
  }

  async function saveToLibrary() {
    if (!job) return;
    setBusy(true);
    setNote('');
    try {
      const data = await call({ action: 'save', id: job.id });
      if (data.error) setError(String(data.error));
      else {
        setNote('Vídeo salvo em Meus arquivos — já dá para arrastar na timeline.');
        setJob({ ...job, status: 'saved' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!job) return;
    setBusy(true);
    setNote('');
    try {
      const data = await call({ action: 'publish', id: job.id, caption });
      if (data.error) setError(String(data.error));
      else setNote('Enviado para a Postiz — o TikTok publica na sequência.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Film className="h-4 w-4 text-brand-300" /> Personagem + movimento
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          O modelo anima a imagem do personagem seguindo o corpo e a expressão do vídeo de referência (Kling 2.6 Motion
          Control). Use uma imagem com o personagem de frente, de preferência de meio corpo.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setPreset(a.id);
                setImageUrl('');
              }}
              className={cn(
                'overflow-hidden rounded-lg border text-[10px] transition',
                preset === a.id && !imageUrl ? 'border-brand-400 ring-2 ring-brand-500/30' : 'border-white/10 hover:border-brand-400/50',
              )}
              title={a.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.photo?.base} alt={a.name} className="aspect-square w-full object-cover" />
              <span className="block truncate px-1 py-0.5 text-slate-300">{a.name}</span>
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ou uma imagem sua (URL pública)</span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…/personagem.png"
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vídeo de referência (movimento)</span>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…/movimento.mp4"
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_130px]">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Instrução (opcional)</span>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: sorria no começo e aponte para a câmera no final"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Qualidade</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as '720p' | '1080p')}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-2 text-xs text-white outline-none focus:border-brand-400/60"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
        </div>

        {!configured.kie ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Falta a chave da Kie AI. O admin cola em <strong>Admin → Configurações → Integrações</strong> (ou define a variável
            <code className="mx-1">KIE_API_KEY</code>).
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">{error}</p>
        ) : null}
        {note ? (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">{note}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={generate} disabled={busy || !configured.kie}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar vídeo
          </Button>
          {job ? <span className="self-center text-[11px] text-slate-400">{STATUS_LABEL[job.status] ?? job.status}</span> : null}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Play className="h-4 w-4 text-emerald-300" /> Resultado
        </h3>
        {job?.resultUrl ? (
          <>
            <video src={job.resultUrl} controls playsInline className="mt-3 w-full rounded-xl border border-white/10 bg-black" />
            <label className="mt-3 block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Legenda do post</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="mt-1 min-h-[64px] w-full resize-y rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-xs text-white outline-none focus:border-brand-400/60"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={saveToLibrary} disabled={busy}>
                <Save className="h-4 w-4" /> Salvar na biblioteca
              </Button>
              <Button variant="secondary" onClick={publish} disabled={busy || !configured.postiz}>
                <Send className="h-4 w-4" /> Publicar no TikTok
              </Button>
            </div>
            {!configured.postiz ? (
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Para publicar direto: cole a API key da Postiz e o Integration ID do TikTok em Admin → Configurações →
                Integrações.
              </p>
            ) : null}
          </>
        ) : (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 p-8 text-center">
            <Bot className="h-7 w-7 text-slate-600" />
            <p className="text-xs text-slate-500">
              O vídeo animado aparece aqui. Normalmente leva de 1 a 5 minutos — pode deixar esta aba aberta.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
