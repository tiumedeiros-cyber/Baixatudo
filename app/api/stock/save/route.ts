import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';
import { isStockUrl } from '@/lib/fetchers';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BYTES = 90 * 1024 * 1024;

/**
 * POST /api/stock/save { url, name, kind }
 *
 * Baixa o arquivo da fonte gratuita e guarda em "Meus arquivos" — assim ele
 * aparece na biblioteca do editor e não depende do link externo continuar no ar.
 * Só aceita hosts de Pexels/Unsplash/Pixabay/Freesound (nada de proxy aberto).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`stock-save:${user.id}:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos downloads seguidos. Aguarde um minuto.' }, { status: 429 });

  let body: { url?: string; name?: string; kind?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const url = String(body.url ?? '');
  if (!isStockUrl(url)) return NextResponse.json({ error: 'Endereço não permitido.' }, { status: 400 });

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: 'no-store' });
  if (!res.ok) return NextResponse.json({ error: `A fonte respondeu ${res.status}.` }, { status: 502 });

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 502 });
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'Arquivo acima de 90 MB.' }, { status: 413 });

  const settings = await getSettings();
  const admin = createAdminClient();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, user.id, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (buffer.length > quota.freeBytes) {
    return NextResponse.json({ error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres).` }, { status: 413 });
  }
  if (buffer.length > effectiveFileLimitBytes(settings)) {
    return NextResponse.json({ error: 'Arquivo acima do limite por arquivo do provedor.' }, { status: 413 });
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const guessed = inferExt(contentType, url);
  const kind = body.kind === 'audio' ? 'audio' : body.kind === 'video' ? 'video' : 'image';
  const safeName =
    String(body.name || 'stock').replace(/[^\p{L}\p{N}\-_. ]/gu, '').slice(0, 50).trim().replace(/\s+/g, '-').toLowerCase() ||
    'stock';
  const path = `${user.id}/stock/${Date.now()}-${safeName}.${guessed.ext}`;

  const stored = await storeFile(admin, settings, path, buffer, guessed.mime);
  if ('error' in stored) return NextResponse.json({ error: `Falha ao guardar (${stored.error}).` }, { status: 500 });

  const { data } = await admin
    .from('es_user_assets')
    .insert({
      user_id: user.id,
      name: `${safeName}.${guessed.ext}`,
      type: kind,
      url: stored.url,
      storage_path: path,
      size_bytes: buffer.length,
      metadata: { source: new URL(url).hostname },
    })
    .select('id,url,name,type')
    .single();

  return NextResponse.json({ ok: true, asset: data, bytes: buffer.length });
}

function inferExt(contentType: string, url: string) {
  if (contentType.includes('mp4')) return { ext: 'mp4', mime: 'video/mp4' };
  if (contentType.includes('webm')) return { ext: 'webm', mime: 'video/webm' };
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (contentType.includes('wav')) return { ext: 'wav', mime: 'audio/wav' };
  if (contentType.includes('ogg')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (contentType.includes('png')) return { ext: 'png', mime: 'image/png' };
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return { ext: 'jpg', mime: 'image/jpeg' };
  if (contentType.includes('webp')) return { ext: 'webp', mime: 'image/webp' };
  const fromUrl = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mp3', 'wav', 'ogg', 'png', 'jpg', 'jpeg', 'webp'].includes(fromUrl)) {
    const mime =
      fromUrl === 'mp4' ? 'video/mp4' : fromUrl === 'webm' ? 'video/webm' : fromUrl === 'mp3' ? 'audio/mpeg' : fromUrl === 'png' ? 'image/png' : fromUrl === 'webp' ? 'image/webp' : fromUrl === 'wav' ? 'audio/wav' : 'image/jpeg';
    return { ext: fromUrl === 'jpeg' ? 'jpg' : fromUrl, mime };
  }
  return { ext: 'jpg', mime: 'image/jpeg' };
}
