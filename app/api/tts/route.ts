import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { synthesizeToStorage, TTS_VOICES, CATALOG } from '@/lib/tts';
import { VOICES } from '@/lib/catalog/voices';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/tts — quais vozes estão disponíveis neste ambiente.
 * Usado pelo painel “Voz IA” para mostrar o motor real em uso e avisar
 * quando é a voz do navegador (prévia) em vez da geração no servidor.
 */
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

  // Teste de TODAS as vozes do catálogo (uma palavra em cada sotaque).
  if (url.searchParams.get('probe') === 'catalog') {
    const results: { id: string; label: string; lang: string; ok: boolean; ms: number; bytes?: number; detail?: string }[] = [];
    for (const voice of VOICES) {
      const t0 = Date.now();
      try {
        const res = await fetch(
          `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=1&tl=${encodeURIComponent(voice.lang)}&q=${encodeURIComponent('olá')}`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
              Referer: 'https://translate.google.com/',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(7_000),
          },
        );
        const buf = Buffer.from(await res.arrayBuffer());
        results.push({
          id: voice.id,
          label: voice.label,
          lang: voice.lang,
          ok: res.ok && buf.length > 1000,
          ms: Date.now() - t0,
          bytes: buf.length,
          detail: res.ok ? undefined : `HTTP ${res.status}`,
        });
      } catch (err) {
        results.push({ id: voice.id, label: voice.label, lang: voice.lang, ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : 'erro').slice(0, 120) });
      }
    }
    return NextResponse.json(
      { ok: results.every((r) => r.ok), total: results.length, falhas: results.filter((r) => !r.ok), results },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  if (url.searchParams.get('probe') === '1') {
    const results: Record<string, { ok: boolean; ms: number; detail?: string }> = {};
    const run = async (name: string, fn: () => Promise<boolean>) => {
      const t0 = Date.now();
      try {
        const ok = await fn();
        results[name] = { ok, ms: Date.now() - t0 };
      } catch (err) {
        results[name] = { ok: false, ms: Date.now() - t0, detail: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
      }
    };

    await run('edge', async () => {
      const { EdgeTTS } = await import('edge-tts-universal');
      const tts = new EdgeTTS('Teste de voz do Editor Studio.', 'pt-BR-FranciscaNeural');
      const out = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('tempo esgotado (10s)')), 10_000)),
      ]);
      return (await out.audio.arrayBuffer()).byteLength > 1000;
    });

    await run('google', async () => {
      const res = await fetch(
        'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=' + encodeURIComponent('teste de voz'),
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Referer: 'https://translate.google.com/',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(9_000),
        },
      );
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return buf.length > 1000;
    });

    await run('streamelements', async () => {
      const res = await fetch('https://api.streamelements.com/kappa/v2/speech?voice=pt-BR-Wavenet-A&text=' + encodeURIComponent('teste de voz'), {
        cache: 'no-store',
        signal: AbortSignal.timeout(9_000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return buf.length > 1000;
    });

    return NextResponse.json({ engine, results, voices }, { headers: { 'cache-control': 'no-store' } });
  }

  return NextResponse.json(
    {
      engine,
      serverVoices: engine === 'edge' ? TTS_VOICES.filter((v) => v.lang === 'pt-BR').map((v) => v.id) : voices,
      voices: engine === 'edge' ? TTS_VOICES : [],
      catalog: CATALOG,
      languages: Array.from(new Set(VOICES.map((v) => v.lang))),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Faça login para gerar narração.' }, { status: 401 });

  const limit = rateLimit(`tts:${user.id}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto entre narrações.' }, { status: 429 });

  let body: { text?: string; lang?: string; voice?: string; projectId?: string; speed?: string };
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
      speed: body.speed,
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
