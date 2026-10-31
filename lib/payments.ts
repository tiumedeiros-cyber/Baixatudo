import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/env';
import type { Plan } from '@/lib/types';

export function cycleAmount(plan: Plan, cycle: 'monthly' | 'yearly') {
  return cycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly);
}

export async function activateSubscription(opts: {
  userId: string;
  planId: string;
  cycle: 'monthly' | 'yearly';
  gateway: 'stripe' | 'mercadopago' | 'demo' | 'manual';
  gatewayRef?: string | null;
  paymentId?: string | null;
}) {
  const admin = createAdminClient();
  const days = opts.cycle === 'yearly' ? 365 : 30;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data: existing } = await admin
    .from('es_subscriptions')
    .select('id')
    .eq('user_id', opts.userId)
    .in('status', ['trial', 'active', 'past_due'])
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from('es_subscriptions')
      .update({
        plan_id: opts.planId,
        status: 'active',
        billing_cycle: opts.cycle,
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        cancel_at_period_end: false,
        gateway: opts.gateway,
        gateway_ref: opts.gatewayRef ?? null,
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created } = await admin
    .from('es_subscriptions')
    .insert({
      user_id: opts.userId,
      plan_id: opts.planId,
      status: 'active',
      billing_cycle: opts.cycle,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      gateway: opts.gateway,
      gateway_ref: opts.gatewayRef ?? null,
    })
    .select('id')
    .single();
  return created?.id ?? null;
}

export async function recordPayment(opts: {
  userId: string;
  planId: string | null;
  subscriptionId?: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'refused' | 'refunded';
  gateway: 'stripe' | 'mercadopago' | 'demo' | 'manual';
  gatewayPaymentId?: string | null;
  riskScore?: number;
  riskFlags?: string[];
  metadata?: Record<string, unknown>;
  id?: string;
}) {
  const admin = createAdminClient();
  const payload = {
    user_id: opts.userId,
    plan_id: opts.planId,
    subscription_id: opts.subscriptionId ?? null,
    amount: opts.amount,
    status: opts.status,
    gateway: opts.gateway,
    gateway_payment_id: opts.gatewayPaymentId ?? null,
    risk_score: opts.riskScore ?? 0,
    risk_flags: opts.riskFlags ?? [],
    metadata: opts.metadata ?? {},
    paid_at: opts.status === 'approved' ? new Date().toISOString() : null,
  };
  if (opts.id) {
    const { data } = await admin.from('es_payments').update(payload).eq('id', opts.id).select('id').single();
    return data?.id ?? opts.id;
  }
  const { data } = await admin.from('es_payments').insert(payload).select('id').single();
  return data?.id ?? null;
}

/** Score simples de antifraude: velocidade, e-mail descartável, país do cartão, valor atípico. */
export function riskAssessment(opts: { email: string; amount: number; attempts?: number; recentPayments?: number }) {
  const flags: string[] = [];
  let score = 0;
  const domain = opts.email.split('@')[1] ?? '';
  if (/(mailinator|tempmail|guerrilla|yopmail|10minutemail)/i.test(domain)) {
    flags.push('email_descartavel');
    score += 40;
  }
  if ((opts.recentPayments ?? 0) > 3) {
    flags.push('muitas_tentativas');
    score += 25;
  }
  if ((opts.attempts ?? 0) > 2) {
    flags.push('retentativas');
    score += 15;
  }
  if (opts.amount > 1500) {
    flags.push('valor_alto');
    score += 10;
  }
  if (!domain.includes('.')) {
    flags.push('email_invalido');
    score += 20;
  }
  return { score: Math.min(100, score), flags };
}

