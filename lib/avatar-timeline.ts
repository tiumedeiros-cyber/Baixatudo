import { avatarById } from '@/lib/catalog/avatars';
import type { Clip, TimelineData, Track } from '@/lib/types';

type Segment = { url: string; text: string; duration: number };

/** Monta a timeline do avatar falante: avatar animado + narração + legendas. */
export function buildAvatarTimeline(opts: {
  avatarId?: string | null;
  segments: Segment[];
  envelope?: number[];
}) {
  const avatar = avatarById(opts.avatarId);
  const segments = opts.segments.filter((s) => s?.url && Number(s.duration) > 0).slice(0, 40);
  const total = Math.min(600, segments.reduce((acc, s) => acc + Number(s.duration), 0));
  const envelope = Array.isArray(opts.envelope)
    ? opts.envelope.slice(0, 20_000).map((n) => Math.max(0, Math.min(1, Number(n) || 0)))
    : [];

  const tracks: Track[] = [
    { id: 'av', name: 'Avatar', kind: 'visual', muted: false, hidden: false },
    { id: 'leg', name: 'Legendas', kind: 'visual', muted: false, hidden: false },
    { id: 'nar', name: 'Narração', kind: 'audio', muted: false, hidden: false },
  ];

  const base = (over: Partial<Clip>): Clip =>
    ({
      id: `c${Math.random().toString(36).slice(2, 10)}`,
      trackId: 'av',
      kind: 'image',
      name: '',
      src: '',
      start: 0,
      duration: 5,
      trimStart: 0,
      volume: 1,
      muted: false,
      opacity: 1,
      speed: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, rotationX: 0, rotationY: 0 },
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0, hue: 0, grayscale: 0 },
      shadow: { blur: 0, color: 'rgba(0,0,0,0.65)', offsetY: 0, offsetX: 0 },
      transitionIn: { type: 'none', duration: 0.3 },
      transitionOut: { type: 'none', duration: 0.3 },
      fadeIn: 0,
      fadeOut: 0,
      keyframes: [],
      ...over,
    }) as Clip;

  const clips: Clip[] = [
    base({
      kind: 'avatar',
      name: `Avatar ${avatar.name}`,
      src: 'avatar',
      trackId: 'av',
      start: 0,
      duration: total,
      avatar: { preset: avatar.id, mouth: envelope, intensity: 1 },
    }),
  ];

  let cursor = 0;
  segments.forEach((segment, index) => {
    const duration = Math.max(0.4, Number(segment.duration));
    clips.push(
      base({
        kind: 'audio',
        name: `Narração ${index + 1}`,
        src: segment.url,
        trackId: 'nar',
        start: Number(cursor.toFixed(2)),
        duration: Number(duration.toFixed(2)),
        volume: 1,
      }),
    );
    const text = String(segment.text || '').trim();
    if (text) {
      clips.push(
        base({
          kind: 'text',
          name: `Legenda ${index + 1}`,
          src: 'text',
          trackId: 'leg',
          start: Number(cursor.toFixed(2)),
          duration: Number(Math.min(duration, 8).toFixed(2)),
          text: {
            content: text.length > 120 ? `${text.slice(0, 118)}…` : text,
            fontFamily: 'Montserrat',
            fontSize: 46,
            color: '#ffffff',
            weight: 700,
            align: 'center',
            shadow: true,
            stroke: 0,
            strokeColor: '#000000',
            background: 'rgba(0,0,0,0.45)',
            letterSpacing: 0,
            lineHeight: 1.2,
            gradient: '',
            animation: 'none',
          },
        }),
      );
    }
    cursor += duration;
  });

  const timeline: TimelineData = { tracks, clips };
  return { timeline, total, avatarId: avatar.id, duration: Math.max(5, Math.ceil(total)) };
}
