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

  let body: { imageUrl?: string; audioUrl?: string; audioUrls?: string[]; space?: string; green?: boolean };
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
  const extraHosts = s3Host ? [s3Host] : [];
  const imageUrl = resolveMediaUrl(body.imageUrl ?? '', extraHosts);

  // o TTS quebra roteiros longos em vários trechos: juntamos todos na ordem
  const rawAudio = [
    ...(Array.isArray(body.audioUrls) ? body.audioUrls : []),
    ...(body.audioUrl ? [body.audioUrl] : []),
  ]
    .map((item) => resolveMediaUrl(item, extraHosts))
    .filter((item): item is string => Boolean(item));
  const audioUrls = [...new Set(rawAudio)];

  if (!imageUrl) return NextResponse.json({ error: 'Imagem do avatar inválida (use a foto do próprio sistema).' }, { status: 400 });
  if (!audioUrls.length) return NextResponse.json({ error: 'Áudio da narração inválido.' }, { status: 400 });

  const started = Date.now();
  const result = await generateLipSyncVideo({
    imageUrl,
    audioUrl: audioUrls[0],
    audioUrls: audioUrls.slice(1),
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
  // O vídeo TEM que virar um arquivo nosso: o editor desenha o quadro em canvas
  // e precisa de CORS. O link direto do Space (/gradio_api/file=…) não manda
  // CORS, então usá-lo deixava o avatar invisível na timeline.
  const stored = await storeGeneratedVideo(user.id, result.videoUrl);
  if ('url' in stored) {
    return NextResponse.json({
      ok: true,
      stored: true,
      videoUrl: stored.url,
      sourceUrl: result.videoUrl,
      space: result.space,
      endpoint: result.endpoint,
      ms: result.ms,
    });
  }

  // Não deu para copiar: devolvemos a verdade e o app usa o motor interno.
  return NextResponse.json(
    {
      ok: false,
      stored: false,
      error: `O vídeo foi gerado, mas não pôde ser copiado para a sua biblioteca (${stored.error}).`,
      sourceUrl: result.videoUrl,
      space: result.space,
      tried: [],
      ms: result.ms,
    },
    { status: 502 },
  );
}

/** Baixa o MP4 gerado pelo Space e grava em "Meus arquivos". */
async function storeGeneratedVideo(
  userId: string,
  videoUrl: string,
): Promise<{ url: string } | { error: string }> {
  let lastError = 'falha ao baixar do serviço de IA';
  let buffer: Buffer | null = null;

  // o arquivo do Gradio às vezes demora a "aparecer": duas tentativas
  for (let attempt = 0; attempt < 2 && !buffer; attempt += 1) {
    try {
      const res = await fetch(videoUrl, {
        signal: AbortSignal.timeout(120_000),
        cache: 'no-store',
        headers: { accept: 'video/mp4,video/*;q=0.9,*/*;q=0.5' },
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length) {
        lastError = 'arquivo vazio';
        continue;
      }
      // Não confiamos no content-type: o Gradio manda `application/octet-stream`.
      // MP4/MOV têm a marca "ftyp" nos bytes 4..8; WebM começa com 0x1A45DFA3.
      const isMp4 = bytes.length > 12 && bytes.subarray(4, 8).toString('latin1') === 'ftyp';
      const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      if (!isMp4 && !isWebm) {
        lastError = 'o serviço devolveu um arquivo que não é vídeo';
        continue;
      }
      buffer = bytes;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!buffer) return { error: lastError };
  if (buffer.length > 120 * 1024 * 1024) return { error: 'vídeo acima de 120 MB' };

  const admin = createAdminClient();
  const settings = await getSettings();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, userId, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (buffer.length > quota.freeBytes) return { error: 'sem espaço no seu plano' };
  if (buffer.length > effectiveFileLimitBytes(settings)) return { error: 'acima do limite de arquivo do plano' };

  const path = `${userId}/avatares/${Date.now()}-avatar-ia.mp4`;
  const stored = await storeFile(admin, settings, path, buffer, 'video/mp4');
  if ('error' in stored) return { error: stored.error };

  await admin.from('es_user_assets').insert({
    user_id: userId,
    name: `avatar-ia-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.mp4`,
    type: 'video',
    url: stored.url,
    storage_path: path,
    size_bytes: buffer.length,
    metadata: { source: 'avatar-lipsync' },
  });

  return { url: stored.url };
}
