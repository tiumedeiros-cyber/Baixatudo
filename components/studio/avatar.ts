'use client';
import { avatarById, type AvatarPreset } from '@/lib/catalog/avatars';

/**
 * Desenha o avatar falante dentro de uma caixa.
 *
 * `mouth` vai de 0 (boca fechada) a 1 (boca bem aberta) e vem do volume do
 * áudio de narração — por isso a boca “fala” junto no preview E na exportação.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  presetId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  mouth: number,
  time: number,
) {
  const a = avatarById(presetId);
  const open = Math.max(0, Math.min(1, mouth));
  const blink = blinkAt(time);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // fundo
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, a.bg[0]);
  bg.addColorStop(1, a.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  // brilho suave atrás do personagem
  const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.42, h * 0.05, x + w / 2, y + h * 0.5, h * 0.62);
  glow.addColorStop(0, 'rgba(255,255,255,0.16)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);

  const cx = x + w / 2;
  const headW = Math.min(w * 0.46, h * 0.42);
  const headH = headW * 1.16;
  const headCy = y + h * 0.42;

  // ombros
  ctx.fillStyle = a.shirt;
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 1.02, headW * 1.42, h * 0.34, 0, Math.PI, 0, true);
  ctx.fill();
  // gola
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.34, y + h * 0.86);
  ctx.lineTo(cx, y + h * 0.99);
  ctx.lineTo(cx + headW * 0.34, y + h * 0.86);
  ctx.closePath();
  ctx.fill();

  // pescoço
  ctx.fillStyle = a.skinShadow;
  ctx.beginPath();
  ctx.roundRect(cx - headW * 0.2, headCy + headH * 0.34, headW * 0.4, headH * 0.34, headW * 0.12);
  ctx.fill();

  // cabelo de trás (estilos longos)
  if (a.hair === 'longo' || a.hair === 'cacheado') {
    ctx.fillStyle = a.hairColor;
    ctx.beginPath();
    if (a.hair === 'longo') {
      ctx.ellipse(cx, headCy + headH * 0.12, headW * 0.72, headH * 0.72, 0, 0, Math.PI * 2);
    } else {
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(ang) * headW * 0.62, headCy + Math.sin(ang) * headH * 0.56);
        ctx.arc(cx + Math.cos(ang) * headW * 0.62, headCy + Math.sin(ang) * headH * 0.56, headW * 0.3, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  // orelhas
  ctx.fillStyle = a.skin;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * headW * 0.5, headCy + headH * 0.02, headW * 0.1, headH * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.earrings) {
    ctx.fillStyle = '#fbbf24';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * headW * 0.5, headCy + headH * 0.18, headW * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // rosto
  const face = ctx.createLinearGradient(cx, headCy - headH / 2, cx, headCy + headH / 2);
  face.addColorStop(0, a.skin);
  face.addColorStop(1, a.skinShadow);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(cx, headCy, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // cabelo da frente
  ctx.fillStyle = a.hairColor;
  if (a.hair !== 'calvo') {
    ctx.beginPath();
    ctx.ellipse(cx, headCy - headH * 0.33, headW * 0.52, headH * 0.2, 0, Math.PI, 0, true);
    ctx.fill();
    if (a.hair === 'franja') {
      ctx.beginPath();
      ctx.ellipse(cx - headW * 0.1, headCy - headH * 0.24, headW * 0.42, headH * 0.16, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    if (a.hair === 'coque') {
      ctx.beginPath();
      ctx.arc(cx, headCy - headH * 0.56, headW * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // calvo: leve reflexo
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.12, headCy - headH * 0.3, headW * 0.2, headH * 0.1, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // sobrancelhas
  ctx.strokeStyle = a.hairColor;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, headW * 0.05);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * headW * 0.31, headCy - headH * 0.1);
    ctx.lineTo(cx + side * headW * 0.14, headCy - headH * 0.14);
    ctx.stroke();
  }

  // olhos (piscam de vez em quando)
  const eyeH = Math.max(1, headH * 0.055 * blink);
  for (const side of [-1, 1]) {
    const ex = cx + side * headW * 0.2;
    const ey = headCy - headH * 0.01;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, headW * 0.1, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink > 0.35) {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(ex, ey, headW * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (a.glasses) {
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.lineWidth = Math.max(2, headW * 0.035);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + side * headW * 0.2 - headW * 0.14, headCy - headH * 0.075, headW * 0.28, headH * 0.13, headW * 0.05);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.06, headCy - headH * 0.01);
    ctx.lineTo(cx + headW * 0.06, headCy - headH * 0.01);
    ctx.stroke();
  }

  // nariz
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(2, headW * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, headCy + headH * 0.04);
  ctx.quadraticCurveTo(cx + headW * 0.05, headCy + headH * 0.13, cx, headCy + headH * 0.15);
  ctx.stroke();

  // boca: abre conforme o volume do áudio
  const mouthY = headCy + headH * 0.27;
  const mouthW = headW * (0.3 + open * 0.06);
  const mouthH = headH * (0.028 + open * 0.13);
  ctx.fillStyle = 'rgba(90,20,35,0.92)';
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, mouthW / 2, Math.max(mouthH / 2, headH * 0.014), 0, 0, Math.PI * 2);
  ctx.fill();
  if (open > 0.18) {
    // dentes + língua para dar volume
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY - mouthH * 0.24, mouthW * 0.36, mouthH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,90,110,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + mouthH * 0.24, mouthW * 0.24, mouthH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.lipstick) {
    ctx.strokeStyle = a.lipstick;
    ctx.lineWidth = Math.max(2, headW * 0.045);
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthW / 2, Math.max(mouthH / 2, headH * 0.016), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // barba
  if (a.beard) {
    ctx.fillStyle = a.hairColor;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.ellipse(cx, headCy + headH * 0.28, headW * 0.36, headH * 0.2, 0, 0, Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
    // recorta a boca por cima da barba
    ctx.fillStyle = 'rgba(90,20,35,0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, mouthW / 2, Math.max(mouthH / 2, headH * 0.014), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Pisca de forma natural e determinística (mesmo quadro = mesmo desenho). */
function blinkAt(time: number) {
  const cycle = time % 4.2;
  if (cycle > 4.02) return Math.max(0.05, Math.abs(cycle - 4.11) / 0.09);
  return 1;
}

/** Amostra o volume (envelope) do áudio para animar a boca. */
export function mouthFromEnvelope(envelope: number[] | undefined, localTime: number, step = 0.05) {
  if (!envelope || envelope.length === 0) return 0.18;
  const index = Math.max(0, Math.min(envelope.length - 1, Math.floor(localTime / step)));
  return envelope[index] ?? 0;
}

export function avatarPresets() {
  return avatarById;
}

export type { AvatarPreset };
