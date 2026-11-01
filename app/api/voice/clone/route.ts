import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';
import { CLONE_LANGUAGES, CLONE_SPACES, cloneVoice, probeCloneSpaces, splitForCloning } from '@/lib/voice-clone';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_SAMPLE = 25 * 1024 * 1024;
const MAX_OUTPUT = 40 * 1024 * 1024;

let probeCache: { at: number; value: Awaited<ReturnType<typeof probeCloneSpaces>> } | null = null;

/**
 * Voz clonada grátis, sem computador (Módulo isolado).
 *
 * GET  → status real dos servidores públicos de clonagem (XTTS em Space).
 * POST multipart → guarda a amostra de voz (gravada no celular) e devolve URL.
 * POST JSON      → clona a voz para cada bloco do roteiro e guarda os áudios.
 *
 * Nada aqui mexe na timeline: quem insere os clipes é o componente
 * `VoiceClonePanel`, com a mesma API pública do store usada pelo TTS.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  if (!probeCache || Date.now() - probeCache.at > 120_000) {
    probeCache = { at: Date.now(), value: await probeCloneSpaces() };
  }
  const providers = probeCache.value;
  return NextResponse.json({
    ok: true,
    available: providers.some((p) => p.ok),
    providers,
    spaces: CLONE_SPACES.map((s) => s.id),
    languages: CLONE_LANGUAGES,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`voice-clone:${user.id}:${clientIp(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas gerações seguidas. Aguarde um minuto.' }, { status: 429 });

  const contentType = request.headers.get('content-type') ?? '';

  // ── amostra de voz: gravada no celular ou arquivo escolhido ──
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Áudio ausente.' }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return NextResponse.json({ error: 'Áudio vazio.' }, { status: 400 });
    if (buffer.length > MAX_SAMPLE) return NextResponse.json({ error: 'Amostra acima de 25 MB.' }, { status: 413 });

    const saved = await saveAudio({
      userId: user.id,
      buffer,
      mime: file.type || 'audio/wav',
      label: String(form.get('name') || 'Amostra de voz'),
      folder: 'voice-samples',
      extra: { source: 'voice-sample' },
    });
    if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
    return NextResponse.json({ ok: true, url: saved.url, bytes: saved.bytes, name: saved.name });
  }

  // ── clonagem ──
  let body: { text?: string; sampleUrl?: string; language?: string; speed?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
  const sampleUrl = String(body.sampleUrl ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Escreva o texto da narração.' }, { status: 400 });
  if (!sampleUrl) return NextResponse.json({ error: 'Grave uma amostra da sua voz primeiro.' }, { status: 400 });
  if (!/^https?:\/\//i.test(sampleUrl)) return NextResponse.json({ error: 'Amostra inválida.' }, { status: 400 });

  const chunks = splitForCloning(text, 400).slice(0, 6);
  const language = CLONE_LANGUAGES.some((l) => l.id === body.language) ? String(body.language) : 'Portuguese';
  const speed = Number(body.speed ?? 1);

  const segments: { url: string; text: string }[] = [];
  const errors: string[] = [];

  for (const chunk of chunks) {
    const cloned = await cloneVoice({ text: chunk, referenceUrl: sampleUrl, language, speed });
    if (!cloned.ok) {
      errors.push(cloned.error);
      break;
    }
    const saved = await saveAudio({
      userId: user.id,
      buffer: cloned.buffer,
      mime: cloned.mime,
      label: 'Voz clonada',
      folder: 'voice-clone',
      extra: { source: 'voice-clone', language },
    });
    if ('error' in saved) {
      errors.push(saved.error);
      break;
    }
    segments.push({ url: saved.url, text: chunk });
  }

  if (!segments.length) {
    return NextResponse.json(
      {
        error: errors[0] || 'Não foi possível gerar com a voz clonada agora.',
        hint: 'Os servidores públicos de clonagem podem estar ocupados. Tente novamente em alguns minutos ou use a narração normal.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    segments,
    language,
    partial: segments.length < chunks.length,
    warning: errors[0] ?? null,
  });
}

async function saveAudio(input: {
  userId: string;
  buffer: Buffer;
  mime: string;
  label: string;
  folder: string;
  extra: Record<string, unknown>;
}): Promise<{ url: string; bytes: number; name: string } | { error: string; status: number }> {
  if (input.buffer.length > MAX_OUTPUT) return { error: 'Áudio acima de 40 MB.', status: 413 };

  const settings = await getSettings();
  const admin = createAdminClient();
  const sub = await getActiveSubscription();
  const quota = await getQuota(admin, input.userId, Number(sub?.plans?.limits?.storage_gb ?? 5));
  if (input.buffer.length > quota.freeBytes) {
    return { error: `Sem espaço no plano (${formatBytes(quota.freeBytes)} livres).`, status: 413 };
  }
  if (input.buffer.length > effectiveFileLimitBytes(settings)) {
    return { error: 'Áudio acima do limite por arquivo do provedor.', status: 413 };
  }

  const ext = input.mime.includes('wav')
    ? 'wav'
    : input.mime.includes('ogg')
      ? 'ogg'
      : input.mime.includes('mp4') || input.mime.includes('aac')
        ? 'm4a'
        : input.mime.includes('webm')
          ? 'webm'
          : 'mp3';
  const safe =
    input.label
      .replace(/[^\p{L}\p{N}\-_. ]/gu, '')
      .slice(0, 40)
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'voz';
  const path = `${input.userId}/${input.folder}/${Date.now()}-${safe}.${ext}`;

  const stored = await storeFile(admin, settings, path, input.buffer, input.mime);
  if ('error' in stored) return { error: `Falha ao guardar (${stored.error}).`, status: 500 };

  await admin.from('es_user_assets').insert({
    user_id: input.userId,
    name: `${safe}.${ext}`,
    type: 'audio',
    url: stored.url,
    storage_path: path,
    size_bytes: input.buffer.length,
    metadata: input.extra,
  });

  return { url: stored.url, bytes: input.buffer.length, name: `${safe}.${ext}` };
}
