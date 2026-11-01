/**
 * Fundo verde para o avatar falante.
 *
 * O serviço de sincronização labial (SadTalker) devolve um vídeo com o fundo da
 * foto que enviamos. Para o avatar entrar "dentro" do cenário escolhido no
 * editor (Escritório, Estúdio…), a foto vai para o Space já recortada e
 * recomposta sobre verde #00FF00 — depois o chroma key do render
 * (`components/studio/chroma.ts`) apaga esse verde no navegador, de graça.
 *
 * O recorte é por cor de borda + flood fill: só sai o fundo conectado à borda,
 * então rosto, cabelo, óculos e roupa ficam. Fundos lisos (branco de estúdio,
 * cinza, verde, azul) saem inteiros; fundos muito detalhados saem em parte —
 * nesse caso ainda vale a pena (o resto do cenário aparece em volta).
 */

export type GreenScreenResult = {
  /** PNG com fundo #00FF00 */
  png: Buffer;
  /** quanto do quadro virou fundo (0..100) */
  removedPercent: number;
  /** distância de cor usada como corte (diagnóstico) */
  limit: number;
  /** cor de fundo detectada nas bordas */
  background: [number, number, number];
};

const MAX_SIDE = 1024;
const MIN_LIMIT = 24;
const MAX_LIMIT = 60;

/** Recorta o fundo da foto e devolve um PNG 1024 px sobre #00FF00. */
export async function greenScreenImage(input: Buffer, tolerance = 40): Promise<GreenScreenResult> {
  const sharp = (await import('sharp')).default;

  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const px = Buffer.from(data);
  const step = channels;

  // --- cor de fundo: mediana das bordas (ignora um canto com sombra) ---------
  const samples: [number, number, number][] = [];
  const sampleAt = (x: number, y: number) => {
    const o = (y * width + x) * step;
    samples.push([px[o], px[o + 1], px[o + 2]]);
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 80))) {
    sampleAt(x, 0);
    sampleAt(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 80))) {
    sampleAt(0, y);
    sampleAt(width - 1, y);
  }
  const median = (channel: number) => {
    const values = samples.map((s) => s[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  const ref: [number, number, number] = [median(0), median(1), median(2)];

  // espalhamento das bordas: fundo com degradê aceita um corte um pouco maior,
  // mas nunca tanto a ponto de "comer" roupa clara (era o bug do corte largo).
  const spread = samples.reduce((acc, [r, g, b]) => {
    const d = Math.sqrt((r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2);
    return Math.max(acc, d);
  }, 0);
  const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.max(tolerance, spread * 1.15)));
  const limitSq = limit * limit;

  const total = width * height;
  const isBackground = (index: number) => {
    const o = index * step;
    const dr = px[o] - ref[0];
    const dg = px[o + 1] - ref[1];
    const db = px[o + 2] - ref[2];
    return dr * dr + dg * dg + db * db <= limitSq;
  };

  // --- flood fill a partir das quatro bordas --------------------------------
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const push = (index: number) => {
    if (index < 0 || index >= total || visited[index]) return;
    visited[index] = 1;
    if (!isBackground(index)) return;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + (width - 1));
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index - x) / width;
    px[index * step + 3] = 0;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  // --- suaviza 1 px de borda (cabelo/ombro sem serrilhado) ------------------
  const alpha = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) alpha[i] = px[i * step + 3];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (alpha[index] === 0) continue;
      let transparent = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (alpha[index + dy * width + dx] === 0) transparent += 1;
        }
      }
      if (transparent) px[index * step + 3] = Math.min(px[index * step + 3], Math.max(60, 255 - transparent * 70));
    }
  }

  const removedPercent = Math.round((visited.subarray(0, total).reduce((acc, v, i) => acc + (px[i * step + 3] === 0 ? 1 : 0), 0) / total) * 1000) / 10;

  const png = await sharp(px, { raw: { width, height, channels } })
    .flatten({ background: { r: 0, g: 255, b: 0 } })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { png, removedPercent, limit, background: ref };
}
