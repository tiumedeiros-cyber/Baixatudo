import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_ENV } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Setup inicial: garante que exista um administrador.
 * Protegido por BOOTSTRAP_ENABLED + APP_SECRET. Deve ser desativado após o uso.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-bootstrap-token') || '';
  if (APP_ENV.bootstrapEnabled !== 'true') {
    return NextResponse.json({ error: 'bootstrap desativado' }, { status: 403 });
  }
  if (token !== APP_ENV.appSecret) {
    return NextResponse.json({ error: 'token inválido' }, { status: 401 });
  }

  const email = (url.searchParams.get('email') || process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email) return NextResponse.json({ error: 'ADMIN_EMAIL ausente' }, { status: 400 });

  const db = createAdminClient();
  const { data: existing } = await db.from('es_profiles').select('id, role').eq('email', email).maybeSingle();
  let userId = existing?.id as string | undefined;
  let created = false;

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: password || undefined,
      email_confirm: true,
      user_metadata: { full_name: 'Administrador' },
    });
    if (error && !error.message.includes('already')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    userId = data?.user?.id;
    created = Boolean(userId);
  }

  if (!userId) {
    const { data: list } = await db.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
  }
  if (!userId) return NextResponse.json({ error: 'usuário não encontrado' }, { status: 404 });

  if (password) {
    await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }

  const { error: profileError } = await db
    .from('es_profiles')
    .upsert({ id: userId, email, role: 'admin', status: 'active', full_name: 'Administrador' });
  if (profileError) {
    return NextResponse.json({ error: `perfil: ${profileError.message}` }, { status: 500 });
  }
  const { data: profile } = await db.from('es_profiles').select('role').eq('id', userId).maybeSingle();

  const checks = await Promise.all([
    db.from('es_plans').select('id', { count: 'exact', head: true }),
    db.from('es_assets').select('id', { count: 'exact', head: true }),
    db.from('es_settings').select('key', { count: 'exact', head: true }),
  ]);

  return NextResponse.json({
    ok: true,
    admin: email,
    created,
    role: profile?.role ?? 'desconhecido',
    plans: checks[0].count ?? 0,
    assets: checks[1].count ?? 0,
    settings: checks[2].count ?? 0,
    passwordUpdated: Boolean(password),
  });
}
