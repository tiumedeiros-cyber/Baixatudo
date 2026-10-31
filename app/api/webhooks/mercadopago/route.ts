import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateSubscription, recordPayment } from '@/lib/payments';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'webhook não configurado' }, { status: 503 });

  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* body opcional */
  }

  const type = String(body.type ?? url.searchParams.get('type') ?? '');
  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const paymentId = String(data.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  if (!paymentId) return NextResponse.json({ received: true, ignored: true });
  if (type && type !== 'payment' && type !== 'subscription_authorized_payment') {
    return NextResponse.json({ received: true, ignored: true });
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'pagamento não encontrado' }, { status: 404 });
  const payment = (await res.json()) as Record<string, unknown>;

  const admin = createAdminClient();
  const eventId = `mp:${paymentId}`;
  const { error: dupError } = await admin.from('es_webhook_events').insert({ id: eventId, gateway: 'mercadopago', payload: payment });
  if (dupError) return NextResponse.json({ received: true, duplicated: true });

  const status = String(payment.status ?? '');
  const externalRef = String(payment.external_reference ?? '');
  const [userId, planId, cycle] = externalRef.split('|');
  if (!userId || !planId) return NextResponse.json({ received: true, ignored: 'sem referência' });

  if (status === 'approved') {
    const subId = await activateSubscription({
      userId,
      planId,
      cycle: (cycle as 'monthly' | 'yearly') ?? 'monthly',
      gateway: 'mercadopago',
      gatewayRef: String(payment.id ?? paymentId),
    });
    await recordPayment({
      userId,
      planId,
      subscriptionId: subId,
      amount: Number(payment.transaction_amount ?? 0),
      status: 'approved',
      gateway: 'mercadopago',
      gatewayPaymentId: String(payment.id ?? paymentId),
      metadata: { method: payment.payment_method_id, cycle },
    });
  } else if (['rejected', 'cancelled'].includes(status)) {
    await recordPayment({
      userId,
      planId,
      amount: Number(payment.transaction_amount ?? 0),
      status: 'refused',
      gateway: 'mercadopago',
      gatewayPaymentId: String(payment.id ?? paymentId),
      metadata: { status },
    });
  }

  return NextResponse.json({ received: true });
}
