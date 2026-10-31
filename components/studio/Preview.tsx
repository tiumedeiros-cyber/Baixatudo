'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useStudio } from './store';
import { drawFrame } from './render';
import { media, seekVideo } from './media';
import { audioEngine } from './audio';
import { threePool } from './three';
import { timecode, cn } from '@/lib/utils';
import type { Clip } from '@/lib/types';

function syncMedia(time: number, playing: boolean) {
  const s = useStudio.getState();
  for (const clip of s.clips) {
    const track = s.tracks.find((t) => t.id === clip.trackId);
    const muted = track?.muted || clip.muted;
    const active = time >= clip.start && time < clip.start + clip.duration;

    if (clip.kind === 'video') {
      const el = media.getVideo(clip.src);
      try {
        audioEngine.attach(el, muted ? 0 : clip.volume);
        el.muted = false;
      } catch {
        /* autoplay policies */
      }
      const target = clip.trimStart + (time - clip.start) * clip.speed;
      if (active) {
        if (playing) {
          if (el.paused) {
            el.currentTime = Math.max(0, target);
            void el.play().catch(() => undefined);
          } else if (Math.abs(el.currentTime - target) > 0.3) {
            el.currentTime = Math.max(0, target);
          }
        } else {
          if (!el.paused) el.pause();
          seekVideo(el, target);
        }
      } else if (!el.paused) {
        el.pause();
      }
    } else if (clip.kind === 'audio') {
      const el = media.getAudio(clip.src);
      try {
        audioEngine.attach(el, muted ? 0 : clip.volume);
        el.muted = false;
      } catch {
        /* noop */
      }
      const target = clip.trimStart + (time - clip.start) * clip.speed;
      if (active) {
        if (playing && el.paused) {
          el.currentTime = Math.max(0, target);
          void el.play().catch(() => undefined);
        } else if (!playing && !el.paused) {
          el.pause();
        } else if (playing && Math.abs(el.currentTime - target) > 0.35) {
          el.currentTime = Math.max(0, target);
        }
      } else if (!el.paused) {
        el.pause();
      }
    }
  }
}

