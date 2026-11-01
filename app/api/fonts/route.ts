import { NextResponse } from 'next/server';
import { searchFontCatalog } from '@/lib/fetchers/google-fonts-live';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import type { FontCategory } from '@/lib/fetchers/google-fonts';

export const runtime = 'nodejs';
export const revalidate = 86_400;

/**
 * GET /api/fonts?q=Bebas&category=display&limit=60
 *
 * Catálogo dinâmico de fontes livres (Google Fonts). Sem chave, sem custo:
 * o servidor busca uma vez e guarda em cache por 24 h. Se o Google não
 * responder, devolve o catálogo curado local — a UI nunca fica sem fontes.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });

  const limit = rateLimit(`fonts:${user.id}:${clientIp(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas buscas seguidas.' }, { status: 429 });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 60);
  const rawCategory = (url.searchParams.get('category') ?? 'all') as FontCategory | 'all';
  const category: FontCategory | 'all' = ['sans', 'serif', 'display', 'script', 'mono', 'all'].includes(rawCategory)
    ? rawCategory
    : 'all';
  const size = Math.min(200, Math.max(10, Number(url.searchParams.get('limit')) || 80));

  const items = await searchFontCatalog(q, category, size);
  return NextResponse.json({ ok: true, count: items.length, items });
}
