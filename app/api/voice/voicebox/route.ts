import { NextResponse } from 'next/server';
import { getSessionUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { formatBytes, getQuota } from '@/lib/quota';
import { effectiveFileLimitBytes } from '@/lib/storage-capacity';
import { storeFile } from '@/lib/storage';
import {
  LOCAL_VOICEBOX,
  VOICEBOX_ENGINES,
  sanitizeVoiceboxBase,
  voiceboxHealth,
  voiceboxProfiles,
  voiceboxSpeech,
  wavDurationSeconds,
} from '@/lib/voicebox';
import { resolveVoiceboxBase } from '@/lib/voicebox-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Voicebox (voz clonada, local e grátis) — Módulo isolado.
 *
 * GET  → diagnóstico: servidor remoto configurado? responde? perfis?
 * POST (JSON)      → gera no servidor remoto e guarda o áudio no storage.
 * POST (multipart) → recebe o áudio já gerado localmente pelo navegador
 *                    (modo local) e guarda no storage do usuário.
 *
 * Nada aqui toca na timeline: a inserção dos clipes é feita no componente
 * `VoiceboxPanel` usando a mesma API pública do store que o TTS já usa.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const target = await resolveVoiceboxBase();
  const payload: Record<string, unknown> = {
    ok: true,
    localDefault: LOCAL_VOICEBOX,
    engines: VOICEBOX_ENGINES,
    remote: { configured: Boolean(target), source: target?.source ?? null, base: target?.base ?? null },
  };

  if (target) {
    const health = await voiceboxHealth(target.base);
    payload.remote = {
      configured: true,
      source: target.source,
      base: target.base,
      reachable: health.ok,
      error: health.ok ? null : health.error,
      health: health.ok ? health.health : null,
    };
    if (health.ok) {
      const profiles = await voiceboxProfiles(target.base);
      payload.profiles = profiles.ok ? profiles.profiles : [];
    }
  }

  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`voicebox:${user.id}:${clientIp(request.headers)}`, 15, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas gerações seguidas. Aguarde um minuto.' }, { status: 429 });

  const contentType = request.headers.get('content-type') ?? '';

  // ── modo LOCAL: o navegador já gerou o áudio e está enviando os bytes ──
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
    if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'Áudio acima de 40 MB.' }, { status: 413 });

    const mime = file.type || 'audio/mpeg';
    const label = String(form.get('name') || 'Minha voz (Voicebox)').slice(0, 60);
    const result = await saveAudio({ userId: user.id, buffer, mime, label, extra: { source: 'voicebox-local' } });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, ...result });
  }

  // ── modo REMOTO: nosso servidor fala com o Voicebox e guarda o áudio ──
  let body: {
    text?: string;
    voice?: string;
    engine?: string;
    instructions?: string;
    baseUrl?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Escreva o texto da narração.' }, { status: 400 });

  const target = await resolveVoiceboxBase();
  // baseUrl do cliente só é aceito se o admin tiver configurado um servidor
  // (evita virar proxy aberto para a rede interna de qualquer um)
  const override = target ? sanitizeVoiceboxBase(body.baseUrl) : null;
  const base = override ?? target?.base ?? null;
  if (!base) {
    return NextResponse.json(
      {
        error:
          'Nenhum servidor Voicebox configurado. Use o modo local (app aberto no seu computador) ou peça ao admin para cadastrar a URL em Configurações → Integrações.',
        needServer: true,
      },
      { status: 400 },
    );
  }

  const speech = await voiceboxSpeech(base, {
    text,
    voice: body.voice,
    engine: body.engine,
    instructions: body.instructions,
  });
  if (!speech.ok) return NextResponse.json({ error: speech.error }, { status: 502 });

  const result = await saveAudio({
    userId: user.id,
    buffer: speech.buffer,
    mime: speech.mime,
    label: body.voice ? `Voz ${body.voice}` : 'Voz Voicebox',
    extra: { source: 'voicebox', engine: body.engine ?? 'qwen', format: speech.format },
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    ok: true,
    ...result,
    duration: speech.format === 'wav' ? wavDurationSeconds(speech.buffer) : null,
    engine: body.engine ?? 'qwen',
  });
}

type Saved = { url: string; bytes: number; mime: string; name: string; assetId: string | null };
type SaveError = { error: string; status: number };

async function saveAudio(input: {
  userId: string;
  buffer: Buffer;
  mime: string;
  label: string;
  extra: Record<string, unknown>;
}): Promise<Saved | SaveError> {
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

  const ext = input.mime.includes('wav') ? 'wav' : input.mime.includes('ogg') ? 'ogg' : 'mp3';
  const safe = input.label
    .replace(/[^\p{L}\p{N}\-_. ]/gu, '')
    .slice(0, 40)
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'voz';
  const path = `${input.userId}/voicebox/${Date.now()}-${safe}.${ext}`;

  const stored = await storeFile(admin, settings, path, input.buffer, input.mime);
  if ('error' in stored) return { error: `Falha ao guardar (${stored.error}).`, status: 500 };

  const { data } = await admin
    .from('es_user_assets')
    .insert({
      user_id: input.userId,
      name: `${safe}.${ext}`,
      type: 'audio',
      url: stored.url,
      storage_path: path,
      size_bytes: input.buffer.length,
      metadata: input.extra,
    })
    .select('id')
    .single();

  return {
    url: stored.url,
    bytes: input.buffer.length,
    mime: input.mime,
    name: `${safe}.${ext}`,
    assetId: data?.id ?? null,
  };
}
