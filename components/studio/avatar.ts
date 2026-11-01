'use client';
import { avatarById, shade } from '@/lib/catalog/avatars';
import type { AvatarPreset, SceneId } from '@/lib/catalog/avatars';


/* -------------------------------------------------------------------------- */
/*                        RETRATOS 3D (fundo removido)                        */
/* -------------------------------------------------------------------------- */

type KeyedImage = {
  canvas: HTMLCanvasElement;
  box: { x: number; y: number; w: number; h: number };
};

const keyedCache = new Map<string, KeyedImage | null>();
const KEY_MAX = 1152;

/**
 * Remove o fundo branco do retrato (flood fill a partir das bordas, então
 * blusinhas brancas no meio do personagem não somem) e guarda o recorte.
 */
function buildKeyed(img: HTMLImageElement): KeyedImage | null {
  if (typeof document === 'undefined') return null;
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return null;
  const k = Math.min(1, KEY_MAX / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * k));
  const h = Math.max(1, Math.round(nh * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  const white = (i: number) => {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    return Math.min(r, g, b) > 226 && Math.max(r, g, b) - Math.min(r, g, b) < 24;
  };

  const mask = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (idx: number) => {
    if (idx < 0 || idx >= w * h || mask[idx]) return;
    if (!white(idx * 4)) return;
    mask[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const idx = stack.pop() as number;
    const cx = idx % w;
    const cy = (idx - cx) / w;
    if (cx > 0) push(idx - 1);
    if (cx < w - 1) push(idx + 1);
    if (cy > 0) push(idx - w);
    if (cy < h - 1) push(idx + w);
  }

  // segunda passada: tira o resto de branco "quase puro" colado na borda
  const loose = (i: number) => {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    return Math.min(r, g, b) > 205 && Math.max(r, g, b) - Math.min(r, g, b) < 34;
  };
  const ring: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (mask[idx]) continue;
      if (!loose(idx * 4)) continue;
      if (mask[idx - 1] || mask[idx + 1] || mask[idx - w] || mask[idx + w]) ring.push(idx);
    }
  }
  ring.forEach((idx) => {
    mask[idx] = 1;
  });

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const i = idx * 4;
      if (mask[idx]) {
        px[i + 3] = 0;
        continue;
      }
      // borda: suaviza para não deixar serrilhado branco
      const nearRemoved =
        (x > 0 && mask[idx - 1]) ||
        (x < w - 1 && mask[idx + 1]) ||
        (y > 0 && mask[idx - w]) ||
        (y < h - 1 && mask[idx + w]);
      if (nearRemoved) {
        // come 1px da borda: mata o anel branco que sobra do fundo (sem halo escuro)
        px[i + 3] = 0;
      }
      if (px[i + 3] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return null;
  ctx.putImageData(data, 0, 0);
  return { canvas, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function getKeyed(src?: string): KeyedImage | null {
  if (!src || typeof document === 'undefined') return null;
  if (keyedCache.has(src)) return keyedCache.get(src) ?? null;
  keyedCache.set(src, null); // marca como "carregando"
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => keyedCache.set(src, buildKeyed(img));
  img.onerror = () => keyedCache.set(src, null);
  img.src = src;
  return null;
}

/** Desenha o retrato 3D no quadro; devolve false se ainda não carregou. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: { base: string; mid?: string; talk: string },
  x: number,
  y: number,
  w: number,
  h: number,
  mouth: number,
  time: number,
  framing: string,
) {
  const base = getKeyed(photo.base);
  if (!base) return false;
  const box = base.box;
  const cw = base.canvas.width;
  const ch = base.canvas.height;

  // Busto: a altura do personagem define a escala (os lados podem sair do quadro,
  // como num retrato). Close: amplia no rosto mantendo o topo no topo.
  const scale =
    framing === 'rosto' ? (h * 1.6) / box.h : (h * 0.9) / box.h;
  const dw = cw * scale;
  const dh = ch * scale;
  const cx = x + w / 2 - (box.x + box.w / 2) * scale;
  const cy = framing === 'rosto' ? y + h * 0.08 - box.y * scale : y + h * 1.02 - (box.y + box.h) * scale;

  const bob = Math.sin(time * 1.6) * h * 0.004;
  const breathe = 1 + Math.sin(time * 1.2) * 0.004;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2 + bob);
  ctx.scale(breathe, breathe);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  ctx.drawImage(base.canvas, cx, cy, dw, dh);

  // Leitura labial em 3 estados: fechado → entreaberto → aberto.
  // A mistura é contínua com a amplitude do áudio, então a boca abre e fecha
  // em passos suaves (antes era só "abre/fecha").
  const midImg = photo.mid ? getKeyed(photo.mid) : null;
  const talkImg = getKeyed(photo.talk);
  const t = Math.max(0, Math.min(1, (mouth - 0.08) / 0.72));
  const draw = (img: { canvas: HTMLCanvasElement } | null, alpha: number) => {
    if (!img || alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img.canvas, cx, cy, dw, dh);
    ctx.globalAlpha = 1;
  };

  if (midImg) {
    if (t <= 0.5) {
      draw(midImg, t / 0.5);
    } else {
      draw(midImg, 1);
      draw(talkImg, (t - 0.5) / 0.5);
    }
  } else {
    draw(talkImg, t);
  }
  ctx.restore();
  return true;
}

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
  const framing = a.framing ?? 'rosto';
  const pose = a.pose ?? 'neutro';
  const expression = a.expression ?? 'sorriso';

  // no modo recorte o avatar não escurece o vídeo que está embaixo
  const cutout = (a.scene ?? 'estudio') === 'transparente';

  // Retratos 3D (render estilo Pixar): entram como imagem recortada sobre a cena.
  if (a.photo && drawPhoto(ctx, a.photo, x, y, w, h, open, time, framing)) {
    if (!cutout) {
      const vig = ctx.createRadialGradient(cx, y + h * 0.45, Math.min(w, h) * 0.25, cx, y + h * 0.45, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = vig;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    return;
  }

  // Proporções humanas, por enquadramento:
  //  • rosto  → close-up, o rosto domina o quadro;
  //  • meio   → cabeça grande com busto (retrato de estúdio);
  //  • corpo  → figura inteira com ~7 cabeças de altura.
  // Era isso que faltava para o avatar deixar de parecer "boneco de cabeção".
  const isRosto = framing === 'rosto';
  const figureTop = y + h * (isRosto ? 0.04 : framing === 'meio' ? 0.06 : 0.05);
  const feetY = y + h * 0.968;

  let headW: number;
  let headH: number;
  let headCy: number;
  let shoulderY: number;
  let waistY: number;

  // A cabeça humana é mais alta do que larga (~0.78) e o rosto tem queixo —
  // é o que separa "personagem 3D" de "carinha redonda de criança".
  const headRatio = 0.78;

  if (isRosto) {
    headW = Math.min(w * 0.44, h * 0.36);
    headH = headW / headRatio;
    headCy = y + h * 0.4;
    shoulderY = y + h * 0.94;
    waistY = y + h * 1.18;
  } else if (framing === 'meio') {
    headH = Math.min(h * 0.28, w * 0.68);
    headW = headH * headRatio;
    headCy = figureTop + headH * 0.5;
    shoulderY = headCy + headH * 0.62;
    waistY = y + h * 1.02;
  } else {
    headH = (feetY - figureTop) / 7.4;
    headW = headH * headRatio;
    headCy = figureTop + headH * 0.5;
    shoulderY = headCy + headH * 0.78;
    waistY = figureTop + headH * 3.6;
  }

  const shirtLight = shade(a.shirt, 0.24);
  const shirtDark = shade(a.shirt, -0.34);
  const skinLight = shade(a.skin, 0.1);
  const skinDark = shade(a.skinShadow, -0.2);
  const armW = headW * (isRosto ? 0.3 : 0.26);
  const halfTop = headW * (isRosto ? 1.18 : framing === 'meio' ? 0.9 : 1.0);
  const halfWaist = headW * (isRosto ? 1.55 : framing === 'meio' ? 0.82 : 0.86);

  // Ajuste fino de cada bloco do corpo (todos ancorados em headW/headH).
  const hipY = waistY;
  const torsoTop = shoulderY - headH * (isRosto ? 0.26 : 0.12);

  if (!cutout) {
    const bodyShadow = ctx.createRadialGradient(cx, shoulderY + h * 0.1, headW * 0.2, cx, shoulderY + h * 0.1, headW * 2.4);
    bodyShadow.addColorStop(0, 'rgba(0,0,0,0.34)');
    bodyShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bodyShadow;
    ctx.fillRect(x, y, w, h);
  }

  /* ------------------------------- pescoço --------------------------------- */
  const neckTop = headCy + headH * 0.34;
  const neckBottom = shoulderY + headH * (isRosto ? 0.12 : 0.04);
  const neckGrad = ctx.createLinearGradient(cx, neckTop, cx, neckBottom);
  neckGrad.addColorStop(0, shade(a.skinShadow, -0.12));
  neckGrad.addColorStop(1, skinDark);
  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.roundRect(cx - headW * 0.18, neckTop, headW * 0.36, Math.max(headH * 0.02, neckBottom - neckTop), headW * 0.1);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, neckTop + headH * 0.04, headW * 0.2, headH * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  /* -------------------------------- pernas --------------------------------- */
  const trouser = a.fabric === 'social' ? shade(a.shirt, -0.45) : '#242b38';
  const trouserLight = shade(trouser, 0.26);

  if (framing === 'corpo') {
    const legW = halfWaist * 0.78;
    for (const side of [-1, 1]) {
      const legX = cx + side * halfWaist * 0.42;
      const legTop = hipY - headH * 0.3;
      const legGrad = ctx.createLinearGradient(legX - legW / 2, legTop, legX + legW / 2, legTop);
      legGrad.addColorStop(0, trouserLight);
      legGrad.addColorStop(0.5, trouser);
      legGrad.addColorStop(1, shade(trouser, -0.3));
      ctx.fillStyle = legGrad;
      ctx.beginPath();
      ctx.moveTo(legX - legW / 2, legTop);
      ctx.lineTo(legX + legW / 2, legTop);
      ctx.quadraticCurveTo(legX + legW * 0.42, (legTop + feetY) / 2, legX + legW * 0.30, feetY);
      ctx.lineTo(legX - legW * 0.32, feetY);
      ctx.quadraticCurveTo(legX - legW * 0.44, (legTop + feetY) / 2, legX - legW / 2, legTop);
      ctx.closePath();
      ctx.fill();
      // vinco / costura
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = Math.max(1, headW * 0.012);
      ctx.beginPath();
      ctx.moveTo(legX + side * legW * 0.12, legTop + headH * 0.2);
      ctx.lineTo(legX + side * legW * 0.08, feetY - headH * 0.1);
      ctx.stroke();
      // sapato
      ctx.fillStyle = '#171b22';
      ctx.beginPath();
      ctx.ellipse(legX + side * legW * 0.14, feetY + h * 0.014, legW * 0.64, h * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.ellipse(legX + side * legW * 0.06, feetY + h * 0.004, legW * 0.26, h * 0.008, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* -------------------------------- tronco --------------------------------- */
  const torsoPath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - halfTop, shoulderY + headH * 0.06);
    // ombro esquerdo (arredondado, com trapézio subindo para o pescoço)
    ctx.quadraticCurveTo(cx - halfTop * 1.04, torsoTop + headH * 0.12, cx - halfTop * 0.62, torsoTop + headH * 0.05);
    ctx.quadraticCurveTo(cx - headW * 0.22, torsoTop, cx - headW * 0.2, torsoTop + headH * 0.02);
    ctx.lineTo(cx + headW * 0.2, torsoTop + headH * 0.02);
    ctx.quadraticCurveTo(cx + headW * 0.22, torsoTop, cx + halfTop * 0.62, torsoTop + headH * 0.05);
    ctx.quadraticCurveTo(cx + halfTop * 1.04, torsoTop + headH * 0.12, cx + halfTop, shoulderY + headH * 0.06);
    // lateral direita até o quadril
    ctx.quadraticCurveTo(cx + halfTop * 1.05, shoulderY + (hipY - shoulderY) * 0.55, cx + halfWaist, hipY);
    ctx.lineTo(cx - halfWaist, hipY);
    ctx.quadraticCurveTo(cx - halfTop * 1.05, shoulderY + (hipY - shoulderY) * 0.55, cx - halfTop, shoulderY + headH * 0.06);
    ctx.closePath();
  };

  const torsoGrad = ctx.createLinearGradient(cx - halfTop, shoulderY, cx + halfTop, waistY);
  torsoGrad.addColorStop(0, shirtLight);
  torsoGrad.addColorStop(0.42, a.shirt);
  torsoGrad.addColorStop(1, shirtDark);
  ctx.fillStyle = torsoGrad;
  torsoPath();
  ctx.fill();

  // volume do peito/tecido
  const chest = ctx.createRadialGradient(cx - headW * 0.28, shoulderY + headH * 0.28, headW * 0.1, cx, shoulderY + headH * 0.4, headW * 1.3);
  chest.addColorStop(0, 'rgba(255,255,255,0.1)');
  chest.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = chest;
  torsoPath();
  ctx.fill();

  // sombra projetada do queixo/pescoço no peito (dá profundidade ao busto)
  ctx.save();
  torsoPath();
  ctx.clip();
  const neckShade = ctx.createRadialGradient(cx, torsoTop + headH * 0.02, headW * 0.05, cx, torsoTop + headH * 0.05, headW * 0.85);
  neckShade.addColorStop(0, 'rgba(0,0,0,0.32)');
  neckShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = neckShade;
  ctx.fillRect(cx - halfTop, torsoTop, halfTop * 2, (hipY - torsoTop) * 0.8);

  // luz lateral esquerda + sombra direita (leitura de volume)
  const sideLight = ctx.createLinearGradient(cx - halfTop, 0, cx + halfTop, 0);
  sideLight.addColorStop(0, 'rgba(255,255,255,0.14)');
  sideLight.addColorStop(0.32, 'rgba(255,255,255,0)');
  sideLight.addColorStop(0.78, 'rgba(0,0,0,0.12)');
  sideLight.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = sideLight;
  ctx.fillRect(cx - halfTop, torsoTop, halfTop * 2, hipY - torsoTop);
  ctx.restore();

  // dobras do tecido
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = Math.max(1, headW * 0.016);
  for (const t of [0.42, 0.62, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(cx - halfTop * 0.55 + t * headW * 0.1, shoulderY + (hipY - shoulderY) * t);
    ctx.quadraticCurveTo(cx, shoulderY + (hipY - shoulderY) * (t + 0.03), cx + halfTop * 0.5, shoulderY + (hipY - shoulderY) * t);
    ctx.stroke();
  }

  // gola (acompanha o topo do tronco)
  ctx.fillStyle = shade(a.shirt, -0.42);
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.33, torsoTop + headH * 0.02);
  ctx.quadraticCurveTo(cx, torsoTop + headH * 0.34, cx + headW * 0.33, torsoTop + headH * 0.02);
  ctx.quadraticCurveTo(cx, torsoTop + headH * 0.16, cx - headW * 0.33, torsoTop + headH * 0.02);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(1, headW * 0.018);
  ctx.beginPath();
  ctx.moveTo(cx - headW * 0.35, torsoTop + headH * 0.01);
  ctx.quadraticCurveTo(cx, torsoTop + headH * 0.35, cx + headW * 0.35, torsoTop + headH * 0.01);
  ctx.stroke();

  if (a.fabric === 'social') {
    ctx.fillStyle = shade(a.shirt, -0.2);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * headW * 0.32, torsoTop + headH * 0.02);
      ctx.lineTo(cx + side * halfTop * 0.8, hipY);
      ctx.lineTo(cx + side * headW * 0.46, hipY);
      ctx.closePath();
      ctx.fill();
    }
  }

  // estampa (só nas camisetas claras, como na referência)
  if (a.fabric === 'algodao' && framing !== 'rosto') {
    ctx.save();
    torsoPath();
    ctx.clip();
    ctx.fillStyle = 'rgba(20,20,25,0.72)';
    ctx.font = `900 ${Math.round(headW * 0.24)}px Anton, Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ANOX', cx, shoulderY + (hipY - shoulderY) * 0.5);
    ctx.strokeStyle = 'rgba(20,20,25,0.6)';
    ctx.lineWidth = Math.max(1, headW * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.2, shoulderY + (waistY - shoulderY) * 0.42);
    ctx.lineTo(cx + headW * 0.2, shoulderY + (waistY - shoulderY) * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------- braços ---------------------------------- */
  const stroke = (
    from: [number, number],
    to: [number, number],
    color: string,
    width: number,
    bend = 0,
    outline?: string,
  ) => {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      const mx = (from[0] + to[0]) / 2;
      const my = (from[1] + to[1]) / 2;
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      ctx.quadraticCurveTo(mx - (dy / len) * bend, my + (dx / len) * bend, to[0], to[1]);
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (outline) {
      // contorno: separa o braço do tronco (silhueta legível)
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + Math.max(2, width * 0.16);
      path();
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    path();
    ctx.stroke();
  };

  const hand = (hx: number, hy: number, kind: 'punho' | 'joinha' | 'apontar' | 'aberta', rotation = 0) => {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(rotation);
    const r = armW * 0.62;
    const palm = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.2);
    palm.addColorStop(0, shade(a.skin, 0.14));
    palm.addColorStop(1, a.skinShadow);
    const fill = () => {
      ctx.fillStyle = palm;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.stroke();
    };

    // palma / dorso
    ctx.beginPath();
    ctx.ellipse(0, r * 0.2, r * 0.8, r * 0.95, 0, 0, Math.PI * 2);
    fill();

    if (kind === 'aberta') {
      for (let i = 0; i < 4; i++) {
        const fx = -r * 0.52 + i * r * 0.35;
        const len = r * (1.5 - Math.abs(i - 1.4) * 0.16);
        ctx.beginPath();
        ctx.roundRect(fx - r * 0.13, -len, r * 0.26, len + r * 0.4, r * 0.13);
        fill();
      }
      // polegar
      ctx.beginPath();
      ctx.roundRect(-r * 0.95, -r * 0.2, r * 0.3, r * 0.8, r * 0.14);
      fill();
    } else {
      // dedos fechados
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(-r * 0.5 + i * r * 0.34, r * 0.86, r * 0.19, r * 0.24, 0, 0, Math.PI * 2);
        fill();
      }
      // polegar dobrado
      ctx.beginPath();
      ctx.ellipse(-r * 0.66, r * 0.18, r * 0.24, r * 0.32, -0.5, 0, Math.PI * 2);
      fill();

      if (kind === 'joinha') {
        ctx.beginPath();
        ctx.roundRect(r * 0.28, -r * 1.25, r * 0.4, r * 1.1, r * 0.2);
        fill();
      }
      if (kind === 'apontar') {
        ctx.beginPath();
        ctx.roundRect(r * 0.45, -r * 0.25, r * 1.5, r * 0.34, r * 0.16);
        fill();
      }
    }
    ctx.restore();
  };

  /** Bainha da manga: fecha o tubo no cotovelo (evita "braço de boneco"). */
  const sleeveHem = (elbow: [number, number], wrist: [number, number], width: number) => {
    const dx = wrist[0] - elbow[0];
    const dy = wrist[1] - elbow[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.strokeStyle = a.shirt;
    ctx.lineCap = 'round';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(elbow[0], elbow[1]);
    ctx.lineTo(elbow[0] + nx * width * 0.001, elbow[1] + ny * width * 0.001);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = Math.max(1, width * 0.05);
    ctx.beginPath();
    ctx.moveTo(elbow[0] + nx * width * 0.5 + dx * 0.06, elbow[1] + ny * width * 0.5 + dy * 0.06);
    ctx.lineTo(elbow[0] - nx * width * 0.5 + dx * 0.06, elbow[1] - ny * width * 0.5 + dy * 0.06);
    ctx.stroke();
  };

  const elbowY = shoulderY + (hipY - shoulderY) * (framing === 'corpo' ? 0.6 : 0.5);
  const wristY =
    framing === 'corpo' ? hipY + headH * 0.5 : shoulderY + headH * (isRosto ? 0.5 : 1.3);
  const shoulderL: [number, number] = [cx - halfTop * 0.76, torsoTop + headH * 0.2];
  const shoulderR: [number, number] = [cx + halfTop * 0.76, torsoTop + headH * 0.2];

  /** Costura do ombro: separa a manga do tronco sem inflar a silhueta. */
  const shoulderCap = (side: number) => {
    const sx = cx + side * halfTop * 0.9;
    const sy = torsoTop + headH * 0.16;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = Math.max(1, headW * 0.012);
    ctx.beginPath();
    ctx.moveTo(sx - side * armW * 0.3, sy - armW * 0.9);
    ctx.quadraticCurveTo(sx + side * armW * 0.45, sy, sx - side * armW * 0.15, sy + armW * 1.1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(sx - side * armW * 0.42, sy - armW * 0.8);
    ctx.quadraticCurveTo(sx + side * armW * 0.2, sy - armW * 0.1, sx - side * armW * 0.3, sy + armW * 0.7);
    ctx.stroke();
  };

  const tattooArm = (from: [number, number], to: [number, number]) => {
    if (!a.tattoos) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(28,20,18,0.34)';
    ctx.lineWidth = Math.max(1, armW * 0.055);
    ctx.lineCap = 'round';
    for (let i = 1; i <= 3; i++) {
      const t = 0.28 + i * 0.18;
      const px = from[0] + (to[0] - from[0]) * t;
      const py = from[1] + (to[1] - from[1]) * t;
      ctx.beginPath();
      ctx.moveTo(px - armW * 0.2, py - armW * 0.16);
      ctx.quadraticCurveTo(px, py, px - armW * 0.14, py + armW * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px + armW * 0.06, py + armW * 0.02, armW * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  for (const side of [-1, 1]) {
    const shoulder = side < 0 ? shoulderL : shoulderR;
    shoulderCap(side);

    if (pose === 'cruzado') {
      const elbow: [number, number] = [cx + side * halfTop * 1.0, shoulderY + (hipY - shoulderY) * 0.3];
      const wrist: [number, number] = [cx - side * headW * 0.3, shoulderY + (hipY - shoulderY) * 0.5];
      stroke(shoulder, elbow, a.shirt, armW * 1.45, 0, shade(a.shirt, -0.5));
      sleeveHem(elbow, wrist, armW * 1.45);
      stroke(elbow, wrist, a.skin, armW * 1.08, side * headW * 0.12, shade(a.skinShadow, -0.3));
      tattooArm(elbow, wrist);
      hand(wrist[0], wrist[1], 'punho', side * 0.5);
      continue;
    }

    if (pose === 'bolso') {
      const elbow: [number, number] = [cx + side * halfTop * 1.04, elbowY];
      const wrist: [number, number] = [cx + side * halfWaist * 0.74, hipY - headH * 0.16];
      stroke(shoulder, elbow, a.shirt, armW * 1.45, 0, shade(a.shirt, -0.5));
      sleeveHem(elbow, wrist, armW * 1.45);
      stroke(elbow, wrist, a.skin, armW * 1.1, side * headW * 0.04, shade(a.skinShadow, -0.3));
      hand(wrist[0], wrist[1], 'punho', side * 0.3);
      continue;
    }

    if (side > 0 && pose === 'joinha') {
      const elbow: [number, number] = [cx + halfTop * 1.02, shoulderY + (hipY - shoulderY) * 0.42];
      const wrist: [number, number] = [cx + halfTop * 0.5, shoulderY + (hipY - shoulderY) * 0.1];
      stroke(shoulder, elbow, a.shirt, armW * 1.45, 0, shade(a.shirt, -0.5));
      sleeveHem(elbow, wrist, armW * 1.45);
      stroke(elbow, wrist, a.skin, armW * 1.08, -headW * 0.1, shade(a.skinShadow, -0.3));
      tattooArm(elbow, wrist);
      hand(wrist[0], wrist[1], 'joinha', -0.18);
      continue;
    }

    if (side > 0 && pose === 'apontando') {
      const elbow: [number, number] = [cx + halfTop * 0.98, shoulderY + (hipY - shoulderY) * 0.5];
      const wrist: [number, number] = [cx + halfTop * 0.92, shoulderY + (hipY - shoulderY) * 0.78];
      stroke(shoulder, elbow, a.shirt, armW * 1.45, 0, shade(a.shirt, -0.5));
      sleeveHem(elbow, wrist, armW * 1.45);
      stroke(elbow, wrist, a.skin, armW * 1.08, headW * 0.06, shade(a.skinShadow, -0.3));
      tattooArm(elbow, wrist);
      hand(wrist[0], wrist[1], 'apontar', 1.1);
      continue;
    }

    if (side > 0 && pose === 'acenando') {
      const elbow: [number, number] = [cx + halfTop * 1.16, shoulderY + headH * 0.06];
      const wrist: [number, number] = [cx + halfTop * 1.18, shoulderY - headH * 0.62];
      stroke(shoulder, elbow, a.shirt, armW * 1.45, 0, shade(a.shirt, -0.5));
      sleeveHem(elbow, wrist, armW * 1.45);
      stroke(elbow, wrist, a.skin, armW * 1.08, headW * 0.05, shade(a.skinShadow, -0.3));
      tattooArm(elbow, wrist);
      hand(wrist[0], wrist[1], 'aberta', 0.35);
      continue;
    }

    // pose natural: braços caem junto ao corpo
    const elbow: [number, number] = [cx + side * halfTop * 1.09, elbowY];
    const wrist: [number, number] = [cx + side * halfTop * 1.02, wristY];
    stroke(shoulder, elbow, a.shirt, armW * 1.5, 0, shade(a.shirt, -0.5));
    sleeveHem(elbow, wrist, armW * 1.5);
    stroke(elbow, wrist, a.skin, armW * 1.12, side * headW * 0.03, shade(a.skinShadow, -0.3));
    tattooArm(elbow, wrist);
    if (a.watch && side < 0) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.roundRect(wrist[0] - armW * 0.2, wrist[1] - armW * 0.42, armW * 0.4, armW * 0.34, armW * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,200,255,0.55)';
      ctx.beginPath();
      ctx.roundRect(wrist[0] - armW * 0.13, wrist[1] - armW * 0.36, armW * 0.26, armW * 0.22, armW * 0.04);
      ctx.fill();
    }
    hand(wrist[0], wrist[1], 'punho', side * 0.3);
  }

  if (a.chain) {
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = Math.max(1.5, headW * 0.028);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.24, torsoTop + headH * 0.06);
    ctx.quadraticCurveTo(cx, torsoTop + headH * 0.36, cx + headW * 0.24, torsoTop + headH * 0.06);
    ctx.stroke();
    ctx.fillStyle = '#f3d67a';
    ctx.beginPath();
    ctx.arc(cx, torsoTop + headH * 0.26, headW * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

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
  // contorno do rosto: têmpora → maçã do rosto → mandíbula → queixo
  const facePath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.5, headCy - headH * 0.16);
    ctx.quadraticCurveTo(cx - headW * 0.52, headCy + headH * 0.14, cx - headW * 0.34, headCy + headH * 0.3);
    ctx.quadraticCurveTo(cx - headW * 0.2, headCy + headH * 0.47, cx, headCy + headH * 0.5);
    ctx.quadraticCurveTo(cx + headW * 0.2, headCy + headH * 0.47, cx + headW * 0.34, headCy + headH * 0.3);
    ctx.quadraticCurveTo(cx + headW * 0.52, headCy + headH * 0.14, cx + headW * 0.5, headCy - headH * 0.16);
    ctx.quadraticCurveTo(cx + headW * 0.44, headCy - headH * 0.5, cx, headCy - headH * 0.5);
    ctx.quadraticCurveTo(cx - headW * 0.44, headCy - headH * 0.5, cx - headW * 0.5, headCy - headH * 0.16);
    ctx.closePath();
  };

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
  facePath();
  ctx.fill();

  // têmporas/maçãs levemente rosadas
  ctx.fillStyle = 'rgba(206,104,96,0.08)';
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
  facePath();
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
    // calota do cabelo seguindo o crânio, com linha de implantação (não é elmo)
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.5, headCy - headH * 0.02);
    ctx.quadraticCurveTo(cx - headW * 0.53, headCy - headH * 0.42, cx, headCy - headH * 0.52);
    ctx.quadraticCurveTo(cx + headW * 0.53, headCy - headH * 0.42, cx + headW * 0.5, headCy - headH * 0.02);
    ctx.quadraticCurveTo(cx + headW * 0.42, headCy - headH * 0.1, cx + headW * 0.3, headCy - headH * 0.16);
    ctx.quadraticCurveTo(cx + headW * 0.12, headCy - headH * 0.24, cx - headW * 0.04, headCy - headH * 0.2);
    ctx.quadraticCurveTo(cx - headW * 0.28, headCy - headH * 0.18, cx - headW * 0.5, headCy - headH * 0.02);
    ctx.closePath();
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
    ctx.ellipse(cx - headW * 0.16, headCy - headH * 0.37, headW * 0.22, headH * 0.045, -0.32, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.14, headCy - headH * 0.28, headW * 0.2, headH * 0.07, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  /* -------------------------------- sobrancelhas ---------------------------- */
  const browLift = expression === 'surpreso' ? 0.055 : expression === 'serio' ? -0.005 : 0;
  const browInner = expression === 'serio' ? 0.035 : expression === 'surpreso' ? 0.02 : 0;
  ctx.strokeStyle = a.browColor ? a.browColor : shade(a.hairColor, 0.08);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.6, headW * (a.gender === 'm' ? 0.05 : 0.04));
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * headW * 0.33, headCy - headH * (0.09 + browLift));
    ctx.quadraticCurveTo(
      cx + s * headW * 0.24,
      headCy - headH * (0.16 + browLift),
      cx + s * headW * 0.12,
      headCy - headH * (0.12 + browLift) + headH * browInner,
    );
    ctx.stroke();
  }

  /* ----------------------------------- olhos -------------------------------- */
  const eyeY = headCy - headH * 0.005;
  const eyeR = headW * 0.105;
  const eyeOpen = expression === 'surpreso' ? 1.2 : expression === 'serio' ? 0.74 : 1;
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
    ctx.ellipse(ex, eyeY, eyeR, Math.max(0.6, eyeR * 0.6 * blink * eyeOpen), 0, 0, Math.PI * 2);
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
  // cantos da boca: sorriso sobe, sério desce
  const cornerY = mouthY + (expression === 'serio' ? headH * 0.02 : expression === 'sorriso' ? -headH * 0.016 : 0);

  if (a.beard) {
    // barba desenhada no contorno do maxilar (não é uma máscara no rosto todo)
    const beardColor = shade(a.hairColor, 0.06);
    ctx.save();
    ctx.fillStyle = beardColor;
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.47, headCy + headH * 0.02);
    ctx.quadraticCurveTo(cx - headW * 0.46, headCy + headH * 0.33, cx - headW * 0.19, headCy + headH * 0.44);
    ctx.quadraticCurveTo(cx, headCy + headH * 0.5, cx + headW * 0.19, headCy + headH * 0.44);
    ctx.quadraticCurveTo(cx + headW * 0.46, headCy + headH * 0.33, cx + headW * 0.47, headCy + headH * 0.02);
    // recorte das bochechas
    ctx.lineTo(cx + headW * 0.3, headCy + headH * 0.04);
    ctx.quadraticCurveTo(cx + headW * 0.27, headCy + headH * 0.26, cx + headW * 0.11, headCy + headH * 0.31);
    ctx.quadraticCurveTo(cx, headCy + headH * 0.25, cx - headW * 0.11, headCy + headH * 0.31);
    ctx.quadraticCurveTo(cx - headW * 0.27, headCy + headH * 0.26, cx - headW * 0.3, headCy + headH * 0.04);
    ctx.closePath();
    ctx.fill();

    // bigode
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.2, mouthY - headH * 0.02);
    ctx.quadraticCurveTo(cx - headW * 0.1, mouthY - headH * 0.07, cx, mouthY - headH * 0.045);
    ctx.quadraticCurveTo(cx + headW * 0.1, mouthY - headH * 0.07, cx + headW * 0.2, mouthY - headH * 0.02);
    ctx.quadraticCurveTo(cx + headW * 0.1, mouthY + headH * 0.02, cx, mouthY);
    ctx.quadraticCurveTo(cx - headW * 0.1, mouthY + headH * 0.02, cx - headW * 0.2, mouthY - headH * 0.02);
    ctx.fill();

    // textura
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 70; i++) {
      const px = cx - headW * 0.42 + ((i * 37) % 84) * headW * 0.01;
      const py = headCy + headH * 0.06 + ((i * 53) % 80) * headH * 0.0045;
      ctx.beginPath();
      ctx.arc(px, py, headW * 0.005, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // lábio superior
  ctx.fillStyle = a.lipstick ? shade(a.lipstick, -0.1) : 'rgba(150,70,75,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx - mouthW / 2, cornerY);
  ctx.quadraticCurveTo(cx - mouthW * 0.25, mouthY - mouthH * 0.55, cx, mouthY - mouthH * 0.18);
  ctx.quadraticCurveTo(cx + mouthW * 0.25, mouthY - mouthH * 0.55, cx + mouthW / 2, cornerY);
  ctx.quadraticCurveTo(cx, mouthY - mouthH * 0.05, cx - mouthW / 2, cornerY);
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

  /* --------------------------- acessórios de cena --------------------------- */
  if (a.tattoos) {
    // marcação no rosto (como na referência)
    ctx.save();
    ctx.strokeStyle = 'rgba(40,26,22,0.55)';
    ctx.lineWidth = Math.max(1, headW * 0.012);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - headW * 0.34 + i * headW * 0.03, headCy - headH * 0.2 + i * headH * 0.012);
      ctx.lineTo(cx - headW * 0.28 + i * headW * 0.03, headCy - headH * 0.17 + i * headH * 0.014);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx - headW * 0.3, headCy + headH * 0.1, headW * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,26,22,0.5)';
    ctx.fill();
    ctx.restore();
  }

  if (a.headphones) {
    // headset gamer com RGB
    const bandY = headCy - headH * 0.52;
    ctx.strokeStyle = '#15181f';
    ctx.lineWidth = Math.max(3, headW * 0.075);
    ctx.beginPath();
    ctx.arc(cx, headCy - headH * 0.02, headW * 0.58, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,140,255,0.35)';
    ctx.lineWidth = Math.max(1, headW * 0.02);
    ctx.beginPath();
    ctx.arc(cx, headCy - headH * 0.02, headW * 0.62, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    for (const side of [-1, 1]) {
      const cupX = cx + side * headW * 0.56;
      const cupY = headCy + headH * 0.04;
      const cupGrad = ctx.createLinearGradient(cupX, cupY - headH * 0.14, cupX, cupY + headH * 0.14);
      cupGrad.addColorStop(0, '#232838');
      cupGrad.addColorStop(1, '#0d1017');
      ctx.fillStyle = cupGrad;
      ctx.beginPath();
      ctx.roundRect(cupX - headW * 0.13, cupY - headH * 0.16, headW * 0.26, headH * 0.32, headW * 0.08);
      ctx.fill();
      // anel RGB
      ctx.strokeStyle = side < 0 ? 'rgba(255,60,180,0.85)' : 'rgba(60,220,255,0.85)';
      ctx.lineWidth = Math.max(1.5, headW * 0.028);
      ctx.beginPath();
      ctx.roundRect(cupX - headW * 0.1, cupY - headH * 0.12, headW * 0.2, headH * 0.24, headW * 0.06);
      ctx.stroke();
    }
  }

  /* ------------------------------ luz de recorte ---------------------------- */
  const rim = ctx.createLinearGradient(cx - headW * 0.55, 0, cx + headW * 0.62, 0);
  rim.addColorStop(0, 'rgba(255,255,255,0.16)');
  rim.addColorStop(0.35, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(120,200,255,0.12)');
  ctx.fillStyle = rim;
  facePath();
  ctx.fill();

  // vinheta do quadro (não no modo recorte)
  if (!cutout) {
    const vig = ctx.createRadialGradient(cx, y + h * 0.45, Math.min(w, h) * 0.25, cx, y + h * 0.45, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
  }

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
  setup: '/scenes/setup.jpg',
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

  // cenário transparente: nada é desenhado, o avatar entra por cima das outras trilhas
  if (scene === 'transparente') return;

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

  if (scene === 'setup') {
    ctx.fillStyle = '#05070d';
    ctx.fillRect(x, y, w, h);
    // brilho RGB da mesa
    soft(x + w * 0.3, y + h * 0.72, Math.max(w, h) * 0.45, 'rgba(120,40,220,0.55)');
    soft(x + w * 0.72, y + h * 0.68, Math.max(w, h) * 0.4, 'rgba(0,180,255,0.45)');
    soft(x + w * 0.85, y + h * 0.5, Math.max(w, h) * 0.22, 'rgba(255,60,120,0.4)');
    // monitores
    ctx.fillStyle = 'rgba(10,14,24,0.95)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.08, y + h * 0.36, w * 0.34, h * 0.2, w * 0.01);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,120,255,0.35)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.1, y + h * 0.38, w * 0.3, h * 0.16, w * 0.008);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,24,0.95)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.46, y + h * 0.32, w * 0.3, h * 0.24, w * 0.01);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,200,140,0.28)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.48, y + h * 0.34, w * 0.26, h * 0.2, w * 0.008);
    ctx.fill();
    // mesa e teclado RGB
    ctx.fillStyle = 'rgba(12,16,26,0.98)';
    ctx.fillRect(x, y + h * 0.74, w, h * 0.26);
    for (let i = 0; i < 22; i++) {
      const hue = (i / 22) * 360;
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.55)`;
      ctx.fillRect(x + w * (0.22 + (i % 11) * 0.035), y + h * (0.8 + Math.floor(i / 11) * 0.03), w * 0.028, h * 0.014);
    }
    // gabinete com fans
    ctx.fillStyle = 'rgba(8,10,16,0.95)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.8, y + h * 0.42, w * 0.18, h * 0.34, w * 0.01);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['rgba(255,80,180,0.8)', 'rgba(120,80,255,0.8)', 'rgba(60,220,255,0.8)'][i];
      ctx.lineWidth = Math.max(2, w * 0.008);
      ctx.beginPath();
      ctx.arc(x + w * 0.89, y + h * (0.5 + i * 0.09), w * 0.045, 0, Math.PI * 2);
      ctx.stroke();
    }
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
