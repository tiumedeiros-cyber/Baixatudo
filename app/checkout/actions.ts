'use server';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import {
  createMercadoPagoHoursPreference,
  createMercadoPagoPreference,
  createStripeCheckout,
  createStripeHoursCheckout,
  cycleAmount,
  recordPayment,
  riskAssessment,
} from '@/lib/payments';
import { findHourPack } from '@/lib/time';
import type { Plan } from '@/lib/types';
import { brl } from '@/lib/utils';

export async function createCheckout(input: {
  planSlug: string;
  cycle: 'monthly' | 'yearly';
  method: 'card' | 'pix';
}): Promise<{
  ok?: boolean;
  url?: string;
  error?: string;
  /** pedido registrado aguardando pagamento/aprovação — NÃO libera o plano */
  pending?: boolean;
  manual?: {
    paymentId?: string;
    amount?: number;
    label?: string;
    instructions?: string;
    pixKey?: string;
    pixHolder?: string;
    whatsapp?: string;
    email?: string;
  };
}> {
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

    // Sem gateway configurado: NADA é ativado. Registra um pedido manual (PIX)
    // que só vira plano depois do comprovante aprovado pelo admin
    // (Admin → Pagamentos → aprovar) ou por webhook assinado do gateway.
    if (risk.score >= 80) {
      await recordPayment({
        userId: user.id,
        planId: plan.id,
        amount,
        status: 'refused',
        gateway: 'manual',
        riskScore: risk.score,
        riskFlags: risk.flags,
      });
      return { error: 'Pagamento bloqueado pela análise antifraude. Fale com o suporte.' };
    }

    const manual = await startManualPayment({ kind: 'plan', slug: plan.slug, cycle: input.cycle });
    if (manual.error) return { error: manual.error };
    await admin.from('es_audit_logs').insert({
      user_id: user.id,
      actor_email: user.email,
      action: 'checkout_requested',
      entity: 'payment',
      entity_id: manual.paymentId ?? null,
      meta: { plan: plan.slug, cycle: input.cycle, gateway: 'manual', site: SITE_URL },
    });
    return { pending: true, manual };
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
export async function purchaseHours(
  packSlug: string,
): Promise<{ ok?: boolean; url?: string; error?: string; remaining?: number; pending?: boolean; manual?: Record<string, unknown> }> {
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

    // Sem gateway: horas só entram depois da aprovação do comprovante (admin).
    const manual = await startManualPayment({ kind: 'hours', slug: pack.slug });
    if (manual.error) return { error: manual.error };
    return { pending: true, manual: { ...manual } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Falha ao processar a compra de horas.' };
  }
}

/* ---------------------------- Pagamento manual (PIX) ---------------------------- */

/**
 * Abre um pedido de pagamento manual: registra a cobrança como "pendente" e
 * devolve as instruções + link do WhatsApp com a mensagem do comprovante pronta.
 * O acesso é liberado pelo admin em Pagamentos (ou pelo WhatsApp do suporte).
 */
export async function startManualPayment(input: {
  kind: 'plan' | 'hours';
  slug: string;
  cycle?: 'monthly' | 'yearly';
}): Promise<{
  ok?: boolean;
  error?: string;
  paymentId?: string;
  amount?: number;
  label?: string;
  instructions?: string;
  pixKey?: string;
  pixHolder?: string;
  whatsapp?: string;
  email?: string;
}> {
  const user = await getSessionUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const { getSettings, receiptLink } = await import('@/lib/settings');
  const settings = await getSettings();
  const pay = settings.payments;

  const admin = createAdminClient();
  let amount = 0;
  let label = '';
  let planId: string | null = null;

  if (input.kind === 'plan') {
    const { data: planRow } = await admin.from('es_plans').select('*').eq('slug', input.slug).eq('is_active', true).maybeSingle();
    if (!planRow) return { error: 'Plano não encontrado.' };
    const cycle = input.cycle ?? 'monthly';
    amount = cycle === 'yearly' ? Number(planRow.price_yearly) : Number(planRow.price_monthly);
    label = `Plano ${planRow.name} (${cycle === 'yearly' ? 'anual' : 'mensal'})`;
    planId = planRow.id as string;
  } else {
    const { findHourPack } = await import('@/lib/time');
    const pack = findHourPack(input.slug);
    if (!pack) return { error: 'Pacote de horas não encontrado.' };
    amount = pack.price;
    label = pack.label;
  }

  const paymentId = await recordPayment({
    userId: user.id,
    planId,
    amount,
    status: 'pending',
    gateway: 'manual',
    riskScore: 0,
    riskFlags: [],
    metadata: {
      kind: input.kind,
      slug: input.slug,
      cycle: input.cycle ?? 'monthly',
      label,
      mode: 'manual',
      awaiting: 'comprovante',
    },
  });

  const shortId = paymentId ? paymentId.slice(0, 8).toUpperCase() : '—';
  const message = `Olá! Sou ${user.email}. Fiz o pagamento de ${brl(amount)} referente a ${label} (pedido ${shortId}). Segue o comprovante:`;
  const whatsapp = receiptLink(settings, message);

  return {
    ok: true,
    paymentId: paymentId ?? undefined,
    amount,
    label,
    instructions: pay.manual_instructions,
    pixKey: pay.pix_key,
    pixHolder: pay.pix_holder,
    whatsapp,
    email: settings.general.support_email,
  };
}
