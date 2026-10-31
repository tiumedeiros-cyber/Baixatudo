'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileCode2, Film, Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { Clip } from '@/lib/types';
import { useStudio } from './store';
import { drawFrame } from './render';
import { media } from './media';
import { threePool } from './three';
import { audioEngine } from './audio';
import { cn } from '@/lib/utils';
import { buildProjectJson, buildXmeml, downloadText } from '@/lib/timeline-io';

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

/** Posiciona todos os vídeos visíveis no instante pedido (necessário para render quadro a quadro). */
async function seekVideosAt(clips: Clip[], time: number) {
  const jobs: Promise<void>[] = [];
  for (const clip of clips) {
    if (clip.kind !== 'video') continue;
    if (time < clip.start - 0.001 || time > clip.start + clip.duration + 0.001) continue;
    const el = media.getVideo(clip.src);
    const target = Math.max(0, clip.trimStart + (time - clip.start) * clip.speed);
    if (el.readyState < 2 || Math.abs(el.currentTime - target) < 0.03) continue;
    jobs.push(
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          el.removeEventListener('seeked', finish);
          resolve();
        };
        el.addEventListener('seeked', finish);
        window.setTimeout(finish, 500);
        try {
          el.currentTime = target;
        } catch {
          finish();
        }
      }),
    );
  }
  await Promise.all(jobs);
}

const GIF_FPS = 12;
const GIF_MAX_WIDTH = 480;

const FORMATS: { value: 'mp4' | 'mov' | 'webm' | 'gif'; hint: string }[] = [
  { value: 'mp4', hint: 'H.264 (quando suportado)' },
  { value: 'mov', hint: 'QuickTime · mesmo stream H.264' },
  { value: 'webm', hint: 'VP9 + Opus' },
  { value: 'gif', hint: 'Animação 480p · sem áudio' },
];

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
  const [format, setFormat] = useState<'mp4' | 'mov' | 'webm' | 'gif'>(() => (pickMime('mp4') ? 'mp4' : 'webm'));
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
    if (format === 'gif') {
      await startGifExport();
      return;
    }
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

    const mime = pickMime(format === 'webm' ? 'webm' : 'mp4');
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

    const ext = format === 'mov' ? 'mov' : mime.includes('mp4') ? 'mp4' : 'webm';
    setResult({ url: URL.createObjectURL(blob), size: blob.size, ext });
    setPhase('done');
  }

  async function startGifExport() {
    setError(null);
    setResult(null);
    const s = useStudio.getState();
    if (s.clips.length === 0) {
      setError('Adicione ao menos um clipe na timeline antes de exportar.');
      return;
    }
    cancelRef.current = false;
    setPhase('processing');
    setProgress(0);
    audioEngine.stopExportCapture();
    useStudio.setState({ playing: false });

    const scale = Math.min(1, GIF_MAX_WIDTH / s.width);
    const width = Math.max(2, Math.round((s.width * scale) / 2) * 2);
    const height = Math.max(2, Math.round((s.height * scale) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      setError('Canvas não suportado neste navegador.');
      setPhase('idle');
      return;
    }

    try {
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
      const gif = GIFEncoder();
      const duration = Math.max(0.4, s.duration);
      const totalFrames = Math.max(1, Math.min(900, Math.ceil(duration * GIF_FPS)));
      const delay = Math.round(1000 / GIF_FPS);

      for (let i = 0; i < totalFrames; i++) {
        if (cancelRef.current) {
          setPhase('idle');
          setProgress(0);
          return;
        }
        const time = Math.min(duration - 0.001, i / GIF_FPS);
        await seekVideosAt(s.clips, time);
        drawFrame({
          ctx,
          width,
          height,
          background: s.background,
          clips: s.clips,
          tracks: s.tracks,
          time,
          media,
          three: threePool,
        });
        const { data } = ctx.getImageData(0, 0, width, height);
        const palette = quantize(data, 256);
        const index = applyPalette(data, palette);
        gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
        setProgress((i + 1) / totalFrames);
        if (i % 3 === 2) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
      setResult({ url: URL.createObjectURL(blob), size: blob.size, ext: 'gif' });
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o GIF.');
      setPhase('idle');
    }
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
          {FORMATS.map((f) => {
            const disabled = f.value === 'gif' ? false : !pickMime(f.value === 'webm' ? 'webm' : 'mp4');
            return (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                disabled={disabled}
                className={cn(
                  'rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-40',
                  format === f.value ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5',
                )}
              >
                <span className="font-bold uppercase">{f.value}</span>
                <span className="block text-[10px] text-slate-500">{f.hint}</span>
              </button>
            );
          })}
        </div>

        {format === 'gif' ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
            GIF animado renderizado quadro a quadro · 480p · {GIF_FPS} fps · sem áudio.
          </p>
        ) : (
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
        )}

        {phase === 'recording' || phase === 'processing' ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{phase === 'recording' ? 'Renderizando em tempo real…' : 'Gerando arquivo…'}</span>
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
              download={`${useStudio.getState().name || 'projeto'}-${result.ext === 'gif' ? '480p' : `${quality}p`}.${result.ext}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" /> Baixar arquivo
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <button onClick={startVideoExport} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2.5 text-xs font-semibold text-white">
              <Film className="h-3.5 w-3.5" /> {format === 'gif' ? 'Gerar GIF animado' : 'Renderizar vídeo'}
            </button>
            <button onClick={exportFrame} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
              <ImageIcon className="h-3.5 w-3.5" /> Exportar frame atual (PNG)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const s = useStudio.getState();
                  downloadText(
                    `${(s.name || 'projeto').replace(/[^\w-]+/g, '-')}-timeline.xml`,
                    buildXmeml({ name: s.name, fps: s.fps, width: s.width, height: s.height, tracks: s.tracks, clips: s.clips }),
                    'application/xml',
                  );
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
              >
                <FileCode2 className="h-3.5 w-3.5" /> Timeline XML
              </button>
              <button
                onClick={() => {
                  const s = useStudio.getState();
                  downloadText(
                    `${(s.name || 'projeto').replace(/[^\w-]+/g, '-')}.json`,
                    buildProjectJson({
                      name: s.name,
                      width: s.width,
                      height: s.height,
                      fps: s.fps,
                      duration: s.duration,
                      background: s.background,
                      tracks: s.tracks,
                      clips: s.clips,
                    }),
                    'application/json',
                  );
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" /> Projeto JSON
              </button>
            </div>
            {error ? <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">{error}</p> : null}
            <p className="text-[10px] leading-relaxed text-slate-500">
              {format === 'gif'
                ? 'O GIF é codificado quadro a quadro no navegador — quanto maior o projeto, mais tempo leva.'
                : 'A renderização acontece em tempo real: um vídeo de 30s leva ~30s. O áudio da timeline entra na exportação.'}
            </p>
          </div>
        )}
        {phase === 'processing' ? <Loader2 className="mx-auto mt-2 h-4 w-4 animate-spin text-brand-300" /> : null}
      </div>
    </div>
  );
}
