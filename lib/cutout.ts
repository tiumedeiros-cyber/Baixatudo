/**
 * Remoção de fundo por cor de borda (sem modelo de IA para baixar).
 *
 * 1. Lê a cor média das bordas da imagem — o fundo real da foto, não um branco fixo.
 * 2. Flood fill a partir das bordas removendo tudo que é parecido com essa cor.
 * 3. Suaviza a máscara em 1 px para o recorte não ficar serrilhado.
 *
 * Funciona com fundo liso de qualquer cor (branco de estúdio, cinza, verde,
 * azul, degradê suave) e preserva o objeto porque o preenchimento só avança
 * enquanto a cor continua parecida com a borda.
 */

export type CutoutResult = {
  data: Buffer;
  removedPercent: number;
  medianColor: [number, number, number];
};

const FEATHER = 0.35;

export function removeBackground(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  tolerance: number,
): CutoutResult {
  const total = width * height;
  const step = channels;

  // --- cor de referência: mediana das bordas (evita sombra de um canto só) ---
  const samples: number[][] = [];
  const sampleAt = (x: number, y: number) => {
    const offset = (y * width + x) * step;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  const stepX = Math.max(1, Math.floor(width / 60));
  const stepY = Math.max(1, Math.floor(height / 60));
  for (let x = 0; x < width; x += stepX) {
    sampleAt(x, 0);
    sampleAt(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sampleAt(0, y);
    sampleAt(width - 1, y);
  }
  const median = (index: number) => {
    const values = samples.map((sample) => sample[index]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  const [refR, refG, refB] = [median(0), median(1), median(2)];

  // espalhamento das bordas: fundo com degradê precisa de tolerância maior
  const spread =
    samples.reduce((acc, sample) => {
      const d = Math.sqrt((sample[0] - refR) ** 2 + (sample[1] - refG) ** 2 + (sample[2] - refB) ** 2);
      return Math.max(acc, d);
    }, 0) || 0;
  const limit = Math.min(180, Math.max(tolerance, spread * 1.6 + 12));

  const limitSq = limit * limit;
  const isBackground = (index: number) => {
    const offset = index * step;
    const dr = data[offset] - refR;
    const dg = data[offset + 1] - refG;
    const db = data[offset + 2] - refB;
    return dr * dr + dg * dg + db * db <= limitSq;
  };

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
    const offset = index * step;
    data[offset + 3] = 0;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  // --- suaviza a borda do recorte (1 px) usando o alpha dos vizinhos ---
  const alpha = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) alpha[i] = data[i * step + 3];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (alpha[index] === 0) continue;
      let transparentNeighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (alpha[index + dy * width + dx] === 0) transparentNeighbours += 1;
        }
      }
      if (transparentNeighbours > 0) {
        const soft = Math.max(0, 255 - transparentNeighbours * (255 * FEATHER));
        data[index * step + 3] = Math.min(data[index * step + 3], soft);
      }
    }
  }

  return {
    data,
    removedPercent: Math.round((tail / total) * 100),
    medianColor: [refR, refG, refB],
  };
}
