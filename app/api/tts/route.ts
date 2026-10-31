import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { synthesizeToStorage } from '@/lib/tts';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
