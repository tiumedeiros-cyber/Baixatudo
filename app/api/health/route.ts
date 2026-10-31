import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('probe') === 'extension') {
    const origin = url.origin;
    const probe: Record<string, unknown> = {};
    try {
      const res = await fetch(`${origin}/baixa-tudo-extensao.zip`, { method: 'HEAD' });
      probe.head = res.status;
      probe.contentType = res.headers.get('content-type');
      probe.length = res.headers.get('content-length');
    } catch (err) {
      probe.headError = err instanceof Error ? err.message : String(err);
    }
    try {
      const buf = await readFile(path.join(process.cwd(), 'public', 'baixa-tudo-extensao.zip'));
      probe.fsBytes = buf.byteLength;
    } catch (err) {
      probe.fsError = err instanceof Error ? err.message : String(err);
    }
    return NextResponse.json(probe);
  }

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
