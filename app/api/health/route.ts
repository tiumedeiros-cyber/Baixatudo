import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = createAdminClient();
    const { count, error } = await db.from('es_plans').select('id', { count: 'exact', head: true });
    return NextResponse.json({
      ok: !error,
      database: error ? error.message : 'connected',
      plans: count ?? 0,
      payments: process.env.STRIPE_SECRET_KEY ? 'stripe' : process.env.MERCADOPAGO_ACCESS_TOKEN ? 'mercadopago' : 'demo',
      engine: process.env.DOWNLOAD_ENGINE_URL ?? 'https://baixartudo.me',
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 });
  }
}
