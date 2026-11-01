import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { VOICE_PRESETS } from '@/lib/voice-presets';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/tts/sample?voice=<id|preset>&lang=pt-BR
 *
 * Amostra CURTA (uma frase) da voz escolhida, para o preview automático do
 * painel "Voz IA" (Módulo 1 · item 3). O usuário troca a voz no select e ouve
 * na hora, sem clicar em "gerar".
 *
 * - usa o mesmo motor neural do "Gerar áudio" (edge-tts), então o timbre é o
 *   mesmo que vai para a timeline;
 * - cache em memória por 30 min (mesma voz = zero custo/latência de novo);
 * - se o serviço neural falhar, responde 503 e o painel cai na voz do navegador.
 */

type Cached = { at: number; audio: Buffer; contentType: string };
const CACHE = new Map<string, Cached>();
const TTL = 30 * 60 * 1000;

const SAMPLE_TEXT: Record<string, string> = {
  'pt-BR': 'Olá! Esta é a minha voz no Editor Studio.',
  'pt-PT': 'Olá! Esta é a minha voz no Editor Studio.',
  en: 'Hi! This is my voice inside Editor Studio.',
  es: '¡Hola! Esta es mi voz en Editor Studio.',
};

function sampleFor(lang: string) {
  const base = lang.slice(0, 2).toLowerCase();
  return SAMPLE_TEXT[lang] ?? SAMPLE_TEXT[base] ?? SAMPLE_TEXT.en;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`tts-sample:${user.id}:${clientIp(request.headers)}`, 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas prévias seguidas. Aguarde um instante.' }, { status: 429 });

  const url = new URL(request.url);
  const voiceId = (url.searchParams.get('voice') ?? 'pt-BR-FranciscaNeural').slice(0, 80);
  const lang = (url.searchParams.get('lang') ?? 'pt-BR').slice(0, 12);

  const cacheKey = `${voiceId}|${lang}`;
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) {
    return new NextResponse(new Uint8Array(hit.audio), {
      headers: {
        'content-type': hit.contentType,
        'cache-control': 'public, max-age=1800',
        'x-sample-cache': 'hit',
      },
    });
  }

  try {
    const { edgeSynthesize } = await import('@/lib/edge-tts');
    const preset = VOICE_PRESETS.find((item) => item.id === voiceId);
    const audio = await edgeSynthesize({
      text: sampleFor(lang),
      // preset guarda a voz real + pitch/rate; id solto é uma voz do catálogo
      voice: preset?.voice ?? voiceId,
      pitch: preset?.pitch,
      rate: preset?.rate,
      timeoutMs: 12_000,
    });
    if (!audio || audio.length < 800) throw new Error('amostra vazia');

    CACHE.set(cacheKey, { at: Date.now(), audio, contentType: 'audio/mpeg' });
    if (CACHE.size > 80) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) CACHE.delete(oldest[0]);
    }

    return new NextResponse(new Uint8Array(audio), {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=1800', 'x-sample-cache': 'miss' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'O motor neural não respondeu agora.', detail: error instanceof Error ? error.message.slice(0, 120) : 'erro' },
      { status: 503 },
    );
  }
}