export async function createStripeCheckout(opts: {
  plan: Plan;
  cycle: 'monthly' | 'yearly';
  userId: string;
  email: string;
  amount: number;
}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe não configurado');
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('success_url', `${SITE_URL}/dashboard/assinatura?pagamento=aprovado`);
  body.set('cancel_url', `${SITE_URL}/dashboard/assinatura?pagamento=cancelado`);
  body.set('client_reference_id', opts.userId);
  body.set('customer_email', opts.email);
  body.set('metadata[user_id]', opts.userId);
  body.set('metadata[plan_id]', opts.plan.id);
  body.set('metadata[cycle]', opts.cycle);
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', 'brl');
  body.set('line_items[0][price_data][unit_amount]', String(Math.round(opts.amount * 100)));
  body.set('line_items[0][price_data][recurring][interval]', opts.cycle === 'yearly' ? 'year' : 'month');
  body.set('line_items[0][price_data][product_data][name]', `Editor Studio · ${opts.plan.name}`);
  body.set('subscription_data[metadata][user_id]', opts.userId);
  body.set('subscription_data[metadata][plan_id]', opts.plan.id);
  body.set('subscription_data[metadata][cycle]', opts.cycle);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!res.ok || !data.url) throw new Error(data.error?.message || 'Falha ao criar checkout Stripe');
  return data;
}

export async function createMercadoPagoPreference(opts: {
  plan: Plan;
  cycle: 'monthly' | 'yearly';
  userId: string;
  email: string;
  amount: number;
}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('Mercado Pago não configurado');
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: `Editor Studio · ${opts.plan.name} (${opts.cycle === 'yearly' ? 'anual' : 'mensal'})`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(opts.amount.toFixed(2)),
        },
      ],
      payer: { email: opts.email },
      external_reference: `${opts.userId}|${opts.plan.id}|${opts.cycle}`,
      back_urls: {
        success: `${SITE_URL}/dashboard/assinatura?pagamento=aprovado`,
        failure: `${SITE_URL}/dashboard/assinatura?pagamento=recusado`,
        pending: `${SITE_URL}/dashboard/assinatura?pagamento=pendente`,
      },
      auto_return: 'approved',
      notification_url: `${SITE_URL}/api/webhooks/mercadopago`,
    }),
  });
  const data = (await res.json()) as { init_point?: string; id?: string; message?: string };
  if (!res.ok || !data.init_point) throw new Error(data.message || 'Falha ao criar preferência Mercado Pago');
  return data;
}

/* --------------------------- Plano por hora (avulso) --------------------------- */

/** Checkout Stripe de pagamento único para pacotes de horas. */
export async function createStripeHoursCheckout(opts: {
  pack: { slug: string; hours: number; price: number; label: string };
  userId: string;
  email: string;
}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe não configurado');
  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', `${SITE_URL}/dashboard/assinatura?horas=aprovado`);
  body.set('cancel_url', `${SITE_URL}/checkout/hora?horas=cancelado`);
  body.set('client_reference_id', opts.userId);
  body.set('customer_email', opts.email);
  body.set('metadata[kind]', 'hours');
  body.set('metadata[user_id]', opts.userId);
  body.set('metadata[pack]', opts.pack.slug);
  body.set('metadata[hours]', String(opts.pack.hours));
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', 'brl');
  body.set('line_items[0][price_data][unit_amount]', String(Math.round(opts.pack.price * 100)));
  body.set('line_items[0][price_data][product_data][name]', `Editor Studio · ${opts.pack.label} de edição`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as { url?: string; id?: string; error?: { message: string } };
  if (!res.ok || !data.url) throw new Error(data.error?.message || 'Falha ao criar checkout Stripe');
  return data;
}

/** Preferência Mercado Pago para pacotes de horas. */
export async function createMercadoPagoHoursPreference(opts: {
  pack: { slug: string; hours: number; price: number; label: string };
  userId: string;
  email: string;
}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('Mercado Pago não configurado');
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: `Editor Studio · ${opts.pack.label} de edição`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(opts.pack.price.toFixed(2)),
        },
      ],
      payer: { email: opts.email },
      external_reference: `hours|${opts.userId}|${opts.pack.slug}|${opts.pack.hours}`,
      back_urls: {
        success: `${SITE_URL}/dashboard/assinatura?horas=aprovado`,
        failure: `${SITE_URL}/checkout/hora?horas=recusado`,
        pending: `${SITE_URL}/checkout/hora?horas=pendente`,
      },
      auto_return: 'approved',
      notification_url: `${SITE_URL}/api/webhooks/mercadopago`,
    }),
  });
  const data = (await res.json()) as { init_point?: string; id?: string; message?: string };
  if (!res.ok || !data.init_point) throw new Error(data.message || 'Falha ao criar preferência Mercado Pago');
  return data;
}
