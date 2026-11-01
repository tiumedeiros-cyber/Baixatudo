import { NextResponse } from 'next/server';
import { verifySignedUrl } from '@/lib/downloader';

export const runtime = 'nodejs';
export const maxDuration = 300;

const EXT_BY_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function safeName(name: string | null, fallback: string, contentType: string, kind?: string | null) {
  const cleaned = (name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'baixa-tudo';
  if (/\.\w{2,5}$/.test(cleaned)) return cleaned;
  const type = contentType.split(';')[0].trim().toLowerCase();
  const ext = EXT_BY_TYPE[type] || (kind === 'audio' || type.startsWith('audio/') ? 'mp3' : 'mp4');
  return `${cleaned}.${ext}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = searchParams.get('u');
  const sig = searchParams.get('s');
  if (!payload || !sig) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const target = verifySignedUrl(payload, sig);
  if (!target) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 403 });

  // entrega direta: o navegador baixa do servidor de origem (sem passar pela
  // função da Vercel) — evita corte em arquivos grandes. Se a origem exigir o
  // mesmo IP (YouTube), o app usa o modo túnel abaixo.
  if (searchParams.get('d') === '1') {
    return NextResponse.redirect(target, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }

  const range = request.headers.get('range');
  const upstream = await fetch(target, {
    headers: range ? { Range: range } : undefined,
    redirect: 'follow',
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: 'Não foi possível obter o arquivo na origem.' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const name = safeName(searchParams.get('n'), 'baixa-tudo', contentType, searchParams.get('t'));
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  const cr = upstream.headers.get('content-range');
  if (cr) headers.set('Content-Range', cr);
  const accept = upstream.headers.get('accept-ranges');
  if (accept) headers.set('Accept-Ranges', accept);
  headers.set('Cache-Control', 'no-store');

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
