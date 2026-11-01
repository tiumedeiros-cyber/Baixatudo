import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { saveStockKey, STOCK_SIGNUP, stockKeyStatus, type StockProvider } from '@/lib/fetchers/keys';
import { isStockProvider } from '@/lib/fetchers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET → quais fontes já têm chave (do usuário, da plataforma ou nenhuma). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const status = await stockKeyStatus(user.id);
  return NextResponse.json({ ok: true, providers: status }, { headers: { 'cache-control': 'no-store' } });
}

/** POST { provider, key } → grava a chave gratuita do próprio usuário. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`stock-key:${user.id}:${clientIp(request.headers)}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Aguarde um minuto.' }, { status: 429 });

  const settings = await getSettings();
  if (!settings.integrations.allow_user_stock) {
    return NextResponse.json({ error: 'O administrador desativou chaves próprias. Fale com o suporte.' }, { status: 403 });
  }

  let body: { provider?: string; key?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const provider = String(body.provider ?? '');
  if (!isStockProvider(provider)) return NextResponse.json({ error: 'Fonte desconhecida.' }, { status: 400 });

  const key = String(body.key ?? '').trim().slice(0, 200);
  if (key && key.length < 12) {
    return NextResponse.json({ error: 'Essa chave parece curta demais. Copie a chave completa.' }, { status: 400 });
  }

  const saved = await saveStockKey(user.id, provider as StockProvider, key);
  if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 500 });

  return NextResponse.json({ ok: true, provider, signup: STOCK_SIGNUP[provider as StockProvider] });
}
