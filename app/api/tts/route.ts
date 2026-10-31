import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { synthesizeToStorage, TTS_VOICES } from '@/lib/tts';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/tts — quais vozes estão disponíveis neste ambiente.
 * Usado pelo painel “Voz IA” para mostrar o motor real em uso e avisar
 * quando é a voz do navegador (prévia) em vez da geração no servidor.
 */
let cachedProbe: { at: number; ok: boolean; engine: string; ms: number } | null = null;

/**
 * GET /api/tts — motor e vozes disponíveis (resposta imediata).
 * GET /api/tts?probe=1 — faz uma síntese curta de verdade e informa se a voz funciona.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const engine = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.OPENAI_API_KEY ? 'openai' : 'edge';
  const voices =
    engine === 'openai'
      ? ['coral', 'nova', 'sage', 'shimmer', 'alloy', 'echo', 'fable', 'onyx']
      : engine === 'elevenlabs'
        ? ['Rachel', 'Bella', 'Adam', 'Antoni']
        : TTS_VOICES.map((v) => v.id);

  if (url.searchParams.get('probe') === '1') {
    if (cachedProbe && Date.now() - cachedProbe.at < 5 * 60_000) {
      return NextResponse.json({ ...cachedProbe, engine, voices }, { headers: { 'cache-control': 'no-store' } });
    }
    const started = Date.now();
    let ok = false;
    try {
      const { EdgeTTS } = await import('edge-tts-universal');
      const tts = new EdgeTTS('Teste de voz do Editor Studio.', 'pt-BR-FranciscaNeural');
      const out = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('tempo esgotado')), 12_000)),
      ]);
      ok = (await out.audio.arrayBuffer()).byteLength > 1000;
    } catch {
      ok = false;
    }
    cachedProbe = { at: Date.now(), ok, engine, ms: Date.now() - started };
    return NextResponse.json({ ...cachedProbe, voices }, { headers: { 'cache-control': 'no-store' } });
  }

  return NextResponse.json(
    {
      engine,
      serverVoices: engine === 'edge' ? TTS_VOICES.filter((v) => v.lang === 'pt-BR').map((v) => v.id) : voices,
      voices: engine === 'edge' ? TTS_VOICES : [],
      languages: ['pt-BR', 'en-US', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'],
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Faça login para gerar narração.' }, { status: 401 });

  const limit = rateLimit(`tts:${user.id}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto entre narrações.' }, { status: 429 });

  let body: { text?: string; lang?: string; voice?: string; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const text = String(body.text || '').trim();
  if (text.length < 2) return NextResponse.json({ error: 'Escreva algum texto.' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: 'Limite de 5000 caracteres por narração.' }, { status: 400 });

  try {
    const result = await synthesizeToStorage({
      userId: user.id,
      projectId: body.projectId,
      text,
      lang: body.lang,
      voice: body.voice,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          (err instanceof Error ? err.message : 'Falha ao gerar áudio') +
          '. Use a prévia do navegador enquanto isso (aba Voz IA → Ouvir prévia).',
      },
      { status: 502 },
    );
  }
}
