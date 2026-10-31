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

  // Sonda leve: pede só os primeiros bytes com Range e corta em 6 s para não
  // estourar o tempo da função (o arquivo pode ter centenas de MB).
  const probe = async (target: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: '*/*',
          Range: 'bytes=0-2047',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentRange: res.headers.get('content-range'),
        bytes: buf.length,
        head: buf.subarray(0, 8).toString('hex'),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'erro' };
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
