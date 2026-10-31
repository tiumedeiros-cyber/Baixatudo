'use client';
import { avatarById, shade } from '@/lib/catalog/avatars';
import type { AvatarPreset, SceneId } from '@/lib/catalog/avatars';

/**
 * Render dos avatares falantes.
 *
 * O mesmo desenho é usado na miniatura, na prévia, na linha do tempo e na
 * exportação — então o que o cliente vê é exatamente o que sai no MP4.
 *
 * As camadas seguem uma ordem "física" (fundo → luz → corpo → cabelo de trás →
 * rosto → sombras → olhos → boca → cabelo da frente → luz de recorte), o que dá
 * o aspecto de retrato de estúdio em vez de desenho chapado.
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

  drawScene(ctx, a.scene ?? 'estudio', x, y, w, h, time, a);

  const cx = x + w / 2;
  const headW = Math.min(w * 0.44, h * 0.4);
  const headH = headW * 1.14;
  const headCy = y + h * 0.4;
  const shoulderY = y + h * 0.99;

  /* --------------------------------- corpo --------------------------------- */
  // sombra do corpo sobre o fundo
  const bodyShadow = ctx.createRadialGradient(cx, shoulderY, headW * 0.2, cx, shoulderY, headW * 2);
  bodyShadow.addColorStop(0, 'rgba(0,0,0,0.32)');
  bodyShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bodyShadow;
  ctx.fillRect(x, y, w, h);

  const shirtLight = shade(a.shirt, 0.22);
  const shirtDark = shade(a.shirt, -0.3);
  const body = ctx.createLinearGradient(cx - headW * 1.4, shoulderY - h * 0.3, cx + headW * 1.2, shoulderY);
  body.addColorStop(0, shirtLight);
  body.addColorStop(0.45, a.shirt);
  body.addColorStop(1, shirtDark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, shoulderY + h * 0.1, headW * 1.55, h * 0.4, 0, Math.PI, 0, true);
  ctx.fill();

  // gola (V ou careca) com tecido e costura
  ctx.fillStyle = shade(a.shirt, -0.42);
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.42, y + h * 0.83);
  ctx.quadraticCurveTo(cx, y + h * 1.03, cx + headW * 0.42, y + h * 0.83);
  ctx.quadraticCurveTo(cx, y + h * 0.9, cx - headW * 0.42, y + h * 0.83);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(1, headW * 0.02);
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.44, y + h * 0.83);
  ctx.quadraticCurveTo(cx, y + h * 1.04, cx + headW * 0.44, y + h * 0.83);
  ctx.stroke();

  if (a.fabric === 'social') {
    // lapelas de blazer
    ctx.fillStyle = shade(a.shirt, -0.16);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * headW * 0.42, y + h * 0.84);
      ctx.lineTo(cx + side * headW * 0.9, y + h * 1.06);
      ctx.lineTo(cx + side * headW * 0.62, y + h * 1.06);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (a.fabric === 'seda' || a.fabric === 'malha') {
    // caimento suave do tecido
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + (i - 1.5) * headW * 0.5, shoulderY + h * 0.06, headW * 0.16, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* --------------------------------- pescoço -------------------------------- */
  const neck = ctx.createLinearGradient(cx, headCy, cx, headCy + headH * 0.7);
  neck.addColorStop(0, shade(a.skinShadow, -0.1));
  neck.addColorStop(1, a.skinShadow);
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.roundRect(cx - headW * 0.19, headCy + headH * 0.3, headW * 0.38, headH * 0.42, headW * 0.1);
  ctx.fill();
  // sombra do queixo no pescoço
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(cx, headCy + headH * 0.36, headW * 0.2, headH * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  /* ------------------------------ cabelo de trás ----------------------------- */
  ctx.fillStyle = a.hairColor;
  if (a.hair === 'longo' || a.hair === 'cacheado' || a.hair === 'tranca') {
    if (a.hair === 'longo') {
      ctx.beginPath();
      ctx.ellipse(cx, headCy + headH * 0.18, headW * 0.74, headH * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      // fios com brilho
      for (let i = 0; i < 14; i++) {
        const ang = Math.PI * 0.15 + (i / 14) * Math.PI * 0.7;
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)';
        ctx.lineWidth = Math.max(1, headW * 0.02);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * headW * 0.5, headCy - headH * 0.1);
        ctx.quadraticCurveTo(
          cx + Math.cos(ang) * headW * 0.85,
          headCy + headH * 0.4,
          cx + Math.cos(ang) * headW * 0.6,
          headCy + headH * 0.92,
        );
        ctx.stroke();
      }
    } else if (a.hair === 'cacheado') {
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        const rx = cx + Math.cos(ang) * headW * 0.62;
        const ry = headCy + Math.sin(ang) * headH * 0.52;
        ctx.beginPath();
        ctx.arc(rx, ry, headW * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * headW * 0.6 - headW * 0.06, headCy + Math.sin(ang) * headH * 0.5 - headH * 0.05, headW * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // tranças / box braids
      ctx.beginPath();
      ctx.ellipse(cx, headCy + headH * 0.12, headW * 0.66, headH * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i % 2 ? shade(a.hairColor, 0.12) : shade(a.hairColor, -0.2);
          ctx.beginPath();
          ctx.roundRect(cx + side * headW * (0.4 + i * 0.14) - headW * 0.05, headCy + headH * 0.12, headW * 0.1, headH * 0.72, headW * 0.05);
          ctx.fill();
        }
      }
    }
  }
  if (a.hair === 'rabo') {
    ctx.beginPath();
    ctx.ellipse(cx + headW * 0.44, headCy + headH * 0.28, headW * 0.24, headH * 0.42, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(cx + headW * 0.42, headCy + headH * 0.2, headW * 0.1, headH * 0.16, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.hairColor;
  }

  /* --------------------------------- orelhas -------------------------------- */
  for (const side of [-1, 1]) {
    const ear = ctx.createLinearGradient(cx + side * headW * 0.5, headCy, cx + side * headW * 0.5, headCy + headH * 0.2);
    ear.addColorStop(0, a.skin);
    ear.addColorStop(1, a.skinShadow);
    ctx.fillStyle = ear;
    ctx.beginPath();
    ctx.ellipse(cx + side * headW * 0.5, headCy + headH * 0.03, headW * 0.095, headH * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = Math.max(1, headW * 0.018);
    ctx.beginPath();
    ctx.arc(cx + side * headW * 0.5, headCy + headH * 0.03, headW * 0.05, -0.6, 1.6);
    ctx.stroke();
  }
  if (a.earrings) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#f7d774';
      ctx.beginPath();
      ctx.arc(cx + side * headW * 0.5, headCy + headH * 0.16, headW * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(cx + side * headW * 0.49, headCy + headH * 0.15, headW * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------------------------- rosto --------------------------------- */
  const faceGrad = ctx.createRadialGradient(
    cx - headW * 0.16,
    headCy - headH * 0.2,
    headW * 0.05,
    cx + headW * 0.05,
    headCy + headH * 0.08,
    headW * 0.72,
  );
  faceGrad.addColorStop(0, shade(a.skin, 0.14));
  faceGrad.addColorStop(0.55, a.skin);
  faceGrad.addColorStop(1, shade(a.skinShadow, -0.06));
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(cx, headCy, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // têmporas/maçãs levemente rosadas
  ctx.fillStyle = 'rgba(214,90,90,0.14)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * headW * 0.28, headCy + headH * 0.12, headW * 0.13, headH * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // sombra lateral (luz vindo da esquerda)
  const side = ctx.createLinearGradient(cx + headW * 0.1, 0, cx + headW * 0.5, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(60,20,10,0.22)');
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.ellipse(cx, headCy, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // base do maxilar
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.ellipse(cx, headCy + headH * 0.36, headW * 0.3, headH * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  if (a.freckles) {
    ctx.fillStyle = 'rgba(120,60,35,0.35)';
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI - Math.PI * 0.15;
      const rx = cx + Math.cos(ang) * headW * 0.3 + (i % 3) * 2;
      const ry = headCy + headH * 0.07 + Math.sin(ang) * headH * 0.06;
      ctx.beginPath();
      ctx.arc(rx, ry, headW * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // orelha/cabelo cobrindo parte da testa em alguns estilos
  ctx.fillStyle = a.hairColor;
  if (a.hair !== 'calvo') {
    // calota do cabelo
    ctx.beginPath();
    ctx.ellipse(cx, headCy - headH * 0.3, headW * 0.53, headH * 0.24, 0, Math.PI, 0, true);
    ctx.fill();

    if (a.hair === 'franja') {
      ctx.beginPath();
      ctx.ellipse(cx - headW * 0.06, headCy - headH * 0.22, headW * 0.44, headH * 0.17, -0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    if (a.hair === 'coque') {
      ctx.beginPath();
      ctx.arc(cx, headCy - headH * 0.57, headW * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(cx - headW * 0.05, headCy - headH * 0.61, headW * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = a.hairColor;
    }
    if (a.hair === 'curto') {
      // laterais aparadas
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * headW * 0.4, headCy - headH * 0.18, headW * 0.14, headH * 0.18, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // brilho do cabelo
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.18, headCy - headH * 0.38, headW * 0.2, headH * 0.05, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.14, headCy - headH * 0.28, headW * 0.2, headH * 0.07, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  /* -------------------------------- sobrancelhas ---------------------------- */
  ctx.strokeStyle = shade(a.hairColor, 0.08);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.6, headW * 0.042);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * headW * 0.33, headCy - headH * 0.09);
    ctx.quadraticCurveTo(cx + s * headW * 0.24, headCy - headH * 0.16, cx + s * headW * 0.12, headCy - headH * 0.12);
    ctx.stroke();
  }

  /* ----------------------------------- olhos -------------------------------- */
  const eyeY = headCy - headH * 0.005;
  const eyeR = headW * 0.105;
  const irisColor = shade(a.hairColor, 0.32);
  for (const s of [-1, 1]) {
    const ex = cx + s * headW * 0.2;
    // sombra da pálpebra
    ctx.fillStyle = 'rgba(90,50,30,0.18)';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY - eyeR * 0.55, eyeR * 1.05, eyeR * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // esclera
    const sclera = ctx.createLinearGradient(ex, eyeY - eyeR, ex, eyeY + eyeR);
    sclera.addColorStop(0, '#f4f1ee');
    sclera.addColorStop(1, '#cfc6c1');
    ctx.fillStyle = sclera;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR, Math.max(0.6, eyeR * 0.6 * blink), 0, 0, Math.PI * 2);
    ctx.fill();

    if (blink > 0.4) {
      const iris = ctx.createRadialGradient(ex, eyeY + eyeR * 0.02, eyeR * 0.05, ex, eyeY, eyeR * 0.45);
      iris.addColorStop(0, '#8b5a2b');
      iris.addColorStop(0.5, irisColor);
      iris.addColorStop(1, shade(irisColor, -0.5));
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#120c08';
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // reflexo
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.16, eyeY - eyeR * 0.16, eyeR * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(ex + eyeR * 0.16, eyeY + eyeR * 0.14, eyeR * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }

    // cílios / linha da pálpebra
    ctx.strokeStyle = shade(a.hairColor, -0.2);
    ctx.lineWidth = Math.max(1.4, headW * 0.028);
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR, Math.max(0.6, eyeR * 0.62 * blink), 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    if (a.gender === 'f') {
      ctx.lineWidth = Math.max(1, headW * 0.018);
      for (let i = 0; i < 3; i++) {
        const t = 1.15 + i * 0.22;
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(t * Math.PI) * eyeR, eyeY + Math.sin(t * Math.PI) * eyeR * 0.6);
        ctx.lineTo(ex + Math.cos(t * Math.PI) * eyeR * 1.28, eyeY + Math.sin(t * Math.PI) * eyeR * 0.6 - eyeR * 0.2);
        ctx.stroke();
      }
    }
  }

  if (a.glasses) {
    ctx.strokeStyle = 'rgba(24,28,38,0.9)';
    ctx.lineWidth = Math.max(1.8, headW * 0.03);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(cx + s * headW * 0.2 - headW * 0.15, eyeY - headH * 0.08, headW * 0.3, headH * 0.15, headW * 0.06);
      ctx.stroke();
      // reflexo da lente
      const lens = ctx.createLinearGradient(cx + s * headW * 0.2 - headW * 0.14, eyeY - headH * 0.08, cx + s * headW * 0.2 + headW * 0.14, eyeY + headH * 0.07);
      lens.addColorStop(0, 'rgba(255,255,255,0.22)');
      lens.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      lens.addColorStop(1, 'rgba(255,255,255,0.16)');
      ctx.fillStyle = lens;
      ctx.beginPath();
      ctx.roundRect(cx + s * headW * 0.2 - headW * 0.14, eyeY - headH * 0.07, headW * 0.28, headH * 0.13, headW * 0.05);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(24,28,38,0.9)';
    ctx.lineWidth = Math.max(1.4, headW * 0.024);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.06, eyeY - headH * 0.01);
    ctx.quadraticCurveTo(cx, eyeY - headH * 0.04, cx + headW * 0.06, eyeY - headH * 0.01);
    ctx.stroke();
  }

  /* ----------------------------------- nariz -------------------------------- */
  ctx.strokeStyle = 'rgba(90,45,25,0.22)';
  ctx.lineWidth = Math.max(1.4, headW * 0.026);
  ctx.beginPath();
  ctx.moveTo(cx + headW * 0.015, headCy + headH * 0.02);
  ctx.quadraticCurveTo(cx + headW * 0.075, headCy + headH * 0.13, cx + headW * 0.025, headCy + headH * 0.155);
  ctx.stroke();
  ctx.fillStyle = 'rgba(70,30,15,0.3)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * headW * 0.045, headCy + headH * 0.163, headW * 0.021, headH * 0.009, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx - headW * 0.015, headCy + headH * 0.1, headW * 0.02, headH * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();

  /* ----------------------------------- boca --------------------------------- */
  const mouthY = headCy + headH * 0.27;
  const mouthW = headW * (0.34 + open * 0.05);
  const mouthH = headH * (0.03 + open * 0.14);

  if (a.beard) {
    // barba por fazer + contorno
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, headCy + headH * 0.22, headW * 0.42, headH * 0.28, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = shade(a.hairColor, 0.05);
    ctx.globalAlpha = 0.92;
    ctx.fillRect(cx - headW * 0.5, headCy, headW, headH * 0.6);
    // textura leve
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 60; i++) {
      const px = cx - headW * 0.4 + ((i * 37) % 80) * headW * 0.01;
      const py = headCy + headH * 0.08 + ((i * 53) % 70) * headH * 0.008;
      ctx.beginPath();
      ctx.arc(px, py, headW * 0.006, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // lábio superior
  ctx.fillStyle = a.lipstick ? shade(a.lipstick, -0.1) : 'rgba(150,70,75,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, mouthY);
  ctx.quadraticCurveTo(cx - mouthW * 0.25, mouthY - mouthH * 0.55, cx, mouthY - mouthH * 0.18);
  ctx.quadraticCurveTo(cx + mouthW * 0.25, mouthY - mouthH * 0.55, cx + mouthW / 2, mouthY);
  ctx.quadraticCurveTo(cx, mouthY - mouthH * 0.05, cx - mouthW / 2, mouthY);
  ctx.fill();

  // abertura (boca falando)
  ctx.fillStyle = 'rgba(72,16,26,0.95)';
  ctx.beginPath();
  ctx.ellipse(cx, mouthY + mouthH * (0.06 + open * 0.12), mouthW / 2, Math.max(mouthH / 2.4, headH * 0.012), 0, 0, Math.PI * 2);
  ctx.fill();

  if (open > 0.16) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + mouthH * 0.02, mouthW * 0.34, Math.max(1, mouthH * 0.15), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(205,80,100,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + mouthH * (0.16 + open * 0.2), mouthW * 0.22, Math.max(1, mouthH * 0.16), 0, 0, Math.PI * 2);
    ctx.fill();
    // sombra interna
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, mouthY + mouthH * 0.08, mouthW * 0.42, Math.max(1, mouthH * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // lábio inferior com brilho
  ctx.fillStyle = a.lipstick ? shade(a.lipstick, 0.18) : 'rgba(190,105,110,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, mouthY + mouthH * (0.12 + open * 0.3), mouthW * 0.46, Math.max(headH * 0.018, mouthH * 0.22), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - mouthW * 0.1, mouthY + mouthH * (0.1 + open * 0.24), mouthW * 0.14, Math.max(1, mouthH * 0.05), 0, 0, Math.PI * 2);
  ctx.fill();

  /* ------------------------- cabelo da frente / franja ---------------------- */
  ctx.fillStyle = a.hairColor;
  if (a.hair === 'franja') {
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.5, headCy - headH * 0.2);
    ctx.quadraticCurveTo(cx - headW * 0.2, headCy - headH * 0.05, cx + headW * 0.06, headCy - headH * 0.16);
    ctx.quadraticCurveTo(cx + headW * 0.3, headCy - headH * 0.28, cx + headW * 0.5, headCy - headH * 0.18);
    ctx.lineTo(cx + headW * 0.5, headCy - headH * 0.42);
    ctx.quadraticCurveTo(cx, headCy - headH * 0.62, cx - headW * 0.5, headCy - headH * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  if (a.hair === 'longo' || a.hair === 'tranca' || a.hair === 'rabo') {
    // mechas caindo nos ombros
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * headW * 0.44, headCy - headH * 0.18);
      ctx.quadraticCurveTo(cx + s * headW * 0.72, headCy + headH * 0.3, cx + s * headW * 0.5, headCy + headH * 0.78);
      ctx.quadraticCurveTo(cx + s * headW * 0.4, headCy + headH * 0.3, cx + s * headW * 0.34, headCy - headH * 0.16);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (a.hair === 'curto' || a.hair === 'coque') {
    // baby hair nas têmporas
    ctx.strokeStyle = shade(a.hairColor, 0.1);
    ctx.lineWidth = Math.max(1, headW * 0.015);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * headW * 0.36, headCy - headH * 0.28);
      ctx.quadraticCurveTo(cx + s * headW * 0.47, headCy - headH * 0.1, cx + s * headW * 0.42, headCy + headH * 0.06);
      ctx.stroke();
    }
  }

  /* ------------------------------ luz de recorte ---------------------------- */
  const rim = ctx.createLinearGradient(cx - headW * 0.55, 0, cx + headW * 0.62, 0);
  rim.addColorStop(0, 'rgba(255,255,255,0.16)');
  rim.addColorStop(0.35, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(120,200,255,0.12)');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(cx, headCy, headW * 0.52, headH * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  // vinheta do quadro
  const vig = ctx.createRadialGradient(cx, y + h * 0.45, Math.min(w, h) * 0.25, cx, y + h * 0.45, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(x, y, w, h);

  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/*                                  CENÁRIOS                                  */
/* -------------------------------------------------------------------------- */

/** Fundos fotorrealistas (gerados para o app, sem licença externa). */
const SCENE_IMAGES: Partial<Record<SceneId, string>> = {
  estudio: '/scenes/estudio.jpg',
  escritorio: '/scenes/escritorio.jpg',
  praia: '/scenes/praia.jpg',
  cidade: '/scenes/cidade.jpg',
  neon: '/scenes/neon.jpg',
  sala: '/scenes/sala.jpg',
  podcast: '/scenes/podcast.jpg',
  floresta: '/scenes/floresta.jpg',
};

const imageCache = new Map<string, HTMLImageElement>();

function scenePhoto(scene: SceneId): HTMLImageElement | null {
  const src = SCENE_IMAGES[scene];
  if (!src || typeof window === 'undefined') return null;
  const cached = imageCache.get(src);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  imageCache.set(src, img);
  return null; // no primeiro quadro usa o fundo procedural; nos seguintes a foto já carregou
}

/** Desenha a foto cobrindo a caixa (cover) e devolve true se desenhou. */
function drawPhotoCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: SceneId,
  x: number,
  y: number,
  w: number,
  h: number,
  time = 0,
  avatar?: AvatarPreset,
) {
  const palette = avatar?.bg ?? ['#1e1b4b', '#4c1d95'];

  const photo = scene === 'chroma' ? null : scenePhoto(scene);
  if (photo && photo.naturalWidth > 0) {
    ctx.save();
    drawPhotoCover(ctx, photo, x, y, w, h);
    // escurece as bordas para o avatar ganhar contraste
    const scrim = ctx.createRadialGradient(x + w / 2, y + h * 0.45, Math.min(w, h) * 0.2, x + w / 2, y + h * 0.45, Math.max(w, h) * 0.72);
    scrim.addColorStop(0, 'rgba(0,0,0,0.12)');
    scrim.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = scrim;
    ctx.fillRect(x, y, w, h);
    const tint = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    tint.addColorStop(0, 'rgba(255,255,255,0.05)');
    tint.addColorStop(1, palette[1] ? `${palette[1]}22` : 'rgba(0,0,0,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  const base = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  base.addColorStop(0, palette[0]);
  base.addColorStop(1, palette[1]);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);

  const soft = (cx: number, cy: number, r: number, color: string, alpha = 1) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };

  if (scene === 'estudio') {
    soft(x + w * 0.5, y + h * 0.42, Math.max(w, h) * 0.6, 'rgba(255,255,255,0.2)');
    // luzes de fundo (softbox)
    soft(x + w * 0.12, y + h * 0.18, Math.max(w, h) * 0.22, 'rgba(255,210,160,0.28)');
    soft(x + w * 0.88, y + h * 0.22, Math.max(w, h) * 0.24, 'rgba(120,190,255,0.24)');
    return;
  }

  if (scene === 'escritorio') {
    // janela desfocada com skyline
    ctx.fillStyle = 'rgba(180,215,255,0.16)';
    ctx.fillRect(x + w * 0.52, y + h * 0.05, w * 0.44, h * 0.62);
    ctx.fillStyle = 'rgba(120,165,215,0.25)';
    for (let i = 0; i < 7; i++) {
      const bw = w * 0.05;
      const bh = h * (0.12 + ((i * 37) % 40) / 200);
      ctx.fillRect(x + w * (0.55 + i * 0.06), y + h * 0.67 - bh, bw, bh);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.74, y + h * 0.05);
    ctx.lineTo(x + w * 0.74, y + h * 0.67);
    ctx.stroke();
    // mesa
    ctx.fillStyle = 'rgba(12,16,24,0.55)';
    ctx.fillRect(x, y + h * 0.78, w, h * 0.22);
    // planta
    ctx.fillStyle = 'rgba(30,90,60,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.1, y + h * 0.62, w * 0.08, h * 0.12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    soft(x + w * 0.3, y + h * 0.3, Math.max(w, h) * 0.5, 'rgba(255,235,205,0.16)');
    return;
  }

  if (scene === 'praia') {
    const sky = ctx.createLinearGradient(x, y, x, y + h * 0.6);
    sky.addColorStop(0, '#2b1b56');
    sky.addColorStop(0.45, '#c2572f');
    sky.addColorStop(0.75, '#f0993f');
    sky.addColorStop(1, '#f7d38a');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h * 0.62);
    // sol
    soft(x + w * 0.7, y + h * 0.52, Math.max(w, h) * 0.2, 'rgba(255,220,150,0.85)');
    // mar
    const sea = ctx.createLinearGradient(x, y + h * 0.6, x, y + h);
    sea.addColorStop(0, '#1e4f6b');
    sea.addColorStop(1, '#0a2233');
    ctx.fillStyle = sea;
    ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
    // reflexos do sol na água
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(255,200,120,${0.05 + ((i * 7) % 10) / 90})`;
      const wy = y + h * (0.62 + i * 0.017);
      const ww = w * (0.06 + ((i * 13) % 20) / 160);
      ctx.fillRect(x + w * 0.7 - ww / 2 - (i % 3) * w * 0.02, wy, ww, Math.max(1, h * 0.004));
    }
    return;
  }

  if (scene === 'cidade') {
    ctx.fillStyle = '#060a16';
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 12; i++) {
      const bw = w * (0.07 + ((i * 17) % 30) / 300);
      const bh = h * (0.2 + ((i * 29) % 45) / 100);
      const bx = x + w * (i * 0.085);
      ctx.fillStyle = i % 2 ? 'rgba(15,25,45,0.95)' : 'rgba(10,18,34,0.95)';
      ctx.fillRect(bx, y + h - bh, bw, bh);
      // janelas acesas
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 3; c++) {
          if ((i * 7 + r * 3 + c) % 4 === 0) {
            ctx.fillStyle = `rgba(255,205,120,${0.35 + ((r * 13) % 30) / 100})`;
            ctx.fillRect(bx + bw * (0.18 + c * 0.26), y + h - bh + bh * (0.1 + r * 0.12), bw * 0.13, bh * 0.045);
          }
        }
      }
    }
    // bokeh
    for (let i = 0; i < 10; i++) {
      soft(
        x + w * (0.08 + i * 0.095),
        y + h * (0.3 + ((i * 23) % 40) / 100),
        Math.max(w, h) * 0.05,
        i % 2 ? 'rgba(120,200,255,0.35)' : 'rgba(255,180,120,0.3)',
      );
    }
    return;
  }

  if (scene === 'neon') {
    ctx.fillStyle = '#05030f';
    ctx.fillRect(x, y, w, h);
    soft(x + w * 0.2, y + h * 0.25, Math.max(w, h) * 0.4, 'rgba(160,60,255,0.4)');
    soft(x + w * 0.85, y + h * 0.35, Math.max(w, h) * 0.38, 'rgba(0,220,255,0.35)');
    // tubos de neon
    ctx.lineWidth = Math.max(2, w * 0.012);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['rgba(255,60,180,0.7)', 'rgba(60,220,255,0.65)', 'rgba(180,120,255,0.6)'][i];
      ctx.beginPath();
      ctx.moveTo(x + w * (0.05 + i * 0.02), y + h * (0.12 + i * 0.12));
      ctx.lineTo(x + w * (0.35 + i * 0.05), y + h * (0.06 + i * 0.12));
      ctx.stroke();
    }
    // grade do piso
    ctx.strokeStyle = 'rgba(120,80,255,0.28)';
    ctx.lineWidth = Math.max(1, w * 0.003);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x + w * (i / 6), y + h * 0.72);
      ctx.lineTo(x + w * (0.5 + (i / 6 - 0.5) * 2.2), y + h);
      ctx.stroke();
    }
    return;
  }

  if (scene === 'sala') {
    const wall = ctx.createLinearGradient(x, y, x, y + h);
    wall.addColorStop(0, '#2a1e1a');
    wall.addColorStop(1, '#120c0a');
    ctx.fillStyle = wall;
    ctx.fillRect(x, y, w, h);
    // painel ripado
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + w * (i * 0.1), y + h * 0.05, w * 0.05, h * 0.55);
    }
    // abajur
    soft(x + w * 0.85, y + h * 0.32, Math.max(w, h) * 0.3, 'rgba(255,190,120,0.45)');
    ctx.fillStyle = 'rgba(255,215,160,0.5)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.8, y + h * 0.2);
    ctx.lineTo(x + w * 0.9, y + h * 0.2);
    ctx.lineTo(x + w * 0.93, y + h * 0.36);
    ctx.lineTo(x + w * 0.77, y + h * 0.36);
    ctx.closePath();
    ctx.fill();
    // sofá
    ctx.fillStyle = 'rgba(40,45,60,0.85)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.02, y + h * 0.72, w * 0.34, h * 0.26, w * 0.04);
    ctx.fill();
    return;
  }

  if (scene === 'podcast') {
    ctx.fillStyle = '#0c1016';
    ctx.fillRect(x, y, w, h);
    // painéis acústicos
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = (r + c) % 2 ? 'rgba(30,40,52,0.95)' : 'rgba(20,28,38,0.95)';
        ctx.fillRect(x + w * (0.03 + c * 0.16), y + h * (0.04 + r * 0.14), w * 0.14, h * 0.11);
      }
    }
    // microfone
    ctx.fillStyle = 'rgba(10,12,16,0.9)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.08, y + h * 0.5, w * 0.05, h * 0.3, w * 0.02);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.105, y + h * 0.47, w * 0.055, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    soft(x + w * 0.15, y + h * 0.42, Math.max(w, h) * 0.3, 'rgba(255,180,120,0.3)');
    soft(x + w * 0.9, y + h * 0.3, Math.max(w, h) * 0.3, 'rgba(80,180,255,0.28)');
    return;
  }

  if (scene === 'floresta') {
    const forest = ctx.createLinearGradient(x, y, x + w, y + h);
    forest.addColorStop(0, '#0b2416');
    forest.addColorStop(1, '#123d22');
    ctx.fillStyle = forest;
    ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 18; i++) {
      soft(
        x + w * (0.04 + ((i * 37) % 92) / 100),
        y + h * (0.08 + ((i * 53) % 80) / 100),
        Math.max(w, h) * (0.03 + ((i * 11) % 5) / 160),
        i % 3 === 0 ? 'rgba(190,255,180,0.3)' : 'rgba(70,160,90,0.4)',
      );
    }
    // feixe de luz
    ctx.fillStyle = 'rgba(230,255,210,0.07)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.6, y);
    ctx.lineTo(x + w * 0.78, y);
    ctx.lineTo(x + w * 0.95, y + h);
    ctx.lineTo(x + w * 0.62, y + h);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // chroma key
  const key = ctx.createLinearGradient(x, y, x + w, y + h);
  key.addColorStop(0, '#1fae4a');
  key.addColorStop(1, '#15a83f');
  ctx.fillStyle = key;
  ctx.fillRect(x, y, w, h);
  soft(x + w * 0.5, y + h * 0.35, Math.max(w, h) * 0.7, 'rgba(255,255,255,0.14)');
  // pequenas variações para o key funcionar melhor no editor
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#0f8f36' : '#26c257';
    ctx.beginPath();
    ctx.arc(x + w * (((i * 37) % 100) / 100), y + h * (((i * 61) % 100) / 100), Math.max(w, h) * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  void time;
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
