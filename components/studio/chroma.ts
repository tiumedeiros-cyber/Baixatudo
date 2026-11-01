/**
 * Chroma key em tempo real no navegador (custo zero de servidor).
 *
 * Usado quando o vídeo do avatar chega de um serviço de IA com fundo verde:
 * o quadro é recortado num canvas fora de tela e o fundo do "Cenário" que já
 * existe no editor aparece por baixo. Se o filtro estiver desligado, o render
 * desenha o vídeo como sempre — nada muda para quem não usa.
 */

export type ChromaColor = 'verde' | 'azul';

export type ChromaOptions = {
  color?: ChromaColor;
  /** 0..1 — quanto do tom de fundo é removido */
  tolerance?: number;
  /** 0..1 — suaviza a borda (cabelo, ombro) */
  softness?: number;
  /** 0..1 — tira o verde/azul que "vaza" na pele e na roupa */
  spill?: number;
};

const DEFAULTS: Required<ChromaOptions> = { color: 'verde', tolerance: 0.42, softness: 0.18, spill: 0.6 };

/** Um canvas reaproveitado por vídeo — sem alocar a cada quadro. */
const canvases = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();

function canvasFor(video: HTMLVideoElement, width: number, height: number) {
  let canvas = canvases.get(video);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvases.set(video, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

/**
 * Recorta o fundo do quadro atual do vídeo e devolve um canvas com transparência.
 * Retorna `null` quando o vídeo ainda não tem quadro pronto (o render então usa
 * o poster, como já fazia).
 */
export function keyFrame(video: HTMLVideoElement, options: ChromaOptions = {}): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (video.readyState < 2 || !video.videoWidth) return null;

  const opts = { ...DEFAULTS, ...options };
  // 720p é suficiente para a prévia e mantém o recorte em ~30 fps no celular
  const maxSide = 1280;
  const ratio = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(2, Math.round(video.videoWidth * ratio));
  const height = Math.max(2, Math.round(video.videoHeight * ratio));

  const canvas = canvasFor(video, width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const px = frame.data;

  // tolerância em distância de cor (0..1 → 0..441 no cubo RGB)
  const tolerance = opts.tolerance * 255;
  const softness = Math.max(1, opts.softness * 255);
  const spill = opts.spill;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    let distance: number;
    if (opts.color === 'azul') {
      distance = b - Math.max(r, g);
    } else {
      // verde: quanto o canal G passa dos outros dois
      distance = g - Math.max(r, b);
    }

    if (distance > tolerance + softness) continue; // objeto: mantém
    if (distance < tolerance) {
      px[i + 3] = 0; // fundo: transparente
      continue;
    }
    // faixa de transição: alfa proporcional (borda do cabelo/ombro)
    const t = (distance - tolerance) / softness;
    px[i + 3] = Math.round(px[i + 3] * t);

    // spill: tira o verde/azul que sobrou na pele
    if (spill > 0 && opts.color === 'verde' && g > r && g > b) {
      px[i + 1] = Math.round(g - (g - Math.max(r, b)) * spill);
    } else if (spill > 0 && opts.color === 'azul' && b > r && b > g) {
      px[i + 2] = Math.round(b - (b - Math.max(r, g)) * spill);
    }
  }

  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/** Só para depurar no console do navegador. */
export function chromaSupport() {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('2d', { willReadFrequently: true }));
}
