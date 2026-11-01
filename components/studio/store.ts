import { probeMediaDuration } from '@/lib/media-probe';
import { create } from 'zustand';
import { uid, clamp } from '@/lib/utils';
import type { Clip, ClipKind, Keyframe, TextProps, TimelineData, Track, Transform } from '@/lib/types';

export const DEFAULT_TEXT: TextProps = {
  content: 'Seu texto aqui',
  fontFamily: 'Inter',
  fontSize: 64,
  color: '#ffffff',
  weight: 800,
  align: 'center',
  shadow: true,
  stroke: 0,
  strokeColor: '#000000',
  background: 'transparent',
  letterSpacing: 0,
  lineHeight: 1.15,
  gradient: '',
  animation: 'none',
};

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 };

type Snapshot = { clips: Clip[]; tracks: Track[]; duration: number };

type StudioState = {
  projectId: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  tracks: Track[];
  clips: Clip[];
  selectedId: string | null;
  playhead: number;
  playing: boolean;
  zoom: number;
  snap: boolean;
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];

  load: (data: { id: string; name: string; width: number; height: number; fps: number; duration: number; background?: string; timeline: TimelineData }) => void;
  setName: (name: string) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  setSnap: (v: boolean) => void;
  setBackground: (c: string) => void;
  setDuration: (d: number) => void;
  select: (id: string | null) => void;

  addClip: (clip: Partial<Clip> & { kind: ClipKind; src: string; trackId: string; start: number }) => string;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  patchTransform: (id: string, patch: Partial<Transform>) => void;
  patchText: (id: string, patch: Partial<TextProps>) => void;
  patchFilters: (id: string, patch: Partial<Clip['filters']>) => void;
  removeClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  splitClip: (id: string, at: number) => void;
  splitAtPlayhead: () => void;
  /** Aplica a transição no ponto onde dois clipes se encontram (o corte). */
  applyCutTransition: (id: string, type: Clip['transitionIn']['type'], duration: number) => boolean;
  /** Extrai o áudio de um vídeo para uma trilha de áudio independente. */
  extractAudio: (id: string) => boolean;
  addKeyframe: (id: string, prop: Keyframe['prop'], value: number) => void;
  removeKeyframe: (id: string, kfId: string) => void;
  addTrack: (kind: 'visual' | 'audio', name?: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  pushHistory: () => void;
};


const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0 };
export const DEFAULT_SHADOW = { blur: 0, color: 'rgba(0,0,0,0.65)', offsetY: 0, offsetX: 0 };
export const DEFAULT_GENERATOR = { preset: 'aurora', colorA: '#4f46e5', colorB: '#22d3ee', speed: 1, intensity: 1 };

/**
 * Garante que todo clipe carregado do banco tenha a estrutura completa.
 * Projetos salvos por versões antigas (ou editados por fora) podem vir sem
 * `transform`, `filters` ou `keyframes` — o preview quebrava com isso.
 */
function normalizeClip(clip: Clip, fallbackTrackId: string): Clip {
  const c = (clip ?? {}) as Partial<Clip>;
  return {
    ...(c as Clip),
    id: c.id ?? uid('clip'),
    kind: c.kind ?? 'text',
    src: c.src ?? '',
    trackId: c.trackId ?? fallbackTrackId,
    start: Number.isFinite(Number(c.start)) ? Math.max(0, Number(c.start)) : 0,
    duration: Number.isFinite(Number(c.duration)) ? Math.max(0.1, Number(c.duration)) : 5,
    trimStart: Number(c.trimStart ?? 0),
    speed: Number(c.speed ?? 1) || 1,
    volume: Number(c.volume ?? 1),
    opacity: Number.isFinite(Number(c.opacity)) ? Number(c.opacity) : 1,
    muted: Boolean(c.muted),
    fadeIn: Number(c.fadeIn ?? 0),
    fadeOut: Number(c.fadeOut ?? 0),
    transform: { ...DEFAULT_TRANSFORM, ...(c.transform ?? {}) },
    filters: { ...DEFAULT_FILTERS, ...(c.filters ?? {}) },
    shadow: { ...DEFAULT_SHADOW, ...(c.shadow ?? {}) },
    generator: c.kind === 'generator' ? { ...DEFAULT_GENERATOR, ...(c.generator ?? {}) } : c.generator,
    transitionIn: c.transitionIn ?? { type: 'none', duration: 0.5 },
    transitionOut: c.transitionOut ?? { type: 'none', duration: 0.5 },
    keyframes: Array.isArray(c.keyframes) ? c.keyframes : [],
  } as Clip;
}

const memory = (s: StudioState): Snapshot => ({
  clips: JSON.parse(JSON.stringify(s.clips)),
  tracks: JSON.parse(JSON.stringify(s.tracks)),
  duration: s.duration,
});

const maxOf = (clips: Clip[], min = 20) =>
  clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0) || min;

