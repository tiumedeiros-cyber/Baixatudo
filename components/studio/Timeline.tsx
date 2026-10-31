'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Magnet,
  Plus,
  Scissors,
  Subtitles,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStudio } from './store';
import { cn, clamp, shortTime, uid } from '@/lib/utils';
import type { Clip } from '@/lib/types';

const HEADER_W = 148;
const ROW_H = 46;

type DragState =
  | { mode: 'move'; id: string; startX: number; start: number; duration: number; trimStart: number }
  | { mode: 'trim-start'; id: string; startX: number; start: number; duration: number; trimStart: number }
  | { mode: 'trim-end'; id: string; startX: number; duration: number }
  | null;

const KIND_COLORS: Record<string, string> = {
  video: 'from-indigo-500/70 to-violet-600/40 border-indigo-400/40',
  image: 'from-cyan-500/60 to-teal-600/30 border-cyan-400/40',
  text: 'from-fuchsia-500/60 to-pink-600/30 border-fuchsia-400/40',
  audio: 'from-emerald-500/60 to-teal-600/30 border-emerald-400/40',
  sfx: 'from-amber-500/60 to-orange-600/30 border-amber-400/40',
  music: 'from-lime-500/55 to-green-600/25 border-lime-400/40',
  object3d: 'from-purple-500/60 to-indigo-600/30 border-purple-400/40',
  overlay: 'from-slate-500/50 to-slate-700/30 border-slate-400/30',
  sticker: 'from-rose-500/55 to-red-600/25 border-rose-400/40',
  generator: 'from-sky-500/60 to-blue-600/30 border-sky-400/40',
};

