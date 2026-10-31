'use client';
import type { Clip, ClipKind, Track } from '@/lib/types';
import { uid } from '@/lib/utils';

/**
 * Importação e exportação de timelines.
 *
 * Suporta:
 * - XML de Premiere Pro / Final Cut (xmeml v4) → cortes, tempos e trilhas
 * - SRT → legendas como clipes de texto sincronizados
 * - JSON do projeto (backup/restauração)
 * - CSV simples (início;duração;nome) para planilhas de roteiro
 *
 * Na exportação geramos xmeml (leva a timeline para Premiere/FCP) e JSON.
 */

export type ParsedTimeline = {
  format: 'xmeml' | 'srt' | 'json' | 'csv';
  name: string;
  fps: number;
  duration: number;
  tracks: Track[];
  clips: Clip[];
  warnings: string[];
};

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

function extKind(path: string, isAudioTrack: boolean): ClipKind {
  if (isAudioTrack) return 'audio';
  if (IMAGE_EXT.test(path)) return 'image';
  if (AUDIO_EXT.test(path)) return 'audio';
  if (VIDEO_EXT.test(path)) return 'video';
  return 'video';
}

function fileName(path: string) {
  try {
    const clean = decodeURIComponent(path.replace(/^file:\/\/[^/]*/, '').split('?')[0]);
    return clean.split('/').filter(Boolean).pop() ?? clean;
  } catch {
    return path.split('/').pop() ?? path;
  }
}

function emptyClip(patch: Partial<Clip> & { kind: ClipKind; trackId: string }): Clip {
  return {
    id: uid('clip'),
    name: patch.name ?? 'Clipe',
    src: patch.src ?? '',
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
    transitionIn: { type: 'none', duration: 0.4 },
    transitionOut: { type: 'none', duration: 0.4 },
    fadeIn: 0,
    fadeOut: 0,
    keyframes: [],
    ...patch,
  } as Clip;
}

/* --------------------------------- XML --------------------------------- */

export function parseXmeml(xml: string, sourceName = 'Timeline XML'): ParsedTimeline {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('XML inválido — verifique o arquivo exportado do Premiere/Final Cut.');

  const sequence = doc.querySelector('sequence') ?? doc.documentElement;
  const timebase = Number(sequence.querySelector('rate > timebase')?.textContent ?? 30) || 30;
  const name = sequence.querySelector(':scope > name')?.textContent?.trim() || sourceName;

  const tracks: Track[] = [];
  const clips: Clip[] = [];
  const warnings: string[] = [];

  const videoTracks = Array.from(sequence.querySelectorAll('media > video > track'));
  const audioTracks = Array.from(sequence.querySelectorAll('media > audio > track'));

  const handle = (trackEl: Element, isAudio: boolean, index: number) => {
    const trackId = uid(isAudio ? 'a' : 'v');
    tracks.push({
      id: trackId,
      name: isAudio ? `Áudio importado ${index + 1}` : `Vídeo importado ${index + 1}`,
      kind: isAudio ? 'audio' : 'visual',
      muted: false,
      hidden: false,
    });

    const items = Array.from(trackEl.querySelectorAll(':scope > clipitem'));
    for (const item of items) {
      const start = Number(item.querySelector(':scope > start')?.textContent ?? 0) / timebase;
      const end = Number(item.querySelector(':scope > end')?.textContent ?? 0) / timebase;
      const inPoint = Number(item.querySelector(':scope > in')?.textContent ?? 0) / timebase;
      const pathUrl = item.querySelector(':scope > file > pathurl')?.textContent ?? '';
      const clipName =
        item.querySelector(':scope > name')?.textContent?.trim() ||
        item.querySelector(':scope > file > name')?.textContent?.trim() ||
        'Clipe importado';
      const duration = Math.max(0.1, end - start);
      if (!duration) continue;

      const kind = extKind(pathUrl || clipName, isAudio);
      if (!pathUrl) warnings.push(`“${clipName}” veio sem caminho de mídia — adicione o arquivo na biblioteca e arraste para o clipe.`);

      clips.push(
        emptyClip({
          kind,
          trackId,
          name: clipName,
          src: pathUrl,
          start: Number(start.toFixed(3)),
          duration: Number(duration.toFixed(3)),
          trimStart: Number(Math.max(0, inPoint).toFixed(3)),
          volume: isAudio ? 1 : 1,
        }),
      );
    }
  };

  videoTracks.forEach((t, i) => handle(t, false, i));
  audioTracks.forEach((t, i) => handle(t, true, i));

  if (!clips.length) throw new Error('Nenhum clipe encontrado no XML. Exporte como “Final Cut Pro XML” no Premiere (Arquivo › Exportar › Final Cut Pro XML).');

  const duration = Math.max(...clips.map((c) => c.start + c.duration), 5);
  return { format: 'xmeml', name, fps: timebase, duration, tracks, clips, warnings };
}

