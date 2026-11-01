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
    const { removeBackground } = await import('@/lib/cutout');
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const cut = removeBackground(Buffer.from(data), width, height, channels, tolerance);
    const png = await sharp(cut.data, { raw: { width, height, channels } }).png({ compressionLevel: 9 }).toBuffer();

    return NextResponse.json({
      ok: true,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      bytes: png.length,
      width,
      height,
      removedPercent: cut.removedPercent,
      background: `rgb(${cut.medianColor.join(',')})`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Não foi possível processar a imagem (${err instanceof Error ? err.message : 'erro'}).` },
      { status: 500 },
    );
  }
}
