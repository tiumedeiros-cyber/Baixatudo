import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureProfile } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/status — checagem do acesso administrativo.
 * Não expõe senhas: só confirma se o ambiente está configurado, se o usuário
 * existe no Auth e qual é o papel gravado em `es_profiles`.
 *
 * `?fix=1` aplica a mesma sincronização do login (garante a senha do ambiente e
 * o papel admin) e devolve o resultado — útil para destravar o painel.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`authstatus:${clientIp(request.headers)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'aguarde' }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const fix = searchParams.get('fix') === '1';
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminConfigured = Boolean(adminEmail);
  const passwordConfigured = Boolean(process.env.ADMIN_PASSWORD);

  if (!adminConfigured) {
    return NextResponse.json({ ok: false, adminConfigured, passwordConfigured, error: 'ADMIN_EMAIL ausente no ambiente.' });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('es_profiles')
    .select('id,email,role,status')
    .ilike('email', adminEmail)
    .maybeSingle();

  let authUserId: string | null = null;
  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authUserId = list?.users?.find((u) => (u.email || '').toLowerCase() === adminEmail)?.id ?? null;
  } catch {
    authUserId = null;
  }

  let fixed: { passwordSynced: boolean; profileRole: string | null; error?: string } | null = null;
  if (fix) {
    const password = process.env.ADMIN_PASSWORD || '';
    try {
      let userId = (profile?.id as string | undefined) ?? authUserId;
      if (userId && password) {
        await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      }
      if (!userId) {
        const created = password
          ? await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })
          : { data: null, error: null };
        userId = (created.data as { user?: { id: string } } | null)?.user?.id ?? null;
      }
      const ensured = userId ? await ensureProfile({ id: userId, email: adminEmail }) : null;
      fixed = { passwordSynced: Boolean(password) && Boolean(userId), profileRole: ensured?.role ?? null };
    } catch (err) {
      fixed = { passwordSynced: false, profileRole: null, error: err instanceof Error ? err.message : 'erro' };
    }
  }

  return NextResponse.json({
    ok: true,
    adminConfigured,
    passwordConfigured,
    authUserExists: Boolean(authUserId),
    profileExists: Boolean(profile),
    profileRole: (profile?.role as string | undefined) ?? null,
    profileStatus: (profile?.status as string | undefined) ?? null,
    loginEnter: '/api/auth/login',
    destination: '/admin',
    fixed,
  });
}