/* --------------------------------- SRT --------------------------------- */

function srtTime(value: string) {
  const m = value.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function parseSrt(text: string, sourceName = 'Legendas'): ParsedTimeline {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  const trackId = 't-legendas';
  const tracks: Track[] = [{ id: trackId, name: 'Legendas', kind: 'visual', muted: false, hidden: false }];
  const clips: Clip[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (!lines.length) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [from, to] = timeLine.split('-->').map(srtTime);
    const content = lines
      .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join('\n')
      .trim();
    if (!content || !from) continue;
    clips.push(
      emptyClip({
        kind: 'text',
        trackId,
        name: content.slice(0, 24),
        src: 'text',
        start: Number(from.toFixed(2)),
        duration: Math.max(0.4, Number((to - from).toFixed(2))),
        text: {
          content,
          fontFamily: 'Montserrat',
          fontSize: 54,
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

  if (!clips.length) throw new Error('Nenhuma legenda encontrada no arquivo .srt.');
  const duration = Math.max(...clips.map((c) => c.start + c.duration), 5);
  return { format: 'srt', name: sourceName, fps: 30, duration, tracks, clips, warnings: [] };
}

/* -------------------------------- JSON/CSV -------------------------------- */

export function parseProjectJson(text: string): ParsedTimeline {
  const data = JSON.parse(text) as { name?: string; fps?: number; duration?: number; tracks?: Track[]; clips?: Clip[]; timeline?: { tracks?: Track[]; clips?: Clip[] } };
  const tracks = data.tracks ?? data.timeline?.tracks ?? [];
  const clips = data.clips ?? data.timeline?.clips ?? [];
  if (!Array.isArray(tracks) || !Array.isArray(clips) || !clips.length) {
    throw new Error('JSON sem timeline reconhecível. Use o JSON exportado pelo próprio Editor Studio.');
  }
  const duration = Math.max(data.duration ?? 0, ...clips.map((c) => Number(c.start ?? 0) + Number(c.duration ?? 0)), 5);
  return { format: 'json', name: data.name ?? 'Projeto importado', fps: data.fps ?? 30, duration, tracks, clips, warnings: [] };
}

export function parseCsv(text: string): ParsedTimeline {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const trackId = 't-csv';
  const tracks: Track[] = [{ id: trackId, name: 'Roteiro', kind: 'visual', muted: false, hidden: false }];
  const clips: Clip[] = [];
  let cursor = 0;
  for (const line of lines) {
    const [startRaw, durationRaw, ...rest] = line.split(/[;,]\s*/);
    if (/^in[ií]cio/i.test(line)) continue;
    const content = rest.join(' ').trim() || startRaw;
    const start = Number.isFinite(Number(startRaw)) ? Number(startRaw) : cursor;
    const duration = Number.isFinite(Number(durationRaw)) && Number(durationRaw) > 0 ? Number(durationRaw) : 3;
    clips.push(
      emptyClip({
        kind: 'text',
        trackId,
        name: content.slice(0, 20),
        src: 'text',
        start,
        duration,
        text: {
          content,
          fontFamily: 'Montserrat',
          fontSize: 58,
          color: '#ffffff',
          weight: 700,
          align: 'center',
          shadow: true,
          stroke: 0,
          strokeColor: '#000000',
          background: 'transparent',
          letterSpacing: 0,
          lineHeight: 1.2,
          gradient: '',
          animation: 'none',
        },
      }),
    );
    cursor = start + duration;
  }
  if (!clips.length) throw new Error('CSV vazio. Use o formato: início;duração;texto');
  return { format: 'csv', name: 'Roteiro CSV', fps: 30, duration: cursor + 1, tracks, clips, warnings: [] };
}

export function parseTimelineFile(text: string, filename: string): ParsedTimeline {
  const lower = filename.toLowerCase();
  const trimmed = text.trim();
  if (lower.endsWith('.json')) return parseProjectJson(trimmed);
  if (lower.endsWith('.srt') || /^\s*\d+\s*\n\d{2}:\d{2}:\d{2}/.test(trimmed)) return parseSrt(trimmed, filename);
  if (lower.endsWith('.csv')) return parseCsv(trimmed);
  if (trimmed.startsWith('<')) return parseXmeml(trimmed, filename);
  throw new Error('Formato não reconhecido. Aceitamos XML (Premiere/FCP), SRT, JSON e CSV.');
}

/* ------------------------------- Exportação ------------------------------- */

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Gera XML xmeml v4 compatível com Premiere Pro / DaVinci Resolve. */
export function buildXmeml(opts: { name: string; fps: number; width: number; height: number; tracks: Track[]; clips: Clip[] }) {
  const fps = Math.max(1, Math.round(opts.fps));
  const total = Math.max(1, Math.ceil(Math.max(...opts.clips.map((c) => c.start + c.duration), 5) * fps));

  const trackXml = (kind: 'visual' | 'audio') => {
    const list = opts.tracks.filter((t) => t.kind === kind);
    return list
      .map((track) => {
        const items = opts.clips
          .filter((c) => c.trackId === track.id)
          .sort((a, b) => a.start - b.start)
          .map((clip, index) => {
            const start = Math.round(clip.start * fps);
            const end = Math.round((clip.start + clip.duration) * fps);
            const inPoint = Math.round(clip.trimStart * fps);
            const outPoint = inPoint + (end - start);
            const id = `${kind}-${track.id}-${index}`;
            const mediaName = `${clip.name.replace(/\.[a-z0-9]+$/i, '')}.${kind === 'audio' ? 'wav' : 'mp4'}`;
            return `        <clipitem id="${esc(id)}">
          <name>${esc(clip.name)}</name>
          <duration>${outPoint - inPoint}</duration>
          <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
          <start>${start}</start>
          <end>${end}</end>
          <in>${inPoint}</in>
          <out>${outPoint}</out>
          <file id="file-${esc(id)}">
            <name>${esc(mediaName)}</name>
            <pathurl>${esc(clip.src.startsWith('http') || clip.src.startsWith('/') ? clip.src : `file://localhost/${mediaName}`)}</pathurl>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <media><${kind === 'audio' ? 'audio' : 'video'}><samplecharacteristics><width>${opts.width}</width><height>${opts.height}</height></samplecharacteristics></${kind === 'audio' ? 'audio' : 'video'}></media>
          </file>
        </clipitem>`;
          })
          .join('\n');
        return `      <track>\n${items}\n      </track>`;
      })
      .join('\n');
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${esc(opts.name)}</name>
    <duration>${total}</duration>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format><samplecharacteristics><width>${opts.width}</width><height>${opts.height}</height><fielddominance>none</fielddominance></samplecharacteristics></format>
${trackXml('visual')}
      </video>
      <audio>
${trackXml('audio')}
      </audio>
    </media>
  </sequence>
</xmeml>`;
}

export function buildProjectJson(opts: {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  tracks: Track[];
  clips: Clip[];
}) {
  return JSON.stringify(
    {
      app: 'editor-studio',
      version: 1,
      exported_at: new Date().toISOString(),
      ...opts,
    },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string, mime = 'application/octet-stream') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
