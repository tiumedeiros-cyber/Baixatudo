'use server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import {
  activateSubscription,
  createMercadoPagoHoursPreference,
  createMercadoPagoPreference,
  createStripeCheckout,
  createStripeHoursCheckout,
  cycleAmount,
  recordPayment,
  riskAssessment,
} from '@/lib/payments';
import { findHourPack, grantTime } from '@/lib/time';
import type { Plan } from '@/lib/types';

export async function createCheckout(input: {
  planSlug: string;
  cycle: 'monthly' | 'yearly';
  method: 'card' | 'pix';
}): Promise<{ ok?: boolean; url?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const supabase = await createSupabaseServerClient();
  const { data: planRow } = await supabase.from('es_plans').select('*').eq('slug', input.planSlug).eq('is_active', true).maybeSingle();
  if (!planRow) return { error: 'Plano não encontrado.' };
  const plan = planRow as unknown as Plan;
  const amount = cycleAmount(plan, input.cycle);
  const admin = createAdminClient();

  const { count: recent } = await admin
    .from('es_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const risk = riskAssessment({ email: user.email ?? '', amount, recentPayments: recent ?? 0 });

  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const session = await createStripeCheckout({ plan, cycle: input.cycle, userId: user.id, email: user.email ?? '', amount });
      await recordPayment({
        userId: user.id,
        planId: plan.id,
        amount,
        status: 'pending',
        gateway: 'stripe',
        gatewayPaymentId: session.id ?? null,
        riskScore: risk.score,
        riskFlags: risk.flags,
        metadata: { cycle: input.cycle, checkout_url: session.url },
      });
      return { url: session.url };
    }

    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const pref = await createMercadoPagoPreference({ plan, cycle: input.cycle, userId: user.id, email: user.email ?? '', amount });
      await recordPayment({
        userId: user.id,
        planId: plan.id,
        amount,
        status: 'pending',
        gateway: 'mercadopago',
        gatewayPaymentId: pref.id ?? null,
        riskScore: risk.score,
        riskFlags: risk.flags,
        metadata: { cycle: input.cycle, init_point: pref.init_point },
      });
      return { url: pref.init_point };
    }

    // Modo demonstração: registra cobrança e ativa imediatamente.
    if (risk.score >= 80) {
      await recordPayment({
        userId: user.id,
        planId: plan.id,
        amount,
        status: 'refused',
        gateway: 'demo',
        riskScore: risk.score,
        riskFlags: risk.flags,
      });
      return { error: 'Pagamento bloqueado pela análise antifraude. Fale com o suporte.' };
    }

    const subId = await activateSubscription({
      userId: user.id,
      planId: plan.id,
      cycle: input.cycle,
      gateway: 'demo',
    });
    await recordPayment({
      userId: user.id,
      planId: plan.id,
      subscriptionId: subId,
      amount,
      status: 'approved',
      gateway: 'demo',
      gatewayPaymentId: `demo_${Date.now()}`,
      riskScore: risk.score,
      riskFlags: risk.flags,
      metadata: { cycle: input.cycle, mode: 'demo' },
    });
    await admin.from('es_audit_logs').insert({
      user_id: user.id,
      actor_email: user.email,
      action: 'subscription_activated',
      entity: 'subscription',
      entity_id: subId,
      meta: { plan: plan.slug, cycle: input.cycle, gateway: 'demo', site: SITE_URL },
    });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao processar pagamento.' };
  }
}

export async function goToCheckout(slug: string) {
  redirect(`/checkout/${slug}`);
}

/* ------------------------------ Plano por hora ------------------------------ */

/**
 * Compra de horas avulsas (plano por hora).
 * - Sem gateway configurado (modo demo): o tempo é liberado na hora.
 * - Stripe/Mercado Pago: cria a cobrança e o tempo é liberado pelo webhook,
 *   sempre com referência idempotente para não duplicar horas.
 */
export async function purchaseHours(packSlug: string): Promise<{ ok?: boolean; url?: string; error?: string; remaining?: number }> {
  const user = await getSessionUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const pack = findHourPack(packSlug);
  if (!pack) return { error: 'Pacote de horas não encontrado.' };

  const admin = createAdminClient();
  const { count: recent } = await admin
    .from('es_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const risk = riskAssessment({ email: user.email ?? '', amount: pack.price, recentPayments: recent ?? 0 });

  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const session = await createStripeHoursCheckout({ pack, userId: user.id, email: user.email ?? '' });
      await recordPayment({
        userId: user.id,
        planId: null,
        amount: pack.price,
        status: 'pending',
        gateway: 'stripe',
        gatewayPaymentId: session.id ?? null,
        riskScore: risk.score,
        riskFlags: risk.flags,
        metadata: { kind: 'hours', pack: pack.slug, hours: pack.hours, checkout_url: session.url },
      });
      return { url: session.url };
    }

    if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const pref = await createMercadoPagoHoursPreference({ pack, userId: user.id, email: user.email ?? '' });
      await recordPayment({
        userId: user.id,
        planId: null,
        amount: pack.price,
        status: 'pending',
        gateway: 'mercadopago',
        gatewayPaymentId: pref.id ?? null,
        riskScore: risk.score,
        riskFlags: risk.flags,
        metadata: { kind: 'hours', pack: pack.slug, hours: pack.hours, init_point: pref.init_point },
      });
      return { url: pref.init_point };
    }

    if (risk.score >= 80) {
      await recordPayment({
        userId: user.id,
        planId: null,
        amount: pack.price,
        status: 'refused',
        gateway: 'demo',
        riskScore: risk.score,
        riskFlags: risk.flags,
        metadata: { kind: 'hours', pack: pack.slug },
      });
      return { error: 'Pagamento bloqueado pela análise antifraude. Fale com o suporte.' };
    }

    await recordPayment({
      userId: user.id,
      planId: null,
      amount: pack.price,
      status: 'approved',
      gateway: 'demo',
      gatewayPaymentId: `demo_horas_${Date.now()}`,
      riskScore: risk.score,
      riskFlags: risk.flags,
      metadata: { kind: 'hours', pack: pack.slug, hours: pack.hours, mode: 'demo' },
    });
    const balance = await grantTime({
      userId: user.id,
      hours: pack.hours,
      kind: 'purchase',
      note: `Compra de ${pack.label} (modo demo)`,
      grantedBy: user.id,
      reference: `demo:${user.id}:${pack.slug}:${Date.now()}`,
    });
    await admin.from('es_audit_logs').insert({
      user_id: user.id,
      actor_email: user.email,
      action: 'time_purchased',
      entity: 'time_credit',
      entity_id: user.id,
      meta: { pack: pack.slug, hours: pack.hours, gateway: 'demo' },
    });
    return { ok: true, remaining: balance.remaining };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao processar a compra de horas.' };
  }
}
