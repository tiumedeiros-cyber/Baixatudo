import { NextResponse } from 'next/server';
import { getActiveSubscription, getSessionUser } from '@/lib/auth';
import { consumeTime, getTimeBalance, hasActivePlan } from '@/lib/time';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/time  → saldo atual (sem consumir)
 * POST /api/time  → heartbeat do editor: consome o tempo decorrido e devolve o saldo
 *
 * O consumo é sempre calculado no servidor a partir de `es_profiles.time_last_tick`,
 * então o cliente não consegue "pedir" mais tempo do que o realmente usado.
 */
async function snapshot() {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, status: 401, body: { error: 'não autenticado' } };

  const [sub, balance] = await Promise.all([getActiveSubscription(), getTimeBalance(user.id)]);
  const planActive = hasActivePlan(sub?.status);
  return {
    ok: true as const,
    body: {
      remaining: balance.remaining,
      total: balance.total,
      used: balance.used,
      planActive,
      planName: sub?.plans?.name ?? null,
      planStatus: sub?.status ?? null,
      periodEnd: sub?.current_period_end ?? null,
      canEdit: planActive || balance.remaining > 0,
    },
  };
}

export async function GET() {
  const result = await snapshot();
  if (!result.ok) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result.body, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const limit = rateLimit(`time-tick:${user.id}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'aguarde alguns segundos' }, { status: 429 });

  let seconds = 30;
  try {
    const payload = (await request.json()) as { seconds?: number };
    if (typeof payload?.seconds === 'number' && Number.isFinite(payload.seconds)) {
      seconds = Math.max(1, Math.min(120, Math.round(payload.seconds)));
    }
  } catch {
    /* corpo vazio → usa o intervalo padrão */
  }

  const sub = await getActiveSubscription();
  const planActive = hasActivePlan(sub?.status);

  // Plano ativo/trial não consome créditos: só devolve o saldo (e mantém o tick em dia).
  const balance = planActive ? await getTimeBalance(user.id) : await consumeTime(seconds);
  const fresh = await getActiveSubscription();

  return NextResponse.json(
    {
      remaining: balance.remaining,
      total: balance.total,
      used: balance.used,
      planActive,
      planName: fresh?.plans?.name ?? null,
      planStatus: fresh?.status ?? null,
      periodEnd: fresh?.current_period_end ?? null,
      canEdit: planActive || balance.remaining > 0,
      consumed: planActive ? 0 : seconds,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
