import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { isStockProvider, searchStock, STOCK_LABEL, type StockKind } from '@/lib/fetchers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stock?source=pexels&kind=video&q=praia&page=1
 *
 * Pesquisa nos bancos profissionais gratuitos (Pexels, Unsplash, Pixabay,
 * Freesound). Sem chave configurada devolve `needKey: true` + link do cadastro
 * gratuito — a UI mostra isso de forma honesta em vez de "carregar para sempre".
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`stock:${user.id}:${clientIp(request.headers)}`, 40, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas buscas seguidas. Aguarde um minuto.' }, { status: 429 });

  const url = new URL(request.url);
  const source = url.searchParams.get('source') ?? 'pexels';
  const kind = (url.searchParams.get('kind') ?? 'video') as StockKind;
  const query = (url.searchParams.get('q') ?? '').slice(0, 80).trim();
  const page = Math.max(1, Math.min(20, Number(url.searchParams.get('page') ?? 1) || 1));

  if (!isStockProvider(source)) {
    return NextResponse.json({ ok: false, error: 'Fonte desconhecida.' }, { status: 400 });
  }
  if (query.length < 2) {
    return NextResponse.json({ ok: false, error: 'Digite pelo menos 2 letras.' }, { status: 400 });
  }

  const result = await searchStock(user.id, source, { query, kind, page });
  return NextResponse.json(
    { ...result, label: STOCK_LABEL[source] },
    { headers: { 'cache-control': 'no-store' } },
  );
}
