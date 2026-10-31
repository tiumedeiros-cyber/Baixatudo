import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateSubscription, recordPayment } from '@/lib/payments';

export const runtime = 'nodejs';

function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook não configurado' }, { status: 503 });

  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 400 });
  }

  const event = JSON.parse(raw) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
  const admin = createAdminClient();

  const { error: dupError } = await admin.from('es_webhook_events').insert({
    id: `stripe:${event.id}`,
    gateway: 'stripe',
    payload: event as unknown as Record<string, unknown>,
  });
  if (dupError) return NextResponse.json({ received: true, duplicated: true });

  const obj = event.data.object as Record<string, unknown>;
  const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};

  if (event.type === 'checkout.session.completed') {
    const userId = metadata.user_id ?? (obj.client_reference_id as string | undefined);
    const planId = metadata.plan_id;
    const cycle = (metadata.cycle as 'monthly' | 'yearly') ?? 'monthly';
    if (userId && planId) {
      const subId = await activateSubscription({
        userId,
        planId,
        cycle,
        gateway: 'stripe',
        gatewayRef: (obj.subscription as string) ?? (obj.id as string),
      });
      await recordPayment({
        userId,
        planId,
        subscriptionId: subId,
        amount: Number(obj.amount_total ?? 0) / 100,
        status: 'approved',
        gateway: 'stripe',
        gatewayPaymentId: obj.id as string,
        metadata: { cycle, session: obj.id },
      });
      await admin.from('es_audit_logs').insert({
        user_id: userId,
        action: 'payment_approved',
        entity: 'payment',
        entity_id: obj.id as string,
        meta: { gateway: 'stripe', plan_id: planId },
      });
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const userId = metadata.user_id;
    if (userId) {
      await admin.from('es_subscriptions').update({ status: 'past_due' }).eq('user_id', userId).eq('status', 'active');
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const userId = metadata.user_id;
    if (userId) {
      await admin.from('es_subscriptions').update({ status: 'canceled' }).eq('user_id', userId).in('status', ['active', 'past_due']);
    }
  }

  return NextResponse.json({ received: true });
}
