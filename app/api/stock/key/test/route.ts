import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { isStockProvider, testStockKey } from '@/lib/fetchers';
import { resolveStockKey, type StockProvider } from '@/lib/fetchers/keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stock/key/test  { provider, key? }
 *
 * Botão "Testar conexão" do painel de chaves (Módulo 2 · item 1).
 * - com `key`: testa a chave digitada antes de salvar;
 * - sem `key`: testa a chave que já está valendo (usuário → plataforma → env).
 *
 * Faz uma consulta REAL e mínima (3 itens) no provedor: 200 = toast verde,
 * 422 = toast vermelho com o motivo exato (chave inválida, cota, etc.).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`stock-key-test:${user.id}:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitos testes seguidos. Aguarde um minuto.' }, { status: 429 });

  let body: { provider?: string; key?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const provider = String(body.provider ?? '');
  if (!isStockProvider(provider)) return NextResponse.json({ error: 'Fonte desconhecida.' }, { status: 400 });

  let key = String(body.key ?? '').trim();
  let source: 'typed' | 'user' | 'shared' | 'off' = 'typed';
  if (!key) {
    const resolved = await resolveStockKey(user.id, provider as StockProvider);
    key = resolved.key;
    source = resolved.source === 'off' ? 'off' : resolved.source;
  }

  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'Nenhuma chave configurada para esta fonte.', source: 'off' },
      { status: 422 },
    );
  }

  const result = await testStockKey(provider as StockProvider, key);
  return NextResponse.json(
    { ...result, provider, source },
    { status: result.ok ? 200 : 422, headers: { 'cache-control': 'no-store' } },
  );
}
