'use client';
import type { Clip, Filters, Keyframe, Track } from '@/lib/types';
import { clamp } from '@/lib/utils';
import type { MediaRegistry } from './media';
import type { ThreePool } from './three';
import { drawAvatar, mouthFromEnvelope } from './avatar';

export type FrameOptions = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  background: string;
  clips: Clip[];
  tracks: Track[];
  time: number;
  media: MediaRegistry;
  three: ThreePool;
  transparent?: boolean;
};

const RAD = Math.PI / 180;

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}
function easeInOut(p: number) {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function interpolate(clip: Clip, local: number): { opacity: number; extra: Record<string, number> } {
  const kfs = clip.keyframes ?? [];
  const extra: Record<string, number> = {};
  const props: Keyframe['prop'][] = ['x', 'y', 'scale', 'rotation', 'opacity', 'rotationX', 'rotationY'];
  for (const prop of props) {
    const list = kfs.filter((k) => k.prop === prop).sort((a, b) => a.t - b.t);
    if (list.length === 0) continue;
    if (local <= list[0].t) {
      extra[prop] = list[0].value;
      continue;
    }
    if (local >= list[list.length - 1].t) {
      extra[prop] = list[list.length - 1].value;
      continue;
    }
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (local >= a.t && local <= b.t) {
        const p = (local - a.t) / Math.max(0.001, b.t - a.t);
        extra[prop] = a.value + (b.value - a.value) * easeInOut(p);
        break;
      }
    }
  }
  return { opacity: extra.opacity ?? 1, extra };
}

function filterString(f: Filters) {
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
  return parts.length ? parts.join(' ') : 'none';
}

let grainCanvas: HTMLCanvasElement | null = null;
function getGrain() {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 46;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

function drawOverlay(ctx: CanvasRenderingContext2D, preset: string, width: number, height: number) {
  if (preset === 'vignette') {
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (preset === 'grain') {
    const grain = getGrain();
    const pattern = ctx.createPattern(grain, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.translate(-Math.random() * 64, -Math.random() * 64);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width + 64, height + 64);
      ctx.restore();
    }
  } else if (preset === 'frame') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(4, width * 0.012);
    ctx.strokeRect(width * 0.035, height * 0.035, width * 0.93, height * 0.93);
  }
}

/* ----------------------------- Fundos animados ----------------------------- */

/** PRNG determinístico para partículas (mesmo frame = mesmo desenho, inclusive na exportação). */
function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type GenOpts = { colorA: string; colorB: string; speed: number; intensity: number };

