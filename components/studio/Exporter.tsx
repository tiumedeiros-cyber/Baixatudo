'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Download, Film, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useStudio } from './store';
import { drawFrame } from './render';
import { media } from './media';
import { threePool } from './three';
import { audioEngine } from './audio';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'recording' | 'processing' | 'done' | 'error';

const QUALITIES = [
  { label: '4K · 2160p', value: 2160 },
  { label: '2K · 1440p', value: 1440 },
  { label: 'Full HD · 1080p', value: 1080 },
  { label: 'HD · 720p', value: 720 },
  { label: 'SD · 480p', value: 480 },
];

function pickMime(prefer: 'mp4' | 'webm') {
  const candidates =
    prefer === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function ExportButton({ maxQuality = 2160 }: { maxQuality?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3 text-[11px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.9)]"
      >
        <Download className="h-3.5 w-3.5" /> Exportar
      </button>
      {open ? <ExportDialog maxQuality={maxQuality} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ExportDialog({ maxQuality, onClose }: { maxQuality: number; onClose: () => void }) {
  const [format, setFormat] = useState<'mp4' | 'webm'>(() => (pickMime('mp4') ? 'mp4' : 'webm'));
  const [quality, setQuality] = useState(() => {
    const s = useStudio.getState();
    const native = Math.min(maxQuality, s.height);
    return QUALITIES.find((q) => q.value <= native)?.value ?? 720;
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; ext: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cancelRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => () => {
    cancelRef.current = true;
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    audioEngine.stopExportCapture();
  }, []);

  async function startVideoExport() {
    setError(null);
    setResult(null);
    const s = useStudio.getState();
    if (s.clips.length === 0) {
      setError('Adicione ao menos um clipe na timeline antes de exportar.');
      return;
    }
    const targetHeight = Math.min(quality, maxQuality);
    const scale = targetHeight / s.height;
    const width = Math.round((s.width * scale) / 2) * 2;
    const height = Math.round((targetHeight * 1) / 2) * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setError('Canvas não suportado neste navegador.');
      return;
    }

    const mime = pickMime(format);
    if (!mime) {
      setError('Seu navegador não suporta gravação de vídeo. Tente Chrome ou Edge.');
      return;
    }

    cancelRef.current = false;
    setPhase('recording');
    setProgress(0);

    const stream = canvas.captureStream(s.fps);
    const audioDest = audioEngine.startExportCapture();
    audioDest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

    const bitrate = Math.round(width * height * s.fps * 0.13);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }));
    });

    audioEngine.resume();
    useStudio.setState({ playhead: 0, playing: true });
    recorder.start(500);

    const draw = () => {
      const st = useStudio.getState();
      drawFrame({
        ctx,
        width,
        height,
        background: st.background,
        clips: st.clips,
        tracks: st.tracks,
        time: st.playhead,
        media,
        three: threePool,
      });
      setProgress(Math.min(1, st.playhead / st.duration));
      if (cancelRef.current || (!st.playing && st.playhead > 0)) {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    setPhase('processing');
    const blob = await finished;
    audioEngine.stopExportCapture();
    stream.getTracks().forEach((t) => t.stop());

    if (cancelRef.current) {
      setPhase('idle');
      setProgress(0);
      return;
    }

    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    setResult({ url: URL.createObjectURL(blob), size: blob.size, ext });
    setPhase('done');
  }

  function cancel() {
    cancelRef.current = true;
    useStudio.setState({ playing: false });
    audioEngine.stopExportCapture();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setPhase('idle');
    setProgress(0);
  }

  function exportFrame() {
    const s = useStudio.getState();
    const canvas = document.createElement('canvas');
    canvas.width = s.width;
    canvas.height = s.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrame({ ctx, width: s.width, height: s.height, background: s.background, clips: s.clips, tracks: s.tracks, time: s.playhead, media, three: threePool });
    canvas.toBlob((blob) => {
      if (!blob) return;
      setResult({ url: URL.createObjectURL(blob), size: blob.size, ext: 'png' });
      setPhase('done');
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={phase === 'idle' ? onClose : undefined}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-white"><Film className="h-4 w-4 text-brand-300" /> Exportar projeto</h3>
            <p className="text-[11px] text-slate-400">Renderização local no navegador — sem fila, sem upload.</p>
          </div>
          <button onClick={onClose} disabled={phase === 'recording' || phase === 'processing'} className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['mp4', 'webm'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              disabled={!pickMime(f)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-40',
                format === f ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5',
              )}
            >
              <span className="font-bold uppercase">{f}</span>
              <span className="block text-[10px] text-slate-500">{f === 'mp4' ? 'H.264 (quando suportado)' : 'VP9 + Opus'}</span>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Qualidade</span>
          <select
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-xs text-white outline-none"
          >
            {QUALITIES.map((q) => (
              <option key={q.value} value={q.value} disabled={q.value > maxQuality}>
                {q.label} {q.value > maxQuality ? '· plano superior' : ''}
              </option>
            ))}
          </select>
        </div>

        {phase === 'recording' || phase === 'processing' ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{phase === 'recording' ? 'Renderizando em tempo real…' : 'Finalizando arquivo…'}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-neon-cyan transition-all" style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Mantenha esta aba aberta e visível durante a renderização.</p>
            <button onClick={cancel} className="mt-3 w-full rounded-xl border border-rose-400/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-200">
              Cancelar exportação
            </button>
          </div>
        ) : phase === 'done' && result ? (
          <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200"><Check className="h-3.5 w-3.5" /> Pronto!</p>
            <p className="mt-0.5 text-[10px] text-emerald-100/70">{(result.size / (1024 * 1024)).toFixed(1)} MB · .{result.ext}</p>
            <a
              href={result.url}
              download={`${useStudio.getState().name || 'projeto'}-${quality}p.${result.ext}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" /> Baixar arquivo
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <button onClick={startVideoExport} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2.5 text-xs font-semibold text-white">
              <Film className="h-3.5 w-3.5" /> Renderizar vídeo
            </button>
            <button onClick={exportFrame} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
              <ImageIcon className="h-3.5 w-3.5" /> Exportar frame atual (PNG)
            </button>
            {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p> : null}
            <p className="text-[10px] leading-relaxed text-slate-500">
              A renderização acontece em tempo real: um vídeo de 30s leva ~30s. O áudio da timeline entra na exportação.
            </p>
          </div>
        )}
        {phase === 'processing' ? <Loader2 className="mx-auto mt-2 h-4 w-4 animate-spin text-brand-300" /> : null}
      </div>
    </div>
  );
}
