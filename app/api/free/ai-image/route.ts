import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { craiyon } from '@/lib/craiyon';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/free/ai-image — gera imagem de IA gratuita (Pollinations, sem chave).
 *
 * Antes o navegador apontava direto para o serviço: quando ele demorava ou
 * devolvia erro, a imagem simplesmente não aparecia. Agora o servidor tenta
 * até 3 vezes (sementes diferentes) e devolve o erro real quando não dá.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const limit = rateLimit(`ai-image:${user.id}:${clientIp(request.headers)}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto entre as gerações.' }, { status: 429 });

  let body: { prompt?: string; width?: number; height?: number; seed?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const prompt = String(body.prompt ?? '').trim().slice(0, 500);
  if (prompt.length < 3) return NextResponse.json({ error: 'Descreva a imagem que você quer.' }, { status: 400 });
  const width = Math.min(1536, Math.max(256, Number(body.width) || 1024));
  const height = Math.min(1536, Math.max(256, Number(body.height) || 1024));
  const baseSeed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 1_000_000);

  const pollinationsKey = process.env.POLLINATIONS_API_KEY ?? '';
  const attempts = [baseSeed, baseSeed + 17, baseSeed + 91];
  const problems: string[] = [];

  for (const seed of attempts) {
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${width}&height=${height}&model=sana&nologo=true&seed=${seed}&referrer=editorstudio`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'EditorStudio/1.0 (+https://editor-studio-one.vercel.app)',
          Accept: 'image/*',
          ...(pollinationsKey ? { Authorization: `Bearer ${pollinationsKey}` } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('image') && bytes.length > 2_000) {
        return NextResponse.json({
          ok: true,
          dataUrl: `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`,
          bytes: bytes.length,
          width,
          height,
          seed,
        });
      }
      problems.push(`HTTP ${res.status}${type ? ` ${type.split(';')[0]}` : ''} ${bytes.length}B`);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'falha de rede');
    }
  }

  // Segunda tentativa: Craiyon (público, sem cadastro).
  try {
    const image = await craiyon(prompt);
    if (image) {
      return NextResponse.json({
        ok: true,
        dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
        bytes: image.length,
        width,
        height,
        seed: baseSeed,
        engine: 'craiyon',
      });
    }
    problems.push('craiyon sem resposta');
  } catch (error) {
    problems.push(`craiyon: ${error instanceof Error ? error.message : 'erro'}`);
  }

  return NextResponse.json(
    {
      error:
        'Os geradores gratuitos de imagem não responderam agora (os dois serviços públicos estão fora do ar). ' +
        'Tente novamente em alguns minutos ou use a aba “Imagens livres”, que busca fotos prontas — essa funciona sempre.',
      detail: problems.join(' · ').slice(0, 400),
    },
    { status: 502 },
  );
}
