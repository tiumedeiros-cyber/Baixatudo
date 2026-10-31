import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOWNLOAD_ENGINE_URL } from '@/lib/env';
import { requestDownload } from '@/lib/downloader';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { saveDownloadToLibrary } from '@/lib/download-save';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024; // autoteste usa arquivos pequenos

/**
 * GET /api/downloads/selftest?url=...
 * Prova de ponta a ponta do Baixa Tudo: pede o arquivo ao motor, baixa pelo
 * túnel e grava na biblioteca do administrador. Assim é possível conferir em
 * "Meus arquivos" que o download realmente entrou no sistema.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = rateLimit(`selftest:${clientIp(request.headers)}`, 3, 600_000);
  if (!limit.ok) return NextResponse.json({ error: 'aguarde alguns minutos' }, { status: 429 });

  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'informe ?url=' }, { status: 400 });
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//.test(url)) {
    return NextResponse.json({ error: 'autoteste restrito a links do YouTube' }, { status: 400 });
  }

  const admin = createAdminClient();
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (!email) return NextResponse.json({ error: 'ADMIN_EMAIL ausente' }, { status: 400 });

  const { data: profile } = await admin
    .from('es_profiles')
    .select('id,email,role')
    .ilike('email', email)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'administrador não encontrado' }, { status: 404 });

  const started = Date.now();
  const result = await requestDownload(url, { audio: searchParams.get('audio') === '1' });
  if (!result.ok) {
    return NextResponse.json({ engine: DOWNLOAD_ENGINE_URL, ok: false, stage: 'engine', error: result.error });
  }

  const item = result.items[0];
  if (!item) {
    return NextResponse.json({ engine: DOWNLOAD_ENGINE_URL, ok: false, stage: 'engine', error: 'nenhum arquivo' });
  }

  const outcome = await saveDownloadToLibrary({
    admin,
    userId: profile.id as string,
    item,
    tunnels: result.tunnels,
    service: 'youtube',
    downloadId: undefined,
    sourceUrl: url,
    maxBytes: MAX_BYTES,
  });

  if (!outcome.ok) {
    return NextResponse.json({
      engine: DOWNLOAD_ENGINE_URL,
      ok: false,
      stage: 'save',
      filename: result.filename,
      error: outcome.error,
      ms: Date.now() - started,
    });
  }

  return NextResponse.json({
    engine: DOWNLOAD_ENGINE_URL,
    ok: true,
    status: result.status,
    filename: result.filename,
    bytes: outcome.bytes,
    contentType: outcome.asset.type,
    path: outcome.path,
    assetUrl: outcome.url,
    ms: Date.now() - started,
  });
}
