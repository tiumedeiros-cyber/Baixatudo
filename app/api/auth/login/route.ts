import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureProfile, isAdminEmail } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FRIENDLY: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
};

/**
 * POST /api/auth/login — login feito no servidor.
 *
 * Motivo: o roteamento (admin → /admin, cliente → /dashboard) não pode depender
 * da leitura de `es_profiles` no navegador (RLS/perfil ausente mandava o admin
 * para a área do cliente). Aqui o servidor decide, cria o perfil que faltar e,
 * quando a senha informada é a do ADMIN_PASSWORD do ambiente, garante que o
 * usuário administrador exista no Supabase Auth com essa senha.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`login:${clientIp(request.headers)}`, 12, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const usingAdminSecret = isAdminEmail(email) && Boolean(adminPassword) && password === adminPassword;

  // Senha do administrador do ambiente: sincroniza o usuário no Supabase Auth
  // para que o acesso nunca fique travado por senha divergente.
  if (usingAdminSecret) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin.from('es_profiles').select('id').ilike('email', adminEmail).maybeSingle();
      let userId = (profile?.id as string | undefined) ?? null;

      if (!userId) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = list?.users?.find((u) => (u.email || '').toLowerCase() === adminEmail)?.id ?? null;
      }

      if (userId) {
        await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
        await ensureProfile({ id: userId, email: adminEmail });
      } else {
        const { data: created } = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
        if (created?.user) await ensureProfile({ id: created.user.id, email: adminEmail });
      }
    } catch {
      /* segue para a tentativa normal de login */
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json(
      { error: FRIENDLY[error.message] ?? error.message },
      { status: 401 },
    );
  }

  let destination = usingAdminSecret || isAdminEmail(email) ? '/admin' : '/dashboard';
  try {
    const profile = await ensureProfile({ id: data.user.id, email: data.user.email });
    if (profile?.role === 'admin') destination = '/admin';
  } catch {
    /* sem perfil: mantém o destino calculado */
  }

  return NextResponse.json({ ok: true, destination, role: destination === '/admin' ? 'admin' : 'client' });
}
