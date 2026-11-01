import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';
import { storageS3Config } from '@/lib/storage';
import { s3PresignPut, s3PublicUrl } from '@/lib/s3';
import { getQuota, formatBytes } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/upload/presign
 * { name, size, contentType } → URL assinada para o navegador enviar direto ao bucket.
 * Usado quando o armazenamento externo (R2/B2/MinIO) está ligado: arquivos grandes
 * não passam pela Vercel.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const limit = rateLimit(`presign:${user.id}:${clientIp(request.headers)}`, 40, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos envios. Aguarde um minuto.' }, { status: 429 });

  let body: { name?: string; size?: number; contentType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const settings = await getSettings();
  const config = storageS3Config(settings);
  if (!config) return NextResponse.json({ error: 'Storage externo não está ligado.' }, { status: 400 });

  const maxBytes = effectiveFileLimitBytes(settings);
  const size = Number(body.size || 0);
  if (!size || size < 0) return NextResponse.json({ error: 'Tamanho inválido.' }, { status: 400 });
  if (size > maxBytes) {
    return NextResponse.json({ error: `Arquivo acima do limite de ${formatBytes(maxBytes)}.` }, { status: 413 });
  }

  const admin = createAdminClient();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, user.id, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (size > quota.freeBytes) {
    return NextResponse.json({ error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres).` }, { status: 413 });
  }

  const safe = (body.name || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-60);
  const path = `${user.id}/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  return NextResponse.json({
    ok: true,
    url: s3PresignPut(config, path),
    path,
    publicUrl: s3PublicUrl(config, path),
    contentType: body.contentType || 'application/octet-stream',
  });
}
