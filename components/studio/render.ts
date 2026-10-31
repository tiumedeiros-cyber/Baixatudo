'use client';
import type { Clip, Filters, Keyframe, Track } from '@/lib/types';
import { clamp } from '@/lib/utils';
import type { MediaRegistry } from './media';
import type { ThreePool } from './three';

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
  const ctx = c.getContext('2d')!;
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

function drawSticker(ctx: CanvasRenderingContext2D, clip: Clip, size: number) {
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

    if (clip.kind === 'video') {
      const el = media.getVideo(clip.src);
      if (el.readyState >= 2) {
        const sw = el.videoWidth || width;
        const sh = el.videoHeight || height;
        const cover = Math.max(width / sw, height / sh);
        ctx.drawImage(el, (-sw * cover) / 2, (-sh * cover) / 2, sw * cover, sh * cover);
      }
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
      const canvas = three.render(obj.shape, obj.color, local, obj.spin, rotX, rotY);
      const size = height * 0.7;
      ctx.drawImage(canvas, -size / 2, -size / 2, size, size);
    } else if (clip.kind === 'sticker') {
      drawSticker(ctx, clip, height * 0.4);
    }

    if (glitch > 0.01) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45 * glitch;
      const jitter = () => (Math.random() - 0.5) * width * 0.05 * glitch;
      if (clip.kind === 'video') {
        const el = media.getVideo(clip.src);
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
