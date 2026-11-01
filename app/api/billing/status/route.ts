import { NextResponse } from 'next/server';
import { getActiveSubscription, getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { effectivePayments, getSettings } from '@/lib/settings';
import type { Plan } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/status → Free/Pro do usuário + catálogo de planos.
 *
 * Usado pelo SubscriptionContext (editor, painéis com cadeado). Só leitura:
 * nada de cobrança aqui. Cache curto porque o valor muda raramente.
 */
export async function GET() {
  const user = await getSessionUser();
  const settings = await getSettings();
  const pay = effectivePayments(settings);

  const supabase = await createSupabaseServerClient();
  const { data: plans } = await supabase
    .from('es_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  const summaries = ((plans ?? []) as unknown as Plan[]).map((plan, index, all) => ({
    slug: plan.slug,
    name: plan.name,
    description: plan.description ?? '',
    priceMonthly: Number(plan.price_monthly),
    priceYearly: Number(plan.price_yearly),
    features: Array.isArray(plan.features) ? plan.features.slice(0, 8) : [],
    flags: {
      premiumLibrary: Boolean(plan.limits?.premium_library),
      export4k: Boolean(plan.limits?.export_4k),
      maxQuality: Number(plan.limits?.max_quality ?? 1080),
      projects: Number(plan.limits?.projects ?? 3),
      storageGb: Number(plan.limits?.storage_gb ?? 1),
      unlimited: Boolean(plan.limits?.unlimited),
    },
    featured: index === Math.min(1, all.length - 1) && Boolean(plan.limits?.premium_library),
  }));

  const gateway: 'stripe' | 'mercadopago' | 'manual' | 'off' =
    pay.mode === 'stripe' && process.env.STRIPE_SECRET_KEY
      ? 'stripe'
      : pay.mode === 'mercadopago' && process.env.MERCADOPAGO_ACCESS_TOKEN
        ? 'mercadopago'
        : pay.mode === 'manual'
          ? 'manual'
          : 'off';

  if (!user) {
    return NextResponse.json(
      {
        signedIn: false,
        status: 'none',
        planSlug: 'free',
        planName: 'Free',
        isPro: false,
        cycle: null,
        renewsAt: null,
        flags: { premiumLibrary: false, export4k: false, maxQuality: 1080, projects: 3, storageGb: 1, unlimited: false },
        plans: summaries,
        gateway,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const sub = await getActiveSubscription();
  const limits = sub?.plans?.limits;
  const active = sub && ['trial', 'active', 'past_due'].includes(sub.status as string);

  return NextResponse.json(
    {
      signedIn: true,
      status: (sub?.status ?? 'none') as string,
      planSlug: sub?.plans?.slug ?? 'free',
      planName: sub?.plans?.name ?? 'Free',
      isPro: Boolean(active && limits?.premium_library),
      cycle: sub?.billing_cycle ?? null,
      renewsAt: sub?.current_period_end ?? null,
      flags: {
        premiumLibrary: Boolean(limits?.premium_library),
        export4k: Boolean(limits?.export_4k),
        maxQuality: Number(limits?.max_quality ?? 1080),
        projects: Number(limits?.projects ?? 3),
        storageGb: Number(limits?.storage_gb ?? 1),
        unlimited: Boolean(limits?.unlimited),
      },
      plans: summaries,
      gateway,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
