import { NextResponse } from 'next/server';
import { DOWNLOAD_ENGINE_URL } from '@/lib/env';
import { requestDownload } from '@/lib/downloader';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/downloads/diagnose?url=...&k=...
 * Diagnóstico do Baixa Tudo em produção: fala com o motor, lista os itens e
 * confirma se o servidor consegue baixar o arquivo (sem expor os links).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = rateLimit(`diag:${clientIp(request.headers)}`, 5, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'aguarde' }, { status: 429 });
  const url = searchParams.get('url');
  if (url && !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//.test(url)) {
    return NextResponse.json({ error: 'diagnóstico restrito a links do YouTube' }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: 'informe ?url=' }, { status: 400 });

  const started = Date.now();
  let result: Awaited<ReturnType<typeof requestDownload>>;
  try {
    result = await requestDownload(url, { audio: searchParams.get('audio') === '1' });
  } catch (err) {
    return NextResponse.json({ engine: DOWNLOAD_ENGINE_URL, error: err instanceof Error ? err.message : 'erro' });
  }

  if (!result.ok) {
    return NextResponse.json({ engine: DOWNLOAD_ENGINE_URL, ok: false, error: result.error, ms: Date.now() - started });
  }

  const host = (u: string) => {
    try {
      return new URL(u).hostname;
    } catch {
      return '?';
    }
  };

  // Sonda leve: lê só o primeiro pedaço do arquivo e corta em 25 s.
  // Serve para saber se o túnel entrega bytes de verdade a partir da Vercel.
  const probe = async (target: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    const t0 = Date.now();
    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: '*/*',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const firstByteMs = Date.now() - t0;
      if (!res.body) {
        return { status: res.status, firstByteMs, contentType: res.headers.get('content-type'), empty: true };
      }
      const reader = res.body.getReader();
      const { value } = await reader.read();
      await reader.cancel().catch(() => {});
      const buf = Buffer.from(value ?? []);
      return {
        status: res.status,
        firstByteMs,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        contentRange: res.headers.get('content-range'),
        bytes: buf.length,
        head: buf.subarray(0, 8).toString('hex'),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'erro', ms: Date.now() - t0 };
    } finally {
      clearTimeout(timer);
    }
  };

  const withProbe = searchParams.get('probe') === '1';

  const first = result.items[0];
  const rawStatus = (result as { raw?: Record<string, unknown> }).raw?.status;
  return NextResponse.json({
    engine: DOWNLOAD_ENGINE_URL,
    ok: true,
    rawStatus,
    status: result.status,
    filename: result.filename,
    ms: Date.now() - started,
    itemCount: result.items.length,
    tunnels: result.tunnels.length,
    items: result.items.map((i) => ({ type: i.type, host: host(i.url) })),
    saveProbe: withProbe && first?.url ? await probe(first.url) : undefined,
    tunnelProbe: withProbe && result.tunnels[0] ? await probe(result.tunnels[0]) : undefined,
  });
}