function scheduleBuiltins(fromTime: number) {
  const s = useStudio.getState();
  audioEngine.stopAll();
  for (const clip of s.clips) {
    if (!['sfx', 'music'].includes(clip.kind)) continue;
    if (!clip.src.startsWith('builtin:')) continue;
    const track = s.tracks.find((t) => t.id === clip.trackId);
    if (track?.muted || clip.muted) continue;
    const end = clip.start + clip.duration;
    if (end <= fromTime) continue;
    const delay = Math.max(0, clip.start - fromTime);
    const offset = fromTime > clip.start ? fromTime - clip.start : 0;
    audioEngine.playBuiltin(clip.src, delay, clip.volume, offset);
  }
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const holdingRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number; id: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const width = useStudio((s) => s.width);
  const height = useStudio((s) => s.height);
  const playhead = useStudio((s) => s.playhead);
  const duration = useStudio((s) => s.duration);
  const playing = useStudio((s) => s.playing);
  const fps = useStudio((s) => s.fps);
  const selectedId = useStudio((s) => s.selectedId);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let wasPlaying = false;

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useStudio.getState();

      if (s.playing && !wasPlaying) {
        audioEngine.resume();
        scheduleBuiltins(s.playhead);
        wasPlaying = true;
      }
      if (!s.playing && wasPlaying) {
        audioEngine.stopAll();
        wasPlaying = false;
      }

      if (s.playing) {
        let next = s.playhead + dt;
        if (next >= s.duration) {
          next = s.duration;
          useStudio.setState({ playing: false, playhead: next });
          audioEngine.stopAll();
          wasPlaying = false;
        } else {
          useStudio.setState({ playhead: next });
        }
      }

      const time = useStudio.getState().playhead;
      syncMedia(time, useStudio.getState().playing);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawFrame({
            ctx,
            width: canvas.width,
            height: canvas.height,
            background: useStudio.getState().background,
            clips: useStudio.getState().clips,
            tracks: useStudio.getState().tracks,
            time,
            media,
            three: threePool,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      media.videos.forEach((v) => v.pause());
      audioEngine.stopAll();
    };
  }, []);

  const canvasW = Math.min(1280, width);
  const canvasH = Math.round((canvasW * height) / width);

  function togglePlay() {
    audioEngine.resume();
    const s = useStudio.getState();
    if (!s.playing && s.playhead >= s.duration - 0.05) useStudio.setState({ playhead: 0 });
    useStudio.setState({ playing: !s.playing });
  }

  function jump(delta: number) {
    const s = useStudio.getState();
    useStudio.setState({ playhead: Math.max(0, Math.min(s.duration, s.playhead + delta)) });
    if (s.playing) {
      audioEngine.stopAll();
      scheduleBuiltins(Math.max(0, s.playhead + delta));
    }
  }

  const selected = useStudio((s) => s.clips.find((c) => c.id === s.selectedId));

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!selected || ['audio', 'sfx', 'music', 'overlay'].includes(selected.kind)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    holdingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      x: selected.transform.x,
      y: selected.transform.y,
      id: selected.id,
    };
    void rect;
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const scale = width / e.currentTarget.getBoundingClientRect().width;
    let nx = drag.x + (e.clientX - drag.startX) * scale;
    let ny = drag.y + (e.clientY - drag.startY) * scale;
    if (Math.abs(nx) < 14) nx = 0;
    if (Math.abs(ny) < 14) ny = 0;
    useStudio.setState((s) => ({
      clips: s.clips.map((c) => (c.id === drag.id ? { ...c, transform: { ...c.transform, x: Math.round(nx), y: Math.round(ny) } } : c)),
      dirty: true,
    }));
  }

  function onPointerUp() {
    holdingRef.current = false;
    dragRef.current = null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-ink-950/70 p-2">
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="max-h-full max-w-full rounded-lg shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)]"
          style={{ aspectRatio: `${width} / ${height}`, cursor: selected && !['audio', 'sfx', 'music', 'overlay'].includes(selected.kind) ? 'move' : 'default', touchAction: 'none' }}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-white/80">
          {canvasW}×{canvasH}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-ink-900/70 px-3 py-2">
        <button onClick={() => useStudio.setState({ playhead: 0 })} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Início">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={() => jump(-1 / fps)} className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/10 hover:text-white">
          -1f
        </button>
        <button
          onClick={togglePlay}
          className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.9)]"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
        </button>
        <button onClick={() => jump(1 / fps)} className="rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/10 hover:text-white">
          +1f
        </button>
        <button onClick={() => useStudio.setState({ playhead: duration })} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Fim">
          <SkipForward className="h-4 w-4" />
        </button>
        <div className="ml-2 font-mono text-xs text-white">
          {timecode(playhead, fps)} <span className="text-slate-500">/ {timecode(duration, fps)}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              const next = !muted;
              setMuted(next);
              audioEngine.master!.gain.value = next ? 0 : 1;
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => wrapRef.current?.requestFullscreen?.()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {selected ? (
        <div className="hidden items-center gap-2 text-[11px] text-slate-500 md:flex">
          <span className={cn('rounded bg-brand-500/15 px-1.5 py-0.5 font-semibold text-brand-200')}>{selected.kind}</span>
          <span>{selected.name}</span>
          <span className="ml-auto">arraste no preview para posicionar · keyframes no inspetor</span>
        </div>
      ) : null}
      <SelectionHints clip={selected} />
    </div>
  );
}

function SelectionHints({ clip }: { clip?: Clip }) {
  if (!clip) return null;
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
      <span className="rounded bg-white/5 px-1.5 py-0.5">x {Math.round(clip.transform.x)}</span>
      <span className="rounded bg-white/5 px-1.5 py-0.5">y {Math.round(clip.transform.y)}</span>
      <span className="rounded bg-white/5 px-1.5 py-0.5">escala {clip.transform.scale.toFixed(2)}</span>
      <span className="rounded bg-white/5 px-1.5 py-0.5">giro {Math.round(clip.transform.rotation)}°</span>
      <span className="rounded bg-white/5 px-1.5 py-0.5">opacidade {Math.round(clip.opacity * 100)}%</span>
    </div>
  );
}
