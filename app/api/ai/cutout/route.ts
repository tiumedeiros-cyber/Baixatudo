import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * POST /api/ai/cutout — remove fundo claro (branco/estúdio) da imagem.
 *
 * Roda no servidor com `sharp`, sem modelo de IA para baixar: resposta em
 * ~300 ms e sem depender da rede do cliente. Flood fill a partir das bordas,
 * então só o fundo realmente conectado à borda sai — produto/objeto fica.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const limit = rateLimit(`cutout:${user.id}:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos recortes seguidos. Aguarde um minuto.' }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Envie a imagem no campo "file".' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Imagem inválida.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Imagem acima de 12 MB.' }, { status: 413 });

  const tolerance = Math.min(120, Math.max(10, Number(form.get('tolerance') || 42)));
  const input = Buffer.from(await file.arrayBuffer());

  try {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const isBackground = (index: number) => {
      const offset = index * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      return min >= 255 - tolerance && max - min <= Math.max(26, tolerance / 2);
    };

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
      const offset = index * channels;
      data[offset + 3] = 0; // transparente
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    const transparent = tail;
    const png = await sharp(data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();

    return NextResponse.json({
      ok: true,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      bytes: png.length,
      width,
      height,
      removedPercent: Math.round((transparent / total) * 100),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Não foi possível processar a imagem (${err instanceof Error ? err.message : 'erro'}).` },
      { status: 500 },
    );
  }
}