function drawGenerator(ctx: CanvasRenderingContext2D, preset: string, t: number, w: number, h: number, o: GenOpts) {
  const tt = t * Math.max(0.05, o.speed);
  const k = clamp(o.intensity, 0.1, 2);

  if (preset === 'solid' || preset === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, o.colorA);
    g.addColorStop(1, o.colorB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (preset === 'aurora') {
    ctx.fillStyle = o.colorA;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const cx = w * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(tt * 0.35 + i)));
      const cy = h * (0.25 + 0.5 * (0.5 + 0.5 * Math.cos(tt * 0.28 + i * 1.7)));
      const r = Math.max(w, h) * (0.34 + 0.16 * Math.sin(tt * 0.5 + i));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, i % 2 ? o.colorB : o.colorA);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (preset === 'waves') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, o.colorA);
    g.addColorStop(1, o.colorB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 4; layer++) {
      ctx.beginPath();
      const amp = h * (0.05 + layer * 0.02) * k;
      const yBase = h + (layer * h) / 9 - h * 0.05;
      ctx.moveTo(0, yBase);
      for (let x = 0; x <= w; x += Math.max(4, w / 120)) {
        const y = yBase + Math.sin(x / (w / 6) + tt * (0.8 + layer * 0.25)) * amp * Math.cos(tt * 0.3);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = layer % 2 ? o.colorB : '#ffffff';
      ctx.globalAlpha = (0.06 + layer * 0.035) * k;
      ctx.fill();
    }
  } else if (preset === 'particles') {
    ctx.fillStyle = o.colorA;
    ctx.fillRect(0, 0, w, h);
    const count = Math.round(90 * k);
    for (let i = 0; i < count; i++) {
      const speed = 0.06 + rand(i * 3) * 0.2;
      const x = ((rand(i) + tt * speed) % 1) * w;
      const y = ((rand(i * 7) + tt * speed * 0.6) % 1) * h;
      const r = (2 + rand(i * 11) * 10) * (w / 1920 + 0.4);
      ctx.globalAlpha = 0.25 + rand(i * 5) * 0.6;
      ctx.fillStyle = i % 3 === 0 ? o.colorB : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (preset === 'grid') {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, o.colorB);
    g.addColorStop(1, o.colorA);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.16 * k;
    ctx.lineWidth = Math.max(1, w / 1200);
    const step = w / 26;
    const shift = (tt * 22) % step;
    for (let x = -step; x < w + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + shift, 0);
      ctx.lineTo(x + shift, h);
      ctx.stroke();
    }
    for (let y = 0; y < h + step; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (preset === 'bokeh') {
    ctx.fillStyle = o.colorA;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = w * rand(i * 2.3) + Math.sin(tt * 0.2 + i) * w * 0.02;
      const cy = h * rand(i * 5.1) + Math.cos(tt * 0.16 + i) * h * 0.02;
      const r = (w * 0.05 + rand(i) * w * 0.16) * k;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, i % 2 ? o.colorB : '#ffffff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.22 + rand(i * 9) * 0.2;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (preset === 'sweep') {
    ctx.fillStyle = o.colorA;
    ctx.fillRect(0, 0, w, h);
    const band = ((tt * 0.35) % 1.6 - 0.3) * w * 1.6;
    const g = ctx.createLinearGradient(band - w * 0.4, 0, band + w * 0.4, h * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, o.colorB);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.55 * k;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (preset === 'rays') {
    const g = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, Math.max(w, h));
    g.addColorStop(0, o.colorB);
    g.addColorStop(1, o.colorA);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 * k;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + tt * 0.12;
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.1);
      ctx.lineTo(w / 2 + Math.cos(a) * w, h * 0.1 + Math.sin(a) * w);
      ctx.lineTo(w / 2 + Math.cos(a + 0.05) * w, h * 0.1 + Math.sin(a + 0.05) * w);
      ctx.closePath();
      ctx.fill();
    }
  } else if (preset === 'spotlight') {
    const g = ctx.createRadialGradient(w * (0.5 + 0.1 * Math.sin(tt * 0.3)), h * 0.25, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
    g.addColorStop(0, o.colorB);
    g.addColorStop(0.55, o.colorA);
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  } else if (preset === 'stripes') {
    ctx.fillStyle = o.colorA;
    ctx.fillRect(0, 0, w, h);
    const step = w / 18;
    ctx.save();
    ctx.translate(-w + ((tt * 30) % (step * 2)), 0);
    ctx.globalAlpha = 0.18 * k;
    ctx.fillStyle = o.colorB;
    for (let x = 0; x < w * 3; x += step * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + step, 0);
      ctx.lineTo(x + step - h * 0.6, h);
      ctx.lineTo(x - h * 0.6, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, o.colorA);
    g.addColorStop(1, o.colorB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawSticker(
ctx: CanvasRenderingContext2D, clip: Clip, size: number) {
  const color = clip.sticker?.color ?? '#818cf8';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const preset = clip.sticker?.preset ?? 'shapes';
  if (preset === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === 'square') {
    ctx.fillRect(-size / 2, -size / 2, size, size);
  } else if (preset === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(size / 2, size / 2);
    ctx.lineTo(-size / 2, size / 2);
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'line') {
    ctx.lineWidth = size * 0.06;
    ctx.beginPath();
    ctx.moveTo(-size / 2, 0);
    ctx.lineTo(size / 2, 0);
    ctx.stroke();
  } else if (preset === 'frame') {
    ctx.lineWidth = size * 0.05;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
  } else if (preset === 'burst') {
    // explosão de preço (estilo vitrine de marketplace)
    const spikes = 16;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? size / 2 : size * 0.33;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'tag') {
    // etiqueta de preço
    const w = size * 0.92;
    const hh = size * 0.6;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -hh / 2);
    ctx.lineTo(w / 2 - hh * 0.35, -hh / 2);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 2 - hh * 0.35, hh / 2);
    ctx.lineTo(-w / 2, hh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = '#0a0c14';
    ctx.beginPath();
    ctx.arc(w / 2 - hh * 0.42, 0, hh * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (preset === 'ribbon') {
    ctx.beginPath();
    ctx.moveTo(-size / 2, -size * 0.14);
    ctx.lineTo(size / 2, -size * 0.14);
    ctx.lineTo(size / 2, size * 0.14);
    ctx.lineTo(-size / 2, size * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size / 2, size * 0.14);
    ctx.lineTo(-size * 0.3, size * 0.3);
    ctx.lineTo(-size / 2, size * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'seal') {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.03;
    ctx.setLineDash([size * 0.06, size * 0.05]);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (preset === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(-size / 2, -size * 0.1);
    ctx.lineTo(size * 0.12, -size * 0.1);
    ctx.lineTo(size * 0.12, -size * 0.26);
    ctx.lineTo(size / 2, 0);
    ctx.lineTo(size * 0.12, size * 0.26);
    ctx.lineTo(size * 0.12, size * 0.1);
    ctx.lineTo(-size / 2, size * 0.1);
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'pill') {
    const w = size;
    const r = size * 0.26;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -r, w, r * 2, r);
    ctx.fill();
  } else if (preset === 'star') {
    const spikes = 5;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? size / 2 : size * 0.22;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (preset === 'rings') {
    ctx.lineWidth = size * 0.07;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.5 - i * 0.13), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(-size * 0.18, 0, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.75;
    ctx.beginPath();
    ctx.arc(size * 0.22, -size * 0.12, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

type TextLine = { text: string; width: number };

/**
 * Desenha o quadro do vídeo do clipe. Se o elemento ainda está carregando ou
 * buscando o ponto do corte, reaproveita o último quadro conhecido — antes a
 * área ficava preta logo depois de cortar.
 */
function drawClipVideo(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  media: MediaRegistry,
  width: number,
  height: number,
) {
  const el = media.videoFor(clip);
  if (el.readyState >= 2 && el.videoWidth) {
    media.cachePoster(clip.id, el);
    const cover = Math.max(width / el.videoWidth, height / el.videoHeight);
    ctx.drawImage(el, (-el.videoWidth * cover) / 2, (-el.videoHeight * cover) / 2, el.videoWidth * cover, el.videoHeight * cover);
    return;
  }
  const poster = media.posterFor(clip);
  if (poster && poster.width > 1) {
    const cover = Math.max(width / poster.width, height / poster.height);
    ctx.drawImage(poster, (-poster.width * cover) / 2, (-poster.height * cover) / 2, poster.width * cover, poster.height * cover);
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const p of paragraphs) {
    if (!p) {
      out.push('');
      continue;
    }
    const words = p.split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function drawText(ctx: CanvasRenderingContext2D, clip: Clip, local: number, width: number, height: number, scaleFactor: number) {
  const t = clip.text;
  if (!t) return;
  const fs = Math.max(8, t.fontSize * (height / 1080));
  ctx.font = `${t.weight} ${fs}px "${t.fontFamily}", Inter, sans-serif`;
  ctx.textAlign = t.align;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${t.letterSpacing}px`;

  let content = t.content;
  if (t.animation === 'typewriter') {
    const chars = Math.floor(clamp(local / Math.max(0.8, content.length * 0.045), 0, 1) * content.length);
    content = content.slice(0, chars);
  }
  const maxWidth = (width * 0.9) / scaleFactor;
  const lines = wrapText(ctx, content, maxWidth);
  const lineHeight = fs * t.lineHeight;
  const totalHeight = lines.length * lineHeight;
  const measured: TextLine[] = lines.map((l) => ({ text: l, width: ctx.measureText(l).width }));
  const maxLineWidth = measured.reduce((a, b) => Math.max(a, b.width), 1);

  if (t.animation === 'pop' && local < 0.45) {
    const p = local / 0.45;
    const s = 0.7 + 0.3 * (1 + Math.sin(p * Math.PI) * 0.12);
    ctx.scale(s, s);
  }
  if (t.animation === 'fade' && local < 0.4) ctx.globalAlpha *= clamp(local / 0.4, 0, 1);

  const startY = -totalHeight / 2 + lineHeight / 2;
  const alignX = t.align === 'center' ? 0 : t.align === 'left' ? -maxLineWidth / 2 : maxLineWidth / 2;

  if (t.background && t.background !== 'transparent') {
    ctx.save();
    ctx.fillStyle = t.background;
    const pad = fs * 0.28;
    const bx = alignX - (t.align === 'center' ? maxLineWidth / 2 : t.align === 'right' ? 0 : maxLineWidth);
    const bw = maxLineWidth + pad * 2;
    const bh = totalHeight + pad * 1.4;
    const radius = Math.min(28, fs * 0.3);
    ctx.beginPath();
    ctx.roundRect(bx - pad, startY - lineHeight / 2 - pad * 0.7, bw, bh, radius);
    ctx.fill();
    ctx.restore();
  }

  if (t.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = fs * 0.18;
    ctx.shadowOffsetY = fs * 0.05;
  }

  measured.forEach((line, i) => {
    const y = startY + i * lineHeight;
    if (t.gradient && t.gradient.includes(',')) {
      const [c1, c2] = t.gradient.split(',');
      const g = ctx.createLinearGradient(alignX - maxLineWidth / 2, y, alignX + maxLineWidth / 2, y);
      g.addColorStop(0, c1.trim());
      g.addColorStop(1, c2.trim());
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = t.color;
    }
    if (t.stroke > 0) {
      ctx.lineWidth = t.stroke * (height / 1080);
      ctx.strokeStyle = t.strokeColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(line.text, alignX, y);
    }
    ctx.fillText(line.text, alignX, y);
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export function drawFrame(opts: FrameOptions) {
  const { ctx, width, height, background, clips, tracks, time, media, three, transparent } = opts;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  if (!transparent) {
    ctx.fillStyle = background || '#0b0d13';
    ctx.fillRect(0, 0, width, height);
  }

  const trackIndex = new Map(tracks.map((t, i) => [t.id, i]));
  const active = clips
    .filter((c) => time >= c.start && time < c.start + c.duration)
    .sort((a, b) => (trackIndex.get(b.trackId) ?? 0) - (trackIndex.get(a.trackId) ?? 0));

  for (const clip of active) {
    const track = tracks.find((t) => t.id === clip.trackId);
    if (track?.hidden) continue;
    if (['audio', 'sfx', 'music'].includes(clip.kind)) continue;

    const local = time - clip.start;
    const { opacity: kfOpacity, extra } = interpolate(clip, local);
    const scaleBase = extra.scale ?? clip.transform.scale;
    const x = extra.x ?? clip.transform.x;
    const y = extra.y ?? clip.transform.y;
    const rotation = extra.rotation ?? clip.transform.rotation;
    const rotX = extra.rotationX ?? clip.transform.rotationX;
    const rotY = extra.rotationY ?? clip.transform.rotationY;

    let alpha = clip.opacity * kfOpacity;
    if (clip.fadeIn > 0) alpha *= clamp(local / clip.fadeIn, 0, 1);
    if (clip.fadeOut > 0) alpha *= clamp((clip.duration - local) / clip.fadeOut, 0, 1);

    // transições
    let dx = 0;
    let dy = 0;
    let tScale = 1;
    let wipe: number | null = null;
    let glitch = 0;
    let flash = 0;

    const inDur = clip.transitionIn?.duration ?? 0;
    const outDur = clip.transitionOut?.duration ?? 0;
    if (clip.transitionIn?.type !== 'none' && inDur > 0 && local < inDur) {
      const p = clamp(local / inDur, 0, 1);
      const e = easeOut(p);
      switch (clip.transitionIn.type) {
        case 'fade':
          alpha *= e;
          break;
        case 'slide':
          dx += -(1 - e) * width;
          break;
        case 'zoom':
          tScale *= 1 + (1 - e) * 0.7;
          alpha *= e;
          break;
        case 'wipe':
          wipe = e;
          break;
        case 'glitch':
          glitch = 1 - e;
          alpha *= e;
          break;
        case 'flash':
          flash = 1 - e;
          break;
        default:
          break;
      }
    }
    const remaining = clip.start + clip.duration - time;
    if (clip.transitionOut?.type !== 'none' && outDur > 0 && remaining < outDur) {
      const p = clamp(remaining / outDur, 0, 1);
      const e = easeOut(p);
      switch (clip.transitionOut.type) {
        case 'fade':
          alpha *= e;
          break;
        case 'slide':
          dx += (1 - e) * width;
          break;
        case 'zoom':
          tScale *= 1 + (1 - e) * 0.7;
          alpha *= e;
          break;
        case 'wipe':
          wipe = wipe === null ? e : Math.min(wipe, e);
          break;
        case 'glitch':
          glitch = Math.max(glitch, 1 - e);
          alpha *= e;
          break;
        case 'flash':
          flash = Math.max(flash, 1 - e);
          break;
        default:
          break;
      }
    }

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);

    if (clip.kind === 'overlay') {
      drawOverlay(ctx, clip.overlay?.preset ?? 'vignette', width, height);
      ctx.restore();
      continue;
    }

    if (wipe !== null) {
      ctx.beginPath();
      ctx.rect(0, 0, width * wipe, height);
      ctx.clip();
    }

    const cx = width / 2 + dx;
    const cy = height / 2 + dy;
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation * RAD);
    const perspective = rotX || rotY;
    if (perspective) {
      const sx = Math.cos(rotY * RAD);
      const sy = Math.cos(rotX * RAD);
      ctx.scale(Math.max(0.02, sx), Math.max(0.02, sy));
    }
    ctx.scale(scaleBase * tScale, scaleBase * tScale);
    ctx.filter = filterString(clip.filters);

    // sombra configurável (imagens, vídeos, formas e fundos)
    const shadow = clip.shadow;
    if (shadow && (shadow.blur > 0 || shadow.offsetY !== 0 || shadow.offsetX !== 0)) {
      ctx.shadowColor = shadow.color;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetY = shadow.offsetY;
      ctx.shadowOffsetX = shadow.offsetX;
    }

    if (clip.kind === 'generator') {
      const g = clip.generator ?? { preset: 'aurora', colorA: '#4f46e5', colorB: '#22d3ee', speed: 1, intensity: 1 };
      ctx.save();
      ctx.translate(-width / 2, -height / 2);
      drawGenerator(ctx, g.preset, local + clip.trimStart, width, height, {
        colorA: g.colorA,
        colorB: g.colorB,
        speed: g.speed,
        intensity: g.intensity,
      });
      ctx.restore();
    } else if (clip.kind === 'video') {
      drawClipVideo(ctx, clip, media, width, height);
    } else if (clip.kind === 'image') {
      const img = media.getImage(clip.src);
      if (img.complete && img.naturalWidth) {
        const cover = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        ctx.drawImage(img, (-img.naturalWidth * cover) / 2, (-img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover);
      }
    } else if (clip.kind === 'text') {
      drawText(ctx, clip, local, width, height, scaleBase * tScale);
    } else if (clip.kind === 'object3d') {
      const obj = clip.object3d ?? { shape: 'box', color: '#818cf8', metalness: 0.4, spin: 0.6 };
      try {
        const canvas = three.render(obj.shape, obj.color, local, obj.spin, rotX, rotY);
        const size = height * 0.7;
        ctx.drawImage(canvas, -size / 2, -size / 2, size, size);
      } catch {
        // WebGL indisponível (alguns navegadores/dispositivos antigos): desenha um placeholder.
        const size = height * 0.5;
        ctx.fillStyle = obj.color || '#818cf8';
        ctx.globalAlpha *= 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (clip.kind === 'sticker') {
      drawSticker(ctx, clip, height * 0.4);
    } else if (clip.kind === 'avatar') {
      const avatar = clip.avatar ?? { preset: 'theo', mouth: [] };
      const intensity = avatar.intensity ?? 1;
      const mouth = avatar.mouth?.length
        ? Math.min(1, mouthFromEnvelope(avatar.mouth, local + clip.trimStart) * intensity)
        : 0.3 + 0.35 * Math.abs(Math.sin((local + clip.trimStart) * 6.5)) * intensity;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.03);
      ctx.clip();
      drawAvatar(ctx, avatar.preset, -width / 2, -height / 2, width, height, mouth, local + clip.trimStart);
      ctx.restore();
    }

    if (glitch > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45 * glitch;
      const jitter = () => (Math.random() - 0.5) * width * 0.05 * glitch;
      if (clip.kind === 'video') {
        const el = media.videoFor(clip);
        if (el.readyState >= 2) {
          const cover = Math.max(width / (el.videoWidth || width), height / (el.videoHeight || height));
          const sw = (el.videoWidth || width) * cover;
          const sh = (el.videoHeight || height) * cover;
          ctx.drawImage(el, -sw / 2 + jitter(), -sh / 2, sw, sh);
          ctx.drawImage(el, -sw / 2 + jitter(), -sh / 2, sw, sh);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    if (flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(flash, 0, 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
