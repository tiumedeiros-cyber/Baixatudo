import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { effectivePayments, getSettings } from '@/lib/settings';
import { VOICES } from '@/lib/catalog/voices';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = createAdminClient();
    const { count, error } = await db.from('es_plans').select('id', { count: 'exact', head: true });
    const settings = await getSettings();
    return NextResponse.json({
      ok: !error,
      database: error ? error.message : 'connected',
      plans: count ?? 0,
      payments: effectivePayments(settings).mode,
      support: settings.general.support_mode,
      voices: VOICES.length,
      scenes: 9,
      engine: process.env.DOWNLOAD_ENGINE_URL ?? 'https://baixartudo.me',
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 });
  }
}