export function Timeline() {
  const tracks = useStudio((s) => s.tracks);
  const clips = useStudio((s) => s.clips);
  const duration = useStudio((s) => s.duration);
  const zoom = useStudio((s) => s.zoom);
  const playhead = useStudio((s) => s.playhead);
  const selectedId = useStudio((s) => s.selectedId);
  const snapEnabled = useStudio((s) => s.snap);
  const fps = useStudio((s) => s.fps);
  const dragRef = useRef<DragState>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ trackId: string; t: number } | null>(null);

  const pxPerSec = zoom;
  const totalWidth = Math.max(duration * pxPerSec + 240, 900);

  const snapTime = useCallback(
    (value: number, excludeId?: string) => {
      if (!snapEnabled) return value;
      const tolerance = 9 / pxPerSec;
      const candidates: number[] = [0, playhead];
      clips.forEach((c) => {
        if (c.id === excludeId) return;
        candidates.push(c.start, c.start + c.duration);
      });
      let best = value;
      let bestDist = tolerance;
      for (const c of candidates) {
        const d = Math.abs(c - value);
        if (d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      return best;
    },
    [clips, playhead, pxPerSec, snapEnabled],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      useStudio.getState().setZoom(useStudio.getState().zoom * (e.deltaY > 0 ? 0.92 : 1.08));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function seekFromEvent(e: React.PointerEvent | React.MouseEvent) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    useStudio.getState().setPlayhead(clamp(x / pxPerSec, 0, duration));
  }

  function startDrag(e: React.PointerEvent, clip: Clip, mode: 'move' | 'trim-start' | 'trim-end') {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    useStudio.getState().select(clip.id);
    useStudio.getState().pushHistory();
    dragRef.current = {
      mode,
      id: clip.id,
      startX: e.clientX,
      start: clip.start,
      duration: clip.duration,
      trimStart: clip.trimStart,
    } as DragState;
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dt = (e.clientX - drag.startX) / pxPerSec;
      useStudio.setState((s) => ({
        clips: s.clips.map((c) => {
          if (c.id !== drag.id) return c;
          if (drag.mode === 'move') {
            const start = Math.max(0, snapTime(drag.start + dt, c.id));
            return { ...c, start: Math.round(start * fps) / fps };
          }
          if (drag.mode === 'trim-start') {
            const maxDelta = drag.duration - 0.15;
            const delta = clamp(dt, -drag.trimStart, maxDelta);
            const start = Math.max(0, drag.start + delta);
            return {
              ...c,
              start: Math.round(start * fps) / fps,
              duration: Math.round((drag.duration - (start - drag.start)) * fps) / fps,
              trimStart: Math.max(0, drag.trimStart + (start - drag.start)),
            };
          }
          const nextDuration = clamp(drag.duration + dt, 0.15, 3600);
          return { ...c, duration: Math.round(nextDuration * fps) / fps };
        }),
        dirty: true,
      }));
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag) {
        const s = useStudio.getState();
        const max = s.clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
        if (max > s.duration) useStudio.setState({ duration: Math.ceil(max + 2) });
      }
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pxPerSec, fps, snapTime]);

  const rulerStep = pxPerSec > 120 ? 0.5 : pxPerSec > 60 ? 1 : pxPerSec > 28 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= totalWidth / pxPerSec; t += rulerStep) ticks.push(Number(t.toFixed(2)));

  function handleDrop(e: React.DragEvent, trackId: string) {
    e.preventDefault();
    setMarquee(null);
    // Safari só entrega text/plain; Chrome/Firefox/Edge entregam o tipo próprio.
    const raw = e.dataTransfer.getData('application/x-studio-clip') || e.dataTransfer.getData('text/plain');
    if (!raw) return;
    let payload: Partial<Clip> & { kind: Clip['kind']; src: string; duration?: number };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload?.kind) return;
    const rect = scrollRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
    const start = Math.max(0, snapTime(x / pxPerSec));
    useStudio.getState().addClip({ ...payload, trackId, start, duration: payload.duration ?? 5 } as never);
  }

  const timelineDuration = useStudio((s) => s.duration);
  const setDuration = useStudio((s) => s.setDuration);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-ink-900/60">
      <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 px-2 py-1.5 sm:gap-2">
        <button
          onClick={() => useStudio.getState().splitAtPlayhead()}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
          title="Dividir clipe no playhead (S)"
        >
          <Scissors className="h-3.5 w-3.5" /> Dividir
        </button>
        <button
          onClick={() => {
            const s = useStudio.getState();
            if (s.selectedId) s.removeClip(s.selectedId);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
          title="Excluir clipe (Del)"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </button>
        <button
          onClick={() => useStudio.getState().addTrack('visual')}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" /> Camada
        </button>
        <button
          onClick={() => useStudio.getState().addTrack('audio')}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" /> Áudio
        </button>
        <button
          onClick={() => useStudio.getState().setSnap(!snapEnabled)}
          className={cn(
            'ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition',
            snapEnabled ? 'bg-brand-500/20 text-brand-200' : 'text-slate-400 hover:bg-white/10',
          )}
          title="Ajuste magnético"
        >
          <Magnet className="h-3.5 w-3.5" /> Snap
        </button>
        <div className="flex items-center gap-1 rounded-lg border border-white/10 px-1">
          <button onClick={() => useStudio.getState().setZoom(zoom * 0.85)} className="p-1 text-slate-400 hover:text-white">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={12}
            max={300}
            value={zoom}
            onChange={(e) => useStudio.getState().setZoom(Number(e.target.value))}
            className="h-1 w-20 accent-brand-500"
          />
          <button onClick={() => useStudio.getState().setZoom(zoom * 1.15)} className="p-1 text-slate-400 hover:text-white">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto">
        <div style={{ width: totalWidth + HEADER_W }} className="relative">
          {/* régua */}
          <div className="sticky top-0 z-20 flex h-8 border-b border-white/8 bg-ink-900/95 backdrop-blur">
            <div className="sticky left-0 z-30 flex w-[92px] shrink-0 items-center gap-1 border-r border-white/8 bg-ink-900/95 px-2 font-mono text-[9px] uppercase tracking-wider text-slate-500 sm:w-[148px] sm:text-[10px]">
              <Subtitles className="h-3 w-3" /> régua
            </div>
            <div
              className="relative flex-1 cursor-pointer select-none"
              onPointerDown={(e) => {
                seekFromEvent(e);
                const move = (ev: PointerEvent) => {
                  const el = scrollRef.current!;
                  const rect = el.getBoundingClientRect();
                  const x = ev.clientX - rect.left + el.scrollLeft;
                  useStudio.getState().setPlayhead(clamp(x / pxPerSec, 0, timelineDuration));
                };
                const up = () => {
                  window.removeEventListener('pointermove', move);
                  window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-white/10" style={{ left: t * pxPerSec }}>
                  <span className="absolute left-1 top-1.5 font-mono text-[9px] text-slate-500">{shortTime(t)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* trilhas */}
          {tracks.map((track) => (
            <div key={track.id} className="flex border-b border-white/5" style={{ height: ROW_H }}>
              <div className="sticky left-0 z-20 flex w-[92px] shrink-0 items-center gap-0.5 border-r border-white/8 bg-ink-900/95 px-1.5 sm:w-[148px] sm:gap-1 sm:px-2">
                <GripVertical className="hidden h-3 w-3 shrink-0 text-slate-600 sm:block" />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-300 sm:text-[11px]">{track.name}</span>
                <button
                  onClick={() => useStudio.getState().updateTrack(track.id, { hidden: !track.hidden })}
                  className="rounded p-0.5 text-slate-500 hover:text-white"
                  title="Visibilidade"
                >
                  {track.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
                <button
                  onClick={() => useStudio.getState().updateTrack(track.id, { muted: !track.muted })}
                  className="rounded p-0.5 text-slate-500 hover:text-white"
                  title="Mudo"
                >
                  {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
                <button onClick={() => useStudio.getState().removeTrack(track.id)} className="hidden rounded p-0.5 text-slate-600 hover:text-rose-300 sm:block" title="Remover trilha">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              <div
                className="relative flex-1"
                style={{ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: `${pxPerSec}px 100%` }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = scrollRef.current!.getBoundingClientRect();
                  const x = e.clientX - rect.left + scrollRef.current!.scrollLeft;
                  setMarquee({ trackId: track.id, t: Math.max(0, x / pxPerSec) });
                }}
                onDragLeave={() => setMarquee(null)}
                onDrop={(e) => handleDrop(e, track.id)}
                onPointerDown={(e) => {
                  seekFromEvent(e);
                  useStudio.getState().select(null);
                }}
              >
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const selected = clip.id === selectedId;
                    const isAudio = ['audio', 'sfx', 'music'].includes(clip.kind);
                    return (
                      <div
                        key={clip.id}
                        onPointerDown={(e) => startDrag(e, clip, 'move')}
                        onDoubleClick={() => useStudio.getState().splitClip(clip.id, useStudio.getState().playhead)}
                        className={cn(
                          'group absolute top-1 flex select-none items-center overflow-hidden rounded-md border bg-gradient-to-b text-[10px] text-white shadow-sm',
                          KIND_COLORS[clip.kind] ?? 'from-slate-600/60 to-slate-800/40 border-white/20',
                          selected ? 'ring-2 ring-brand-300 ring-offset-1 ring-offset-ink-900' : '',
                        )}
                        style={{ left: clip.start * pxPerSec, width: Math.max(14, clip.duration * pxPerSec), height: ROW_H - 12, touchAction: 'none' }}
                        title={`${clip.name} · ${clip.duration.toFixed(2)}s`}
                      >
                        <div
                          onPointerDown={(e) => startDrag(e, clip, 'trim-start')}
                          className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100"
                        />
                        <div className="min-w-0 flex-1 px-2">
                          <p className="truncate font-semibold leading-tight">{clip.name}</p>
                          <p className="truncate text-[9px] text-white/60">{clip.duration.toFixed(2)}s</p>
                        </div>
                        {isAudio ? (
                          <div className="absolute inset-x-1 bottom-1 flex h-3 items-end gap-[1px] opacity-50">
                            {Array.from({ length: Math.min(40, Math.max(6, Math.floor(clip.duration * pxPerSec / 4))) }).map((_, i) => (
                              <span key={i} className="w-[2px] bg-white/70" style={{ height: `${20 + ((i * 37) % 80)}%` }} />
                            ))}
                          </div>
                        ) : null}
                        {clip.transitionIn.type !== 'none' ? (
                          <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" title={`entrada: ${clip.transitionIn.type}`} />
                        ) : null}
                        {clip.transitionOut.type !== 'none' ? (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" title={`saída: ${clip.transitionOut.type}`} />
                        ) : null}
                        {clip.keyframes.length > 0 ? (
                          <div className="absolute inset-x-0 bottom-0 h-1.5">
                            {clip.keyframes.map((k) => (
                              <span
                                key={k.id}
                                className="absolute bottom-0 h-1.5 w-1.5 rotate-45 bg-amber-300"
                                style={{ left: `${(k.t / clip.duration) * 100}%` }}
                              />
                            ))}
                          </div>
                        ) : null}
                        <div
                          onPointerDown={(e) => startDrag(e, clip, 'trim-end')}
                          className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100"
                        />
                      </div>
                    );
                  })}

                {marquee?.trackId === track.id ? (
                  <div className="pointer-events-none absolute top-0 h-full w-[2px] bg-emerald-400/80" style={{ left: marquee.t * pxPerSec }} />
                ) : null}
              </div>
            </div>
          ))}

          {/* playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: HEADER_W + playhead * pxPerSec }}>
            <div className="h-full w-px bg-rose-400" />
            <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 rounded-sm bg-rose-400" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/5 px-3 py-1.5 text-[10px] text-slate-500">
        <span>duração da timeline</span>
        <input
          type="number"
          min={5}
          max={3600}
          value={Math.round(timelineDuration)}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-16 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-center text-white outline-none"
        />
        <span>s</span>
        <span className="ml-auto flex items-center gap-1"><Lock className="h-3 w-3" /> autosave ativo</span>
      </div>
    </div>
  );
}