export const useStudio = create<StudioState>((set, get) => ({
  projectId: '',
  name: '',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 20,
  background: '#0b0d13',
  tracks: [],
  clips: [],
  selectedId: null,
  playhead: 0,
  playing: false,
  zoom: 60,
  snap: true,
  dirty: false,
  past: [],
  future: [],

  load: (data) =>
    set({
      projectId: data.id,
      name: data.name,
      width: data.width,
      height: data.height,
      fps: data.fps,
      duration: Math.max(data.duration || 20, 5),
      background: data.background || '#0b0d13',
      tracks: data.timeline?.tracks?.length
        ? data.timeline.tracks
        : [
            { id: 'v1', name: 'Vídeo 1', kind: 'visual', muted: false, hidden: false },
            { id: 't1', name: 'Texto', kind: 'visual', muted: false, hidden: false },
            { id: 'a1', name: 'Áudio 1', kind: 'audio', muted: false, hidden: false },
          ],
      clips: (data.timeline?.clips ?? []).map((c) => normalizeClip(c, data.timeline?.tracks?.[0]?.id ?? 'v1')),
      selectedId: null,
      playhead: 0,
      past: [],
      future: [],
      dirty: false,
    }),

  setName: (name) => set({ name, dirty: true }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (v) => set({ playing: v }),
  setZoom: (z) => set({ zoom: clamp(z, 12, 400) }),
  setSnap: (v) => set({ snap: v }),
  setBackground: (c) => set({ background: c, dirty: true }),
  setDuration: (d) => set({ duration: Math.max(5, d), dirty: true }),
  select: (id) => set({ selectedId: id }),

  addClip: (input) => {
    const s = get();
    const id = uid('clip');
    const base = {
      id,
      name: input.kind,
      duration: 5,
      trimStart: 0,
      volume: 1,
      muted: false,
      opacity: 1,
      speed: 1,
      transform: { ...DEFAULT_TRANSFORM },
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0 },
      shadow: { ...DEFAULT_SHADOW },
      transitionIn: { type: 'none', duration: 0.5 },
      transitionOut: { type: 'none', duration: 0.5 },
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [],
      ...input,
      start: Math.max(0, input.start),
    } as unknown as Clip;
    const clips = [...s.clips, base];
    set({ past: [...s.past.slice(-49), memory(s)], future: [], clips, selectedId: id, duration: Math.max(s.duration, maxOf(clips)), dirty: true });

    // REDE DE SEGURANÇA (bug "vídeo pela metade"): se quem inseriu não sabia a
    // duração real (arquivo vindo do Baixa Tudo/Drive), lemos do próprio arquivo
    // e corrigimos a barra. Só cresce a barra — nunca corta o clipe que o usuário
    // já tenha aparado na mão.
    if ((base.kind === 'video' || base.kind === 'audio') && !(base as { sourceDuration?: number }).sourceDuration) {
      void probeMediaDuration(base.src, base.kind === 'audio' ? 'audio' : 'video').then((real) => {
        if (!real || !Number.isFinite(real)) return;
        const now = get().clips.find((c) => c.id === id);
        if (!now) return;
        if (now.duration >= real - 0.05) return; // já está certo (ou foi aparado assim)
        get().updateClip(id, {
          duration: Math.min(real, 600),
          sourceDuration: real,
        } as never);
      });
    }
    return id;
  },

  updateClip: (id, patch) => {
    const s = get();
    set({
      past: [...s.past.slice(-49), memory(s)],
      future: [],
      clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      dirty: true,
    });
  },

  patchTransform: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, transform: { ...c.transform, ...patch } } : c)),
      dirty: true,
    })),

  patchText: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id && c.text ? { ...c, text: { ...c.text, ...patch } } : c)),
      dirty: true,
    })),

  patchFilters: (id, patch) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, filters: { ...c.filters, ...patch } } : c)),
      dirty: true,
    })),

  removeClip: (id) => {
    const s = get();
    const clips = s.clips.filter((c) => c.id !== id);
    set({ past: [...s.past.slice(-49), memory(s)], future: [], clips, selectedId: null, dirty: true });
  },

  duplicateClip: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    const copy: Clip = { ...JSON.parse(JSON.stringify(clip)), id: uid('clip'), start: clip.start + clip.duration };
    set({ past: [...s.past.slice(-49), memory(s)], future: [], clips: [...s.clips, copy], selectedId: copy.id, dirty: true });
  },

  splitClip: (id, at) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    const rel = at - clip.start;
    if (rel <= 0.05 || rel >= clip.duration - 0.05) return;
    const left: Clip = { ...clip, duration: rel };
    const right: Clip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: uid('clip'),
      start: clip.start + rel,
      duration: clip.duration - rel,
      trimStart: clip.trimStart + rel * clip.speed,
      transitionIn: { type: 'none', duration: 0.3 },
    };
    left.transitionOut = { type: 'none', duration: 0.3 };
    set({
      past: [...s.past.slice(-49), memory(s)],
      future: [],
      clips: s.clips.flatMap((c) => (c.id === id ? [left, right] : [c])),
      selectedId: right.id,
      dirty: true,
    });
  },

  splitAtPlayhead: () => {
    const s = get();
    const t = s.playhead;
    const target = s.clips.find((c) => t > c.start + 0.05 && t < c.start + c.duration - 0.05);
    if (target) get().splitClip(target.id, t);
  },

  applyCutTransition: (id, type, duration) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return false;
    const sameTrack = s.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
    const next = sameTrack.find((c) => Math.abs(c.start - (clip.start + clip.duration)) < 0.2);
    const prev = sameTrack.find((c) => Math.abs(c.start + c.duration - clip.start) < 0.2);
    const dur = Math.max(0.1, Math.min(2, duration));
    let clips = s.clips;
    if (next) {
      clips = s.clips.map((c) =>
        c.id === clip.id
          ? { ...c, transitionOut: { type, duration: dur } }
          : c.id === next.id
            ? { ...c, transitionIn: { type, duration: dur } }
            : c,
      );
    } else if (prev) {
      clips = s.clips.map((c) =>
        c.id === clip.id
          ? { ...c, transitionIn: { type, duration: dur } }
          : c.id === prev.id
            ? { ...c, transitionOut: { type, duration: dur } }
            : c,
      );
    } else {
      // clipe isolado: aplica só na saída para não travar a ação
      clips = s.clips.map((c) => (c.id === clip.id ? { ...c, transitionOut: { type, duration: dur } } : c));
    }
    set({ past: [...s.past.slice(-49), memory(s)], future: [], clips, dirty: true });
    return true;
  },

  extractAudio: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || clip.kind !== 'video') return false;
    let audioTrack = s.tracks.find((t) => t.kind === 'audio');
    let tracks = s.tracks;
    if (!audioTrack) {
      audioTrack = {
        id: uid('tr'),
        name: `Áudio ${s.tracks.filter((t) => t.kind === 'audio').length + 1}`,
        kind: 'audio',
        muted: false,
        hidden: false,
      };
      tracks = [...s.tracks, audioTrack];
    }
    const base = clip.name?.replace(/\.[a-z0-9]{2,5}$/i, '') || 'áudio';
    const audioClip: Clip = {
      ...(JSON.parse(JSON.stringify(clip)) as Clip),
      id: uid('clip'),
      kind: 'audio',
      name: `${base} — áudio`,
      trackId: audioTrack.id,
      muted: false,
      transitionIn: { type: 'none', duration: 0.3 },
      transitionOut: { type: 'none', duration: 0.3 },
      keyframes: [],
    };
    const clips = s.clips.map((c) => (c.id === clip.id ? { ...c, muted: true } : c)).concat(audioClip);
    set({ past: [...s.past.slice(-49), memory(s)], future: [], clips, tracks, selectedId: audioClip.id, dirty: true });
    return true;
  },

  addKeyframe: (id, prop, value) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === id
          ? { ...c, keyframes: [...c.keyframes.filter((k) => !(Math.abs(k.t - s.playhead) < 0.02 && k.prop === prop)), { id: uid('kf'), t: Math.max(0, s.playhead - c.start), prop, value }].sort((a, b) => a.t - b.t) }
          : c,
      ),
      dirty: true,
    })),

  removeKeyframe: (id, kfId) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, keyframes: c.keyframes.filter((k) => k.id !== kfId) } : c)),
      dirty: true,
    })),

  addTrack: (kind, name) => {
    const s = get();
    const id = uid('tr');
    const label = name ?? (kind === 'audio' ? `Áudio ${s.tracks.filter((t) => t.kind === 'audio').length + 1}` : `Camada ${s.tracks.filter((t) => t.kind === 'visual').length + 1}`);
    set({ past: [...s.past.slice(-49), memory(s)], future: [], tracks: [...s.tracks, { id, name: label, kind, muted: false, hidden: false }], dirty: true });
  },

  updateTrack: (id, patch) => set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)), dirty: true })),

  removeTrack: (id) => {
    const s = get();
    set({
      past: [...s.past.slice(-49), memory(s)],
      future: [],
      tracks: s.tracks.filter((t) => t.id !== id),
      clips: s.clips.filter((c) => c.trackId !== id),
      dirty: true,
    });
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({
      past: s.past.slice(0, -1),
      future: [memory(s), ...s.future].slice(0, 50),
      clips: prev.clips,
      tracks: prev.tracks,
      duration: prev.duration,
      dirty: true,
    });
  },

  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({
      future: s.future.slice(1),
      past: [...s.past, memory(s)],
      clips: next.clips,
      tracks: next.tracks,
      duration: next.duration,
      dirty: true,
    });
  },

  markSaved: () => set({ dirty: false }),

  pushHistory: () => set((s) => ({ past: [...s.past.slice(-49), memory(s)], future: [] })),
}));
