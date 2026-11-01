import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { generateLipSyncVideo, probeConnect, probeLipSyncSpaces } from '@/lib/avatar-sync';
import { SITE_URL, SUPABASE_URL } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveSubscription } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';

export const runtime = 'nodejs';
/** SadTalker em CPU é lento: damos o máximo que a plataforma permite. */
export const maxDuration = 300;

/**
 * GET /api/avatar/lipsync?probe=1 → mostra quais Spaces gratuitos estão de pé.
 * POST /api/avatar/lipsync { imageUrl, audioUrl } → devolve { ok, videoUrl }.
 *
 * A rota é só um "casco": toda a lógica está em `lib/avatar-sync.ts`, então
 * remover/trocar o provedor não afeta timeline, player nem layout.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`lipsync-probe:${clientIp(request.headers)}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos pedidos.' }, { status: 429 });
  const url = new URL(request.url);
  // ?probe=connect → testa o cliente Gradio de ponta a ponta (sem gerar vídeo)
  if (url.searchParams.get('probe') === 'connect') {
    const result = await probeConnect(url.searchParams.get('space') ?? undefined);
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  }
  const probe = await probeLipSyncSpaces();
  return NextResponse.json(probe, { headers: { 'cache-control': 'no-store' } });
}

/** Só aceitamos mídia do próprio sistema (evita SSRF e uso como proxy aberto). */
function resolveMediaUrl(raw: string, extraHosts: string[] = []): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  // mídia já embutida (foto enviada pelo usuário / áudio do TTS): nada de rede
  if (value.startsWith('data:image/') || value.startsWith('data:audio/')) return value;
  if (value.startsWith('/')) return `${SITE_URL}${value}`;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const allowed = ['supabase.co', 'vercel.app', 'localhost', ...extraHosts];
    if (SUPABASE_URL) {
      try {
        allowed.push(new URL(SUPABASE_URL).hostname);
      } catch {
        /* noop */
      }
    }
    const okHost = allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return okHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`lipsync:${user.id}:${clientIp(request.headers)}`, 4, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto antes de gerar outro vídeo.' }, { status: 429 });

  let body: { imageUrl?: string; audioUrl?: string; space?: string; green?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const settings = await getSettings();

  // o TTS pode estar em storage S3-compatível próprio (R2/B2/MinIO)
  const s3Base = settings.storage?.public_base ?? '';
  let s3Host = '';
  try {
    if (s3Base) s3Host = new URL(s3Base).hostname;
  } catch {
    /* noop */
  }
  const imageUrl = resolveMediaUrl(body.imageUrl ?? '', s3Host ? [s3Host] : []);
  const audioUrl = resolveMediaUrl(body.audioUrl ?? '', s3Host ? [s3Host] : []);
  if (!imageUrl) return NextResponse.json({ error: 'Imagem do avatar inválida (use a foto do próprio sistema).' }, { status: 400 });
  if (!audioUrl) return NextResponse.json({ error: 'Áudio da narração inválido.' }, { status: 400 });

  const started = Date.now();
  const result = await generateLipSyncVideo({
    imageUrl,
    audioUrl,
    space: body.space,
    // fundo verde automático: é o que deixa o avatar "dentro" do cenário
    greenScreen: body.green !== false,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, tried: result.tried, ms: Date.now() - started },
      { status: 502 },
    );
  }

  // Guardamos o vídeo na nossa storage: assim ele abre no editor sem depender
  // de CORS/permissão do Space (e o chroma key consegue ler os pixels).
  try {
    const stored = await storeGeneratedVideo(user.id, result.videoUrl);
    return NextResponse.json({
      ok: true,
      videoUrl: stored ?? result.videoUrl,
      stored: Boolean(stored),
      sourceUrl: result.videoUrl,
      space: result.space,
      endpoint: result.endpoint,
      ms: result.ms,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      videoUrl: result.videoUrl,
      stored: false,
      sourceUrl: result.videoUrl,
      space: result.space,
      ms: result.ms,
    });
  }
}

/** Baixa o MP4 gerado pelo Space e grava em "Meus arquivos". */
async function storeGeneratedVideo(userId: string, videoUrl: string): Promise<string | null> {
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000), cache: 'no-store' });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('video/')) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length || buffer.length > 120 * 1024 * 1024) return null;

  const admin = createAdminClient();
  const settings = await getSettings();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, userId, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (buffer.length > quota.freeBytes) return null;
  if (buffer.length > effectiveFileLimitBytes(settings)) return null;

  const path = `${userId}/avatares/${Date.now()}-avatar-ia.mp4`;
  const stored = await storeFile(admin, settings, path, buffer, type || 'video/mp4');
  if ('error' in stored) return null;

  await admin.from('es_user_assets').insert({
    user_id: userId,
    name: `avatar-ia-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`,
    type: 'video',
    url: stored.url,
    storage_path: path,
    size_bytes: buffer.length,
    metadata: { source: 'avatar-lipsync', source_url: videoUrl, bytes_label: formatBytes(buffer.length) },
  });

  return stored.url;
}
