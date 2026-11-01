import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX = 24 * 1024 * 1024; // dataURL é inflado em ~33%: 24 MB cobre WAV/PNG curtos

/**
 * POST /api/free/asset
 * { dataUrl, name, kind: 'audio'|'image' } → guarda o que foi gerado no navegador
 * (som sintetizado, imagem sem fundo) em Meus arquivos.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const limit = rateLimit(`free-asset:${user.id}:${clientIp(request.headers)}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos. Aguarde um minuto.' }, { status: 429 });

  let body: { dataUrl?: string; name?: string; kind?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const dataUrl = String(body.dataUrl || '');
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });

  const contentType = match[1];
  const base64 = match[2];
  if (base64.length > MAX * 1.4) return NextResponse.json({ error: 'Arquivo gerado muito grande.' }, { status: 413 });
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });

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

  const kind = body.kind === 'audio' ? 'audio' : 'image';
  const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mpeg') ? 'mp3' : contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'webp';
  const safeName = String(body.name || 'gerado').replace(/[^\p{L}\p{N}\-_. ]/gu, '').slice(0, 50) || 'gerado';
  const path = `${user.id}/gerados/${Date.now()}-${safeName.replace(/\s+/g, '-').toLowerCase()}.${ext}`;

  const stored = await storeFile(admin, settings, path, buffer, contentType);
  if ('error' in stored) return NextResponse.json({ error: `Falha ao guardar (${stored.error}).` }, { status: 500 });

  const { error } = await admin.from('es_user_assets').insert({
    user_id: user.id,
    name: `${safeName}.${ext}`,
    type: kind,
    url: stored.url,
    storage_path: path,
    size_bytes: buffer.length,
    metadata: { source: 'ai-tools', generated: true },
  });
  if (error) return NextResponse.json({ error: `Falha ao registrar (${error.message}).` }, { status: 500 });

  return NextResponse.json({ ok: true, url: stored.url, bytes: buffer.length });
}
