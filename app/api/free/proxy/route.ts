import { NextResponse } from 'next/server';
import { isAllowedFreeUrl } from '@/lib/free-media';

export const runtime = 'nodejs';

/**
 * GET /api/free/proxy?u=… → entrega a miniatura/arquivo da fonte aberta por aqui.
 * Resolve dois problemas reais: hotlink bloqueado (Wikimedia/Iconify) e CORS.
 * Só passa por hosts da lista branca.
 */
export async function GET(request: Request) {
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
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());
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
