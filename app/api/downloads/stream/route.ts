import { NextResponse } from 'next/server';
import { verifySignedUrl } from '@/lib/downloader';

export const runtime = 'nodejs';
export const maxDuration = 300;

function safeName(name: string | null, fallback: string) {
  const cleaned = (name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  return /\.\w{2,5}$/.test(cleaned) ? cleaned : `${cleaned}.mp4`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payload = searchParams.get('u');
  const sig = searchParams.get('s');
  if (!payload || !sig) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });

  const target = verifySignedUrl(payload, sig);
  if (!target) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 403 });

  const range = request.headers.get('range');
  const upstream = await fetch(target, {
    headers: range ? { Range: range } : undefined,
    redirect: 'follow',
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: 'Não foi possível obter o arquivo na origem.' }, { status: 502 });
  }

  const name = safeName(searchParams.get('n'), 'baixa-tudo.mp4');
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
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
