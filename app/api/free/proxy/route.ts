import { NextResponse } from 'next/server';
import { isAllowedFreeUrl } from '@/lib/free-media';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const MAX_BYTES = 12 * 1024 * 1024;

export const runtime = 'nodejs';

/**
 * GET /api/free/proxy?u=… → entrega a miniatura/arquivo da fonte aberta por aqui.
 * Resolve dois problemas reais: hotlink bloqueado (Wikimedia/Iconify) e CORS.
 * Só passa por hosts da lista branca.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`proxy:${clientIp(request.headers)}`, 120, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos.' }, { status: 429 });
  const url = new URL(request.url);
  const target = url.searchParams.get('u') || '';
  if (!target || !isAllowedFreeUrl(target)) {
    return NextResponse.json({ error: 'Endereço não permitido.' }, { status: 400 });
  }
  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'EditorStudio/1.0 (+https://editor-studio-one.vercel.app)', Accept: 'image/*,*/*' },
      cache: 'no-store',
    });
    if (!upstream.ok) return NextResponse.json({ error: `Fonte respondeu ${upstream.status}` }, { status: 502 });
    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
    // só mídia: o proxy não serve para tunelar HTML/JS de terceiros
    if (!/^(image|audio|video)\//.test(contentType)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 415 });
    }
    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return NextResponse.json({ error: 'Arquivo grande demais para a prévia.' }, { status: 413 });
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_BYTES) return NextResponse.json({ error: 'Arquivo grande demais para a prévia.' }, { status: 413 });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar a imagem.' }, { status: 502 });
  }
}
